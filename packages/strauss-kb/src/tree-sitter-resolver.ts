import { createHash } from "node:crypto";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query, type Node, type Tree } from "web-tree-sitter";
import type {
  AnchorResolver,
  ResolvedSymbol,
  ResolverAttempt,
} from "./anchor-resolver.js";

/**
 * AST-backed anchor resolution: a symbol resolves to the byte range of the
 * definition node that declares it, or to nothing.
 *
 * `resolve` stays synchronous because the read path resolves inside a loop;
 * grammar loading is the async part and happens once, in `prepare`.
 */

/** Which grammar a file extension is parsed with. */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
  ".rs": "rust",
};

export const TREE_SITTER_LANGUAGES = [
  ...new Set(Object.values(LANGUAGE_BY_EXTENSION)),
];

/** Grammar for a path, or `undefined` when the extension has none. */
export function languageForFile(file: string): string | undefined {
  return LANGUAGE_BY_EXTENSION[extname(file).toLowerCase()];
}

/**
 * `tags.scm`-style definition queries, one per grammar.
 *
 * Only declaration sites are captured, never call or reference sites — an
 * anchor names where a symbol is defined. TypeScript overload *signatures*
 * are left out for the same reason: they would make every overloaded method
 * ambiguous against its own implementation.
 *
 * `@scope.*` participates in a symbol's enclosing chain without being a
 * resolvable target itself; `impl Foo` scopes `Foo::cancel` but is not `Foo`.
 */
const JS_DEFINITIONS = `
(function_declaration name: (identifier) @name) @definition.function
(generator_function_declaration name: (identifier) @name) @definition.function
(method_definition name: (property_identifier) @name) @definition.method
(class_declaration name: (identifier) @name) @definition.class
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression) (class)])) @definition.function
(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression) (class)])) @definition.function
`;

const TS_DEFINITIONS = `
(function_declaration name: (identifier) @name) @definition.function
(generator_function_declaration name: (identifier) @name) @definition.function
(method_definition name: (property_identifier) @name) @definition.method
(class_declaration name: (type_identifier) @name) @definition.class
(abstract_class_declaration name: (type_identifier) @name) @definition.class
(interface_declaration name: (type_identifier) @name) @definition.interface
(type_alias_declaration name: (type_identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.enum
(public_field_definition name: (property_identifier) @name) @definition.field
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression) (class)])) @definition.function
(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression) (class)])) @definition.function
`;

const DEFINITION_QUERIES: Record<string, string> = {
  javascript: JS_DEFINITIONS,
  typescript: TS_DEFINITIONS,
  tsx: TS_DEFINITIONS,
  python: `
(class_definition name: (identifier) @name) @definition.class
(function_definition name: (identifier) @name) @definition.function
(decorated_definition
  definition: [(function_definition name: (identifier) @name)
               (class_definition name: (identifier) @name)]) @definition.decorated
`,
  go: `
(function_declaration name: (identifier) @name) @definition.function
(method_declaration name: (field_identifier) @name) @definition.method
(type_declaration (type_spec name: (type_identifier) @name)) @definition.type
`,
  rust: `
(function_item name: (identifier) @name) @definition.function
(struct_item name: (type_identifier) @name) @definition.struct
(enum_item name: (type_identifier) @name) @definition.enum
(trait_item name: (type_identifier) @name) @definition.trait
(mod_item name: (identifier) @name) @definition.module
(impl_item type: (type_identifier) @name) @scope.impl
`,
};

/**
 * Grammar WASM lives beside the package, not beside the compiled entry point:
 * `dist/index.js` and `src/tree-sitter-resolver.ts` are both one level under
 * the package root, so `../grammars` is the same directory either way. tsup's
 * `shims` option makes `import.meta.url` work in the CJS output too.
 */
export function defaultGrammarsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "grammars");
}

/** How many parsed trees to keep. Trees are large; anchors cluster in few files. */
const TREE_CACHE_LIMIT = 32;

type Loaded = { language: Language; query: Query };

/** A definition site, with the node whose range becomes the anchor span. */
type Definition = {
  node: Node;
  name: string;
  /** `false` for chain-only scopes such as a Rust `impl` block. */
  target: boolean;
};

type ParsedFile = {
  tree: Tree;
  /** Definitions by node id, for walking a node's enclosing chain. */
  byNodeId: Map<number, Definition>;
  definitions: Definition[];
};

export type TreeSitterStats = { parses: number; cacheHits: number };

export class TreeSitterResolver implements AnchorResolver {
  readonly name = "tree-sitter";

  private readonly grammarsDir: string;
  private readonly loaded = new Map<string, Loaded | null>();
  private readonly trees = new Map<string, ParsedFile>();
  private parser: Parser | undefined;
  private initialized = false;

  /** Cache effectiveness, for tests and for the latency numbers. */
  readonly stats: TreeSitterStats = { parses: 0, cacheHits: 0 };

  constructor(options: { grammarsDir?: string } = {}) {
    this.grammarsDir = options.grammarsDir ?? defaultGrammarsDir();
  }

  /**
   * Loads the grammars these files need, once per language per process.
   *
   * A grammar that will not load is remembered as unavailable rather than
   * retried per anchor, and never throws: a missing WASM is a finding.
   */
  async prepare(files: readonly string[]): Promise<void> {
    const wanted = new Set<string>();
    for (const file of files) {
      const language = languageForFile(file);
      if (language && !this.loaded.has(language)) wanted.add(language);
    }
    if (!wanted.size) return;

    if (!this.initialized) {
      try {
        await Parser.init();
        this.parser = new Parser();
        this.initialized = true;
      } catch {
        for (const language of wanted) this.loaded.set(language, null);
        return;
      }
    }

    for (const language of wanted) {
      this.loaded.set(language, await this.load(language));
    }
  }

  private async load(language: string): Promise<Loaded | null> {
    try {
      const grammar = await Language.load(
        join(this.grammarsDir, `tree-sitter-${language}.wasm`),
      );
      const source = DEFINITION_QUERIES[language];
      if (!source) return null;
      return { language: grammar, query: new Query(grammar, source) };
    } catch {
      return null;
    }
  }

  /**
   * Abstains on an extension with no grammar so the regex resolver gets a
   * turn; reports `resolver-unavailable` when the grammar exists in principle
   * but could not be loaded, because falling back there would silently trade a
   * precise span for a guessed one.
   */
  attempt(source: string, symbol: string, file?: string): ResolverAttempt {
    const language = file ? languageForFile(file) : undefined;
    if (!language) return { kind: "abstain" };
    if (!this.loaded.has(language)) return { kind: "abstain" };
    const loaded = this.loaded.get(language);
    if (!loaded) return { kind: "unresolved", reason: "resolver-unavailable" };

    const parsed = this.parse(language, loaded, source);
    if (!parsed) return { kind: "unresolved", reason: "resolver-unavailable" };

    const wanted = symbol.split(".").filter(Boolean);
    if (!wanted.length)
      return { kind: "unresolved", reason: "symbol-not-found" };

    const matches = parsed.definitions.filter(
      (definition) =>
        definition.target &&
        endsWith(chainOf(definition, parsed.byNodeId, language), wanted),
    );
    if (!matches.length) {
      return { kind: "unresolved", reason: "symbol-not-found" };
    }
    if (matches.length > 1) {
      return { kind: "unresolved", reason: "symbol-ambiguous" };
    }
    return { kind: "resolved", span: spanOf(matches[0] as Definition, source) };
  }

  resolve(
    source: string,
    symbol: string,
    file?: string,
  ): ResolvedSymbol | null {
    const attempt = this.attempt(source, symbol, file);
    return attempt.kind === "resolved" ? attempt.span : null;
  }

  /** Parsed trees are keyed by content hash, so an unchanged file parses once. */
  private parse(
    language: string,
    loaded: Loaded,
    source: string,
  ): ParsedFile | null {
    const key = `${language}:${createHash("sha256").update(source).digest("hex")}`;
    const cached = this.trees.get(key);
    if (cached) {
      this.stats.cacheHits += 1;
      return cached;
    }

    const parser = this.parser;
    if (!parser) return null;
    let parsed: ParsedFile;
    try {
      parser.setLanguage(loaded.language);
      const tree = parser.parse(source);
      if (!tree) return null;
      parsed = index(tree, loaded.query);
    } catch {
      return null;
    }
    this.stats.parses += 1;

    if (this.trees.size >= TREE_CACHE_LIMIT) {
      const oldest = this.trees.keys().next();
      if (!oldest.done) {
        this.trees.get(oldest.value)?.tree.delete();
        this.trees.delete(oldest.value);
      }
    }
    this.trees.set(key, parsed);
    return parsed;
  }

  /**
   * Every definition this file declares, as dotted symbol and span.
   *
   * The inverse of `attempt`: that asks "where is this name", this asks "what
   * names are here". `moved` needs the second — the stored hash has to be
   * looked for at every definition in the repository, and there is no name to
   * ask about, since the whole question is which name now carries that code.
   */
  spans(
    source: string,
    file: string,
  ): { symbol: string; span: ResolvedSymbol }[] {
    const language = languageForFile(file);
    if (!language) return [];
    const loaded = this.loaded.get(language);
    if (!loaded) return [];
    const parsed = this.parse(language, loaded, source);
    if (!parsed) return [];

    return parsed.definitions
      .filter((definition) => definition.target)
      .map((definition) => ({
        symbol: chainOf(definition, parsed.byNodeId, language).join("."),
        span: spanOf(definition, source),
      }));
  }

  /**
   * The token stream of a span: every leaf the parser sees, comments dropped,
   * joined by single spaces.
   *
   * This is what makes a reformat not be drift. Hashing it rather than the raw
   * text means indentation, line breaks, trailing commas the formatter moved,
   * and every comment above or inside the definition are outside the hash —
   * and a renamed identifier or a changed literal is still inside it, because
   * those are leaves.
   *
   * `null` when the file has no grammar, the grammar would not load, or the
   * text will not parse: no normalisation is better than a guessed one.
   */
  normalize(text: string, file?: string): string | null {
    const language = file ? languageForFile(file) : undefined;
    if (!language) return null;
    const loaded = this.loaded.get(language);
    if (!loaded) return null;

    const parser = this.parser;
    if (!parser) return null;
    let tree: Tree | null;
    try {
      parser.setLanguage(loaded.language);
      tree = parser.parse(text);
    } catch {
      return null;
    }
    if (!tree) return null;
    try {
      return tokens(tree.rootNode).join(" ");
    } finally {
      tree.delete();
    }
  }

  /** Drops cached trees. Grammars stay loaded — they are immutable. */
  reset(): void {
    for (const parsed of this.trees.values()) parsed.tree.delete();
    this.trees.clear();
    this.stats.parses = 0;
    this.stats.cacheHits = 0;
  }
}

/**
 * One definition per name site, outermost node wins.
 *
 * A Python `@decorator` puts the same name under both `function_definition`
 * and the `decorated_definition` wrapping it; the wrapper is the span a reader
 * means by "that function".
 */
function index(tree: Tree, query: Query): ParsedFile {
  const byName = new Map<number, Definition>();

  for (const match of query.matches(tree.rootNode)) {
    const nameNode = match.captures.find((capture) => capture.name === "name");
    const defNode = match.captures.find(
      (capture) =>
        capture.name.startsWith("definition.") ||
        capture.name.startsWith("scope."),
    );
    if (!nameNode || !defNode) continue;

    const candidate: Definition = {
      node: defNode.node,
      name: nameNode.node.text,
      target: defNode.name.startsWith("definition."),
    };
    const existing = byName.get(nameNode.node.id);
    if (
      existing &&
      existing.node.endIndex - existing.node.startIndex >=
        candidate.node.endIndex - candidate.node.startIndex
    ) {
      continue;
    }
    byName.set(nameNode.node.id, candidate);
  }

  const definitions = [...byName.values()];
  const byNodeId = new Map(
    definitions.map((definition) => [definition.node.id, definition]),
  );
  return { tree, byNodeId, definitions };
}

/**
 * The definition's enclosing chain, outermost first: `["OrderService",
 * "cancel"]` for a method of that class.
 *
 * Go carries the scope in the receiver rather than in an ancestor, so a
 * method on `*Server` chains as `Server.Cancel`.
 */
function chainOf(
  definition: Definition,
  byNodeId: Map<number, Definition>,
  language: string,
): string[] {
  const chain = [definition.name];

  if (language === "go" && definition.node.type === "method_declaration") {
    const receiver = definition.node.childForFieldName("receiver");
    const type = receiver && receiverTypeName(receiver);
    if (type) chain.unshift(type);
  }

  for (let node = definition.node.parent; node; node = node.parent) {
    const enclosing = byNodeId.get(node.id);
    if (enclosing && enclosing.node !== definition.node) {
      chain.unshift(enclosing.name);
    }
  }
  return chain;
}

/** `(s *Server)` and `(s Server)` both name `Server`. */
function receiverTypeName(receiver: Node): string | undefined {
  const stack: Node[] = [receiver];
  while (stack.length) {
    const node = stack.pop() as Node;
    if (node.type === "type_identifier") return node.text;
    for (let at = 0; at < node.childCount; at++) {
      const child = node.child(at);
      if (child) stack.push(child);
    }
  }
  return undefined;
}

/** Does `chain` end with every segment of `wanted`, in order? */
function endsWith(chain: string[], wanted: string[]): boolean {
  if (wanted.length > chain.length) return false;
  const offset = chain.length - wanted.length;
  return wanted.every((segment, at) => chain[offset + at] === segment);
}

/**
 * The definition node's lines, widened to what a reader would call the
 * declaration: preceding decorators, and the `export` that fronts it.
 */
function spanOf(definition: Definition, source: string): ResolvedSymbol {
  let start = definition.node;
  let end = definition.node;

  for (
    let sibling = start.previousSibling;
    sibling?.type === "decorator";
    sibling = sibling.previousSibling
  ) {
    start = sibling;
  }

  const parent = end.parent;
  if (
    parent?.type === "export_statement" &&
    parent.childForFieldName("declaration")?.id === end.id
  ) {
    start = parent;
    end = parent;
  }

  const lines = source.split("\n");
  const startLine = start.startPosition.row;
  // A node ending at column 0 ends on the previous line's newline.
  const endLine =
    end.endPosition.column === 0 && end.endPosition.row > startLine
      ? end.endPosition.row - 1
      : end.endPosition.row;

  return {
    text: lines.slice(startLine, endLine + 1).join("\n"),
    startLine: startLine + 1,
    endLine: endLine + 1,
  };
}

/**
 * Leaf text in source order, comments skipped whole.
 *
 * Iterative rather than recursive: a span is bounded by `MAX_ANCHOR_FILE_BYTES`
 * but its nesting depth is not, and a deeply nested literal must not be able to
 * overflow the stack on a read path.
 */
function tokens(root: Node): string[] {
  const out: string[] = [];
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop() as Node;
    if (node.type.includes("comment")) continue;
    if (node.childCount === 0) {
      const text = node.text.trim();
      if (text) out.push(text);
      continue;
    }
    for (let at = node.childCount - 1; at >= 0; at--) {
      const child = node.child(at);
      if (child) stack.push(child);
    }
  }
  return out;
}

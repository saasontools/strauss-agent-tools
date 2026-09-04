import type { Node, Query, Tree } from "web-tree-sitter";
import type { ResolvedSymbol } from "../anchor-resolver/index.js";

/**
 * What a tags query says about a file: where each symbol is declared, and what
 * encloses it.
 *
 * The queries are upstream's `queries/tags.scm`, so the vocabulary is theirs:
 * `@name` is the symbol, `@definition.*` the node a reader would point at, and
 * `@reference.*` a use rather than a declaration. `@reference.implementation`
 * is the exception — a Rust `impl Foo` block scopes `Foo::cancel` without
 * being a definition of `Foo` itself — so it joins the chain, unresolvable.
 */

const SCOPE_ONLY = "reference.implementation";

/** A definition site, with the node whose range becomes the anchor span. */
export type Definition = {
  node: Node;
  name: string;
  /** `false` for chain-only scopes such as a Rust `impl` block. */
  target: boolean;
};

export type ParsedFile = {
  tree: Tree;
  /** Definitions by node id, for walking a node's enclosing chain. */
  byNodeId: Map<number, Definition>;
  definitions: Definition[];
};

/**
 * One definition per name site, outermost node wins — a query that captures
 * the same name twice (upstream Rust makes every `fn` both a function and,
 * inside a `declaration_list`, a method) yields the wider span.
 */
export function index(tree: Tree, query: Query): ParsedFile {
  const byName = new Map<number, Definition>();

  for (const match of query.matches(tree.rootNode)) {
    const nameNode = match.captures.find((capture) => capture.name === "name");
    const defNode = match.captures.find(
      (capture) =>
        capture.name.startsWith("definition.") || capture.name === SCOPE_ONLY,
    );
    if (!nameNode || !defNode) continue;

    const candidate: Definition = {
      node: defNode.node,
      name: nameNode.node.text,
      target: defNode.name !== SCOPE_ONLY,
    };
    const existing = byName.get(nameNode.node.id);
    if (existing && width(existing.node) >= width(candidate.node)) continue;
    byName.set(nameNode.node.id, candidate);
  }

  const definitions = [...byName.values()];
  return {
    tree,
    byNodeId: new Map(
      definitions.map((definition) => [definition.node.id, definition]),
    ),
    definitions,
  };
}

/**
 * The definitions whose enclosing chain ends with `wanted`, narrowed to the
 * ones carrying a body when several match: a TypeScript overload *signature*
 * declares the same chain as the implementation, and the implementation is
 * what a reader means. More than one survivor is genuinely ambiguous.
 */
export function select(
  parsed: ParsedFile,
  wanted: readonly string[],
): Definition[] {
  const matches = parsed.definitions.filter(
    (definition) =>
      definition.target &&
      endsWith(chainOf(definition, parsed.byNodeId), wanted),
  );
  if (matches.length < 2) return matches;
  const bodied = matches.filter(
    (definition) => definition.node.childForFieldName("body") !== null,
  );
  return bodied.length === 1 ? bodied : matches;
}

/**
 * The definition's enclosing chain, outermost first: `["OrderService",
 * "cancel"]` for a method of that class.
 *
 * A receiver stands in for an ancestor where a grammar has one — Go's
 * `func (s *Server) Cancel` chains as `Server.Cancel`.
 */
function chainOf(
  definition: Definition,
  byNodeId: Map<number, Definition>,
): string[] {
  const chain = [definition.name];

  const receiver = definition.node.childForFieldName("receiver");
  const type = receiver && typeNameIn(receiver);
  if (type) chain.unshift(type);

  for (let node = definition.node.parent; node; node = node.parent) {
    const enclosing = byNodeId.get(node.id);
    if (enclosing && enclosing.node !== definition.node)
      chain.unshift(enclosing.name);
  }
  return chain;
}

/** `(s *Server)` and `(s Server)` both name `Server`. */
function typeNameIn(receiver: Node): string | undefined {
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
function endsWith(chain: string[], wanted: readonly string[]): boolean {
  if (wanted.length > chain.length) return false;
  const offset = chain.length - wanted.length;
  return wanted.every((segment, at) => chain[offset + at] === segment);
}

function width(node: Node): number {
  return node.endIndex - node.startIndex;
}

/**
 * The definition node's lines, widened to what a reader would call the
 * declaration: preceding decorators, and the `export` that fronts it.
 */
export function spanOf(definition: Definition, source: string): ResolvedSymbol {
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

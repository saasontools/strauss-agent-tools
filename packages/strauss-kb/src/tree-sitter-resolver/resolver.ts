import { createHash } from "node:crypto";
import { Language, Parser, Query } from "web-tree-sitter";
import type {
  AnchorResolver,
  ResolvedSymbol,
  ResolverAttempt,
} from "../anchor-resolver/index.js";
import { DEFAULT_IO_CONCURRENCY, mapLimit } from "../concurrency.js";
import {
  ensureGrammar,
  noteUncompilableQuery,
  type GrammarOptions,
} from "../grammars/index.js";
import {
  index,
  select,
  spanOf,
  type Definition,
  type ParsedFile,
} from "./definitions.js";
import { definitionsQuery, languageForFile } from "./languages.js";

/**
 * AST-backed anchor resolution: a symbol resolves to the byte range of the
 * definition node that declares it, or to nothing.
 *
 * `resolve` stays synchronous because the read path resolves inside a loop;
 * grammar loading is the async part and happens once, in `prepare`.
 */

/** How many parsed trees to keep. Trees are large; anchors cluster in few files. */
const TREE_CACHE_LIMIT = 32;

type Loaded = { language: Language; query: Query };

export type TreeSitterStats = { parses: number; cacheHits: number };

/** Grammar options plus a test seam for the vendored tags queries. */
export type TreeSitterOptions = GrammarOptions & {
  /** Where `<language>.scm` is read from. Defaults to the shipped `grammars/tags`. */
  tagsDir?: string;
};

export class TreeSitterResolver implements AnchorResolver {
  readonly name = "tree-sitter";

  private readonly grammars: GrammarOptions;
  private readonly tagsDir: string | undefined;
  private readonly loaded = new Map<string, Loaded | null>();
  private readonly trees = new Map<string, ParsedFile>();
  private parser: Parser | undefined;
  private initialized = false;

  /** Cache effectiveness, for tests and for the latency numbers. */
  readonly stats: TreeSitterStats = { parses: 0, cacheHits: 0 };

  constructor(options: TreeSitterOptions = {}) {
    this.grammars = options;
    this.tagsDir = options.tagsDir;
  }

  /**
   * Loads the grammars these files need, once per language per process,
   * downloading each one on first use.
   *
   * A grammar that will not load is remembered as unavailable rather than
   * retried per anchor, and never throws: an unobtainable WASM is a finding.
   */
  async prepare(files: readonly string[]): Promise<void> {
    const wanted = new Set<string>();
    for (const file of files) {
      const language = languageForFile(file, this.tagsDir);
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

    // Downloads dominate a cold first run, so the languages a bundle needs
    // are fetched together rather than one after another.
    const languages = [...wanted];
    const loaded = await mapLimit(
      languages,
      Math.min(DEFAULT_IO_CONCURRENCY, languages.length),
      (language) => this.load(language),
    );
    languages.forEach((language, at) =>
      this.loaded.set(language, loaded[at] ?? null),
    );
  }

  /**
   * A grammar that cannot be obtained is already explained by the grammars
   * module; a query that will not compile against the release it is pinned to
   * is a different fault with a different repair, and is reported there too so
   * every hint has one home.
   */
  private async load(language: string): Promise<Loaded | null> {
    const source = definitionsQuery(language, this.tagsDir);
    if (!source) return null;
    let grammar: Language;
    try {
      const wasm = await ensureGrammar(language, this.grammars);
      if (!wasm) return null;
      grammar = await Language.load(wasm);
    } catch {
      return null;
    }
    try {
      return { language: grammar, query: new Query(grammar, source) };
    } catch (error) {
      noteUncompilableQuery(
        language,
        error instanceof Error ? error.message : String(error),
      );
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
    const language = file ? languageForFile(file, this.tagsDir) : undefined;
    if (!language) return { kind: "abstain" };
    if (!this.loaded.has(language)) return { kind: "abstain" };
    const loaded = this.loaded.get(language);
    if (!loaded) return { kind: "unresolved", reason: "resolver-unavailable" };

    const parsed = this.parse(language, loaded, source);
    if (!parsed) return { kind: "unresolved", reason: "resolver-unavailable" };

    const wanted = symbol.split(".").filter(Boolean);
    if (!wanted.length)
      return { kind: "unresolved", reason: "symbol-not-found" };

    const matches = select(parsed, wanted);
    if (!matches.length)
      return { kind: "unresolved", reason: "symbol-not-found" };
    if (matches.length > 1)
      return { kind: "unresolved", reason: "symbol-ambiguous" };
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

  /** Drops cached trees. Grammars stay loaded — they are immutable. */
  reset(): void {
    for (const parsed of this.trees.values()) parsed.tree.delete();
    this.trees.clear();
    this.stats.parses = 0;
    this.stats.cacheHits = 0;
  }
}

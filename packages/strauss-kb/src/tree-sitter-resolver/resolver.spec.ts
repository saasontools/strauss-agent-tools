import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import {
  defaultAnchorResolvers,
  hashAnchorText,
  prepareResolvers,
  regexResolver,
  resolveAnchorSpan,
  type AnchorResolution,
} from "../anchor-resolver/index.js";
import { languageForFile, TreeSitterResolver } from "./index.js";

/**
 * One resolver for the whole suite: grammar loading is the slow part and it is
 * process-wide by design. The tree cache is exercised on purpose in its own
 * test, so nothing here resets it.
 */
const resolver = new TreeSitterResolver();

const FILES = [
  "a.ts",
  "a.tsx",
  "a.js",
  "a.py",
  "a.go",
  "a.rs",
  "a.hs",
] as const;

beforeAll(async () => {
  await resolver.prepare(FILES);
});

function attempt(file: string, source: string, symbol: string) {
  return resolver.attempt(source, symbol, file);
}

/** The resolved span as text, so an assertion reads as the code it captured. */
function spanText(file: string, source: string, symbol: string): string {
  const outcome = attempt(file, source, symbol);
  if (outcome.kind !== "resolved") {
    throw new Error(`${symbol}: ${outcome.kind}`);
  }
  return outcome.span.text;
}

function lines(file: string, source: string, symbol: string): [number, number] {
  const outcome = attempt(file, source, symbol);
  if (outcome.kind !== "resolved") {
    throw new Error(`${symbol}: ${outcome.kind}`);
  }
  return [outcome.span.startLine, outcome.span.endLine];
}

describe("TreeSitterResolver: the spans regex gets wrong", () => {
  const TWO_CLASSES = [
    "export class OrderService {",
    "  cancel(id: string) {",
    "    return this.store.drop(id);",
    "  }",
    "}",
    "",
    "export class TripService {",
    "  cancel(id: string) {",
    "    return this.legs.drop(id);",
    "  }",
    "}",
  ].join("\n");

  test("two classes declaring the same method resolve to their own", () => {
    expect(lines("a.ts", TWO_CLASSES, "OrderService.cancel")).toEqual([2, 4]);
    expect(lines("a.ts", TWO_CLASSES, "TripService.cancel")).toEqual([8, 10]);
    expect(spanText("a.ts", TWO_CLASSES, "TripService.cancel")).toContain(
      "this.legs.drop",
    );
  });

  test("a bare name two classes share is ambiguous, not a guess", () => {
    expect(attempt("a.ts", TWO_CLASSES, "cancel")).toEqual({
      kind: "unresolved",
      reason: "symbol-ambiguous",
    });
  });

  test("a closing brace inside a template literal does not end the span", () => {
    const source = [
      "function render(name: string) {",
      "  const html = `<b>${name}</b> }`;",
      "  return html;",
      "}",
      "",
      "function after() {}",
    ].join("\n");
    expect(lines("a.ts", source, "render")).toEqual([1, 4]);
  });

  test("a regex literal containing a brace does not end the span", () => {
    const source = [
      "function parse(input: string) {",
      "  const open = /[{]/;",
      "  return open.test(input);",
      "}",
      "",
      "function after() {}",
    ].join("\n");
    expect(lines("a.ts", source, "parse")).toEqual([1, 4]);
    expect(spanText("a.ts", source, "parse")).toContain("open.test");
  });

  test("decorators are part of the declaration they decorate", () => {
    const source = [
      "class Jobs {",
      "  @retry(3)",
      "  @logged",
      "  run(id: string) {",
      "    return id;",
      "  }",
      "}",
    ].join("\n");
    expect(lines("a.ts", source, "Jobs.run")).toEqual([2, 6]);
    expect(spanText("a.ts", source, "Jobs.run")).toContain("@retry(3)");
  });

  test("an overload signature is not a definition; the implementation is", () => {
    const source = [
      "class Api {",
      "  get(id: string): string;",
      "  get(id: number): number;",
      "  get(id: string | number): string | number {",
      "    return id;",
      "  }",
      "}",
    ].join("\n");
    expect(lines("a.ts", source, "Api.get")).toEqual([4, 6]);
  });

  test("TSX resolves a component and its own methods", () => {
    const source = [
      "export const Panel = () => {",
      "  return <div>{`}`}</div>;",
      "};",
      "",
      "export class Board extends Base {",
      "  render() {",
      "    return <Panel />;",
      "  }",
      "}",
    ].join("\n");
    expect(lines("a.tsx", source, "Panel")).toEqual([1, 3]);
    expect(lines("a.tsx", source, "Board.render")).toEqual([6, 8]);
  });

  test("nested Python functions resolve by their enclosing chain", () => {
    const source = [
      "def outer(a):",
      "    def helper(b):",
      "        return b + 1",
      "    return helper(a)",
      "",
      "def helper(b):",
      "    return b - 1",
    ].join("\n");
    expect(lines("a.py", source, "outer.helper")).toEqual([2, 3]);
    expect(spanText("a.py", source, "outer.helper")).toContain("b + 1");
    expect(lines("a.py", source, "outer")).toEqual([1, 4]);
    // Two `helper`s exist; the bare name cannot choose between them.
    expect(attempt("a.py", source, "helper")).toEqual({
      kind: "unresolved",
      reason: "symbol-ambiguous",
    });
  });

  test("a Python decorator is part of the function", () => {
    const source = ["@cache", "def total(rows):", "    return sum(rows)"].join(
      "\n",
    );
    expect(lines("a.py", source, "total")).toEqual([1, 3]);
  });

  test("Go methods resolve through their struct receiver", () => {
    const source = [
      "package main",
      "",
      "type Server struct{ n int }",
      "",
      "func (s *Server) Cancel() error {",
      "\treturn nil",
      "}",
      "",
      "func Cancel() error {",
      "\treturn nil",
      "}",
    ].join("\n");
    expect(lines("a.go", source, "Server.Cancel")).toEqual([5, 7]);
    expect(lines("a.go", source, "Server")).toEqual([3, 3]);
    // A package function and a method share the name: only the chain tells them apart.
    expect(attempt("a.go", source, "Cancel")).toEqual({
      kind: "unresolved",
      reason: "symbol-ambiguous",
    });
  });

  test("Rust impl blocks scope their functions", () => {
    const source = [
      "pub struct Order { id: u32 }",
      "",
      "impl Order {",
      "    pub fn cancel(&self) -> u32 {",
      "        self.id",
      "    }",
      "}",
      "",
      "impl Trip {",
      "    pub fn cancel(&self) -> u32 {",
      "        0",
      "    }",
      "}",
    ].join("\n");
    expect(lines("a.rs", source, "Order.cancel")).toEqual([4, 6]);
    expect(lines("a.rs", source, "Trip.cancel")).toEqual([10, 12]);
    // `impl Order` scopes but is not itself a target, so `Order` is the struct.
    expect(lines("a.rs", source, "Order")).toEqual([1, 1]);
  });

  test("a symbol that only appears as a call is unresolved, not the call site", () => {
    const source = [
      "import { cancel } from './api';",
      "",
      "export function run(id: string) {",
      "  return cancel(id);",
      "}",
    ].join("\n");
    expect(attempt("a.ts", source, "cancel")).toEqual({
      kind: "unresolved",
      reason: "symbol-not-found",
    });
  });
});

describe("TreeSitterResolver: availability", () => {
  test("a grammar with no tags query abstains, like an unknown extension", () => {
    expect(languageForFile("a.json")).toBeUndefined();
    expect(attempt("a.json", '{ "cancel": 1 }\n', "cancel")).toEqual({
      kind: "abstain",
    });
  });

  test("an extension with no grammar abstains so regex gets a turn", () => {
    expect(languageForFile("a.hs")).toBeUndefined();
    expect(
      attempt("a.hs", "cancel :: Int -> Int\ncancel x = x\n", "cancel"),
    ).toEqual({
      kind: "abstain",
    });
  });

  test("an unobtainable grammar is unresolved, never a throw", async () => {
    const empty = mkdtempSync(join(tmpdir(), "strauss-grammars-"));
    try {
      const broken = new TreeSitterResolver({
        cacheRoot: empty,
        offline: true,
      });
      await broken.prepare(["a.ts"]);
      expect(broken.attempt("class A { b() {} }", "A.b", "a.ts")).toEqual({
        kind: "unresolved",
        reason: "resolver-unavailable",
      });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("a language nobody prepared abstains rather than parsing", () => {
    const fresh = new TreeSitterResolver();
    expect(fresh.attempt("class A { b() {} }", "A.b", "a.ts")).toEqual({
      kind: "abstain",
    });
  });
});

describe("the resolver chain", () => {
  const HASKELL = ["data Order = Order", "  { cancelled :: Bool }"].join("\n");

  test("falls back to regex for an extension with no grammar", async () => {
    const chain = defaultAnchorResolvers();
    await prepareResolvers(chain, ["a.hs"]);
    const outcome = resolveAnchorSpan(
      HASKELL,
      { file: "a.hs", symbol: "Order" },
      chain,
    );
    expect(outcome.ok).toBe(true);
    expect((outcome as Extract<AnchorResolution, { ok: true }>).resolver).toBe(
      "regex",
    );
  });

  // The price of the fall-through: a name that only ever appears in a call is
  // indistinguishable, to the chain, from a constant no tags query defines.
  test("tree-sitter's miss falls through, and regex may land on a call site", async () => {
    const chain = defaultAnchorResolvers();
    await prepareResolvers(chain, ["a.ts"]);
    const source = "export function run() {\n  return cancel(1);\n}\n";
    const outcome = resolveAnchorSpan(
      source,
      { file: "a.ts", symbol: "cancel" },
      chain,
    );
    expect(outcome.ok).toBe(true);
    expect((outcome as Extract<AnchorResolution, { ok: true }>).resolver).toBe(
      "regex",
    );
  });

  test("a symbol neither resolver defines is symbol-not-found", async () => {
    const chain = defaultAnchorResolvers();
    await prepareResolvers(chain, ["a.ts"]);
    expect(
      resolveAnchorSpan(
        "export function run() {\n  return 1;\n}\n",
        { file: "a.ts", symbol: "cancel" },
        chain,
      ),
    ).toEqual({ ok: false, reason: "symbol-not-found" });
  });

  // Two definitions the parser can see; regex would pick the `const` and call
  // it settled. Guessing between real definitions is the thing not on offer.
  test("symbol-ambiguous ends the chain rather than letting regex pick", async () => {
    const chain = defaultAnchorResolvers();
    await prepareResolvers(chain, ["a.ts"]);
    const source = [
      "class Jobs {",
      "  cancel() {",
      "    return 1;",
      "  }",
      "}",
      "",
      "class Trips {",
      "  cancel() {",
      "    return 2;",
      "  }",
      "}",
      "",
      "const cancel = 0;",
    ].join("\n");
    expect(
      resolveAnchorSpan(source, { file: "a.ts", symbol: "cancel" }, chain),
    ).toEqual({ ok: false, reason: "symbol-ambiguous" });
    expect(regexResolver.resolve(source, "cancel")).not.toBeNull();
  });

  test("resolver-unavailable ends the chain rather than guessing a span", async () => {
    const empty = mkdtempSync(join(tmpdir(), "strauss-grammars-"));
    try {
      const chain = [
        new TreeSitterResolver({ cacheRoot: empty, offline: true }),
        regexResolver,
      ];
      await prepareResolvers(chain, ["a.ts"]);
      const source = "class A {\n  b() {}\n}\n";
      expect(
        resolveAnchorSpan(source, { file: "a.ts", symbol: "A.b" }, chain),
      ).toEqual({ ok: false, reason: "resolver-unavailable" });
      expect(regexResolver.resolve(source, "A.b")).not.toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("a whole-file anchor names no resolver", async () => {
    const chain = defaultAnchorResolvers();
    await prepareResolvers(chain, ["a.ts"]);
    const outcome = resolveAnchorSpan(
      "const a = 1;\n",
      { file: "a.ts" },
      chain,
    );
    expect(outcome).toEqual({
      ok: true,
      span: { text: "const a = 1;\n", startLine: 1, endLine: 1 },
    });
  });

  test("the parsed tree is cached across anchors in the same file", () => {
    const cached = new TreeSitterResolver();
    const source = "class A {\n  b() {}\n  c() {}\n}\n";
    return cached.prepare(["a.ts"]).then(() => {
      expect(cached.attempt(source, "A.b", "a.ts").kind).toBe("resolved");
      expect(cached.stats).toEqual({ parses: 1, cacheHits: 0 });
      expect(cached.attempt(source, "A.c", "a.ts").kind).toBe("resolved");
      expect(cached.stats).toEqual({ parses: 1, cacheHits: 1 });
      // A different file content is a different key.
      expect(cached.attempt(`${source}\n`, "A.c", "a.ts").kind).toBe(
        "resolved",
      );
      expect(cached.stats).toEqual({ parses: 2, cacheHits: 1 });
    });
  });

  test("the tree-sitter span differs from the regex one it replaces", () => {
    const source = [
      "class Jobs {",
      "  @retry(3)",
      "  run() {",
      "    return 1;",
      "  }",
      "}",
    ].join("\n");
    const precise = spanText("a.ts", source, "Jobs.run");
    const heuristic = regexResolver.resolve(source, "Jobs.run")?.text;
    expect(heuristic).toBeDefined();
    expect(hashAnchorText(precise)).not.toEqual(
      hashAnchorText(heuristic as string),
    );
  });
});

/**
 * Upstream tags queries define functions, classes, methods, interfaces, traits
 * and structs — not constants, type aliases, TypeScript `enum`s, namespaces or
 * fields. One fixture per language and one row per construct, because the
 * boundary is upstream's and moves when a pack is repinned.
 */
describe("symbols the tags query does not define", () => {
  const SOURCES: Record<string, string> = {
    "a.ts": [
      "export const KB_EDGE_KINDS = [",
      '  "supersedes",',
      '  "refines",',
      "] as const;",
      "",
      "export type EdgeKind = (typeof KB_EDGE_KINDS)[number];",
      "",
      "export enum Severity {",
      "  Low = 1,",
      "  High = 2,",
      "}",
      "",
      "export class Store {",
      "  readonly limit = 32;",
      "",
      "  put(key: string) {",
      "    return key;",
      "  }",
      "}",
      "",
      "export function edgeNeighbours(id: string) {",
      "  return id;",
      "}",
      "",
      "declare const globalFlag: boolean;",
      "",
    ].join("\n"),
    "a.go": [
      "package main",
      "",
      "const MaxRetries = 3",
      "",
      "var Timeout = 30",
      "",
      "func Run(n int) int {",
      "\treturn n",
      "}",
      "",
    ].join("\n"),
    "a.rs": [
      "pub const LIMIT: usize = 4;",
      "",
      'pub static NAME: &str = "kb";',
      "",
      "pub fn run(n: usize) -> usize {",
      "    n",
      "}",
      "",
    ].join("\n"),
    "a.py": [
      "class Store:",
      "    limit = 32",
      "",
      "    def put(self, key):",
      "        return key",
      "",
    ].join("\n"),
  };

  /** file, symbol, and the resolver that answers — or the reason nobody does. */
  const TABLE: [string, string, string][] = [
    ["a.ts", "KB_EDGE_KINDS", "regex"],
    ["a.ts", "EdgeKind", "regex"],
    ["a.ts", "Severity", "regex"],
    ["a.ts", "Store.limit", "regex"],
    ["a.ts", "globalFlag", "regex"],
    ["a.ts", "Store.put", "tree-sitter"],
    ["a.ts", "edgeNeighbours", "tree-sitter"],
    ["a.go", "MaxRetries", "regex"],
    ["a.go", "Timeout", "regex"],
    ["a.go", "Run", "tree-sitter"],
    ["a.rs", "LIMIT", "regex"],
    ["a.rs", "NAME", "regex"],
    ["a.rs", "run", "tree-sitter"],
    // Neither resolver has a shape for a Python class attribute.
    ["a.py", "Store.limit", "symbol-not-found"],
    ["a.py", "Store.put", "tree-sitter"],
  ];

  const chain = defaultAnchorResolvers();
  beforeAll(() => prepareResolvers(chain, Object.keys(SOURCES)));

  test.each(TABLE)("%s %s answers %s", (file, symbol, expected) => {
    const outcome = resolveAnchorSpan(
      SOURCES[file] as string,
      { file, symbol },
      chain,
    );
    expect(outcome.ok ? outcome.resolver : outcome.reason).toBe(expected);
  });

  test("the fall-through, not the parser, is what resolves a const", () => {
    expect(attempt("a.ts", SOURCES["a.ts"] as string, "KB_EDGE_KINDS")).toEqual(
      {
        kind: "unresolved",
        reason: "symbol-not-found",
      },
    );
  });
});

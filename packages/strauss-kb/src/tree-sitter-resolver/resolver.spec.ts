import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { grammarHints, resetGrammarState } from "../grammars/index.js";
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

  test("a tags query that will not compile names the language in a hint", async () => {
    const tags = mkdtempSync(join(tmpdir(), "strauss-tags-"));
    resetGrammarState();
    try {
      writeFileSync(
        join(tags, "typescript.scm"),
        "(no_such_node) @definition.class\n",
      );
      const broken = new TreeSitterResolver({ tagsDir: tags });
      await broken.prepare(["a.ts"]);
      expect(broken.attempt("class A { b() {} }", "A.b", "a.ts")).toEqual({
        kind: "unresolved",
        reason: "resolver-unavailable",
      });
      expect(grammarHints()).toEqual([
        expect.stringContaining(
          "tags query for typescript does not compile against tree-sitter-typescript@",
        ),
      ]);
      expect(grammarHints()[0]).toContain("pnpm grammars pin typescript");
    } finally {
      resetGrammarState();
      rmSync(tags, { recursive: true, force: true });
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

  test("tree-sitter's miss ends the chain; regex never sees the call site", async () => {
    const chain = defaultAnchorResolvers();
    await prepareResolvers(chain, ["a.ts"]);
    const source = "export function run() {\n  return cancel(1);\n}\n";
    expect(
      resolveAnchorSpan(source, { file: "a.ts", symbol: "cancel" }, chain),
    ).toEqual({ ok: false, reason: "symbol-not-found" });
    // The regex resolver alone would have landed on the call.
    expect(regexResolver.resolve(source, "cancel")).not.toBeNull();
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

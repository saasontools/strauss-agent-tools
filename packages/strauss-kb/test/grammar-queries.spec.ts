import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Language, Parser, Query } from "web-tree-sitter";
import { ensureGrammar, grammarManifest } from "../src/grammars/index.js";
import { GRAMMAR_FIXTURES } from "./grammars-server.js";

/**
 * A tags query and the grammar it is pinned to are one thing: a query written
 * against a different release throws at `new Query`, and the resolver can then
 * only report itself unavailable. This is where the pair is checked on every
 * PR, for the six grammars the repository carries; `grammars.net.spec.ts`
 * checks the rest weekly.
 */
const languages = readdirSync(GRAMMAR_FIXTURES)
  .map((file) => /^tree-sitter-(.+)\.wasm$/.exec(file)?.[1])
  .filter((language): language is string => Boolean(language))
  .sort();

describe("the fixture grammars", () => {
  test.each(languages)("%s compiles its own tags query", async (language) => {
    await Parser.init();
    const pack = await ensureGrammar(language);
    expect(pack).not.toBeNull();
    expect(pack?.query, `${language} has no tags query`).toBeDefined();

    const grammar = await Language.load(pack?.wasm as string);
    expect(
      () => new Query(grammar, pack?.query as string),
      grammarManifest().packs[language]?.package,
    ).not.toThrow();
  });
});

/**
 * The runtime meets the packs the way an MCP server does: every grammar a
 * repository needs resident in one process at once. A WASM built at an ABI
 * outside the pinned `web-tree-sitter`'s range is rejected at `Language.load`,
 * and one built by a toolchain that corrupts the shared heap takes the loads
 * after it down with it — neither shows up loading a grammar on its own.
 * `pnpm grammars check` does this for all 30 packs weekly.
 */
describe("all the fixture grammars at once", () => {
  test("load, compile and parse in one process", async () => {
    await Parser.init();
    const parser = new Parser();
    const loaded: string[] = [];
    for (const language of languages) {
      const pack = await ensureGrammar(language);
      const grammar = await Language.load(pack?.wasm as string);
      if (pack?.query) new Query(grammar, pack.query);
      parser.setLanguage(grammar);
      expect(parser.parse("a b\n"), language).not.toBeNull();
      loaded.push(language);
    }
    parser.delete();
    expect(loaded).toEqual(languages);
  });
});

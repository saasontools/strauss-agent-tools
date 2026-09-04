import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Language, Parser, Query } from "web-tree-sitter";
import { ensureGrammar, grammarManifest } from "../src/grammars/index.js";
import { definitionsQuery } from "../src/tree-sitter-resolver/index.js";
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
    const path = await ensureGrammar(language);
    expect(path).not.toBeNull();

    const source = definitionsQuery(language);
    expect(source, `${language} has no tags query`).toBeDefined();
    const grammar = await Language.load(path as string);
    expect(
      () => new Query(grammar, source as string),
      grammarManifest().grammars[language]?.grammar,
    ).not.toThrow();
  });
});

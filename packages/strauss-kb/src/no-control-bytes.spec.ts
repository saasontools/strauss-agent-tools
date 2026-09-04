import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A raw control byte in a source file makes git treat it as binary, so the
 * file stops showing up in diffs and reviews. Spell separators as escapes.
 */
describe("tracked sources", () => {
  it("carry no raw NUL or control bytes", () => {
    const root = new URL("..", import.meta.url);
    const files = execFileSync("git", ["ls-files", "src", "test", "bench"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((file) => /\.(ts|mts|cts|js|mjs|cjs|json|md)$/.test(file));
    const isControl = (byte: number): boolean =>
      byte === 0 || byte < 9 || (byte > 13 && byte < 32 && byte !== 27);
    const offenders = files.filter((file) =>
      [...readFileSync(new URL(file, root))].some(isControl),
    );
    expect(offenders).toEqual([]);
  });
});

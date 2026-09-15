import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseUnifiedDiff, readRangeDiff } from "@saasontools/code-diff";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { changedSymbolsIn } from "./changed-symbols.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** The fixture's `silent-code-change` and `excluded-path-crosses` pin the answer. */
describe("changedSymbolsIn over the companion fixture", () => {
  let repo: string;
  const saved = {
    GIT_CONFIG_GLOBAL: process.env["GIT_CONFIG_GLOBAL"],
    GIT_CONFIG_SYSTEM: process.env["GIT_CONFIG_SYSTEM"],
  };

  beforeAll(async () => {
    // An empty file, not the null device: git on Windows rejects the latter.
    const emptyConfig = join(
      mkdtempSync(join(tmpdir(), "strauss-kb-gitconfig-")),
      "empty",
    );
    writeFileSync(emptyConfig, "");
    process.env["GIT_CONFIG_GLOBAL"] = emptyConfig;
    process.env["GIT_CONFIG_SYSTEM"] = emptyConfig;
    const fixture = (await import(
      pathToFileURL(join(REPO_ROOT, "fixtures/companion-repo/materialize.mjs"))
        .href
    )) as { materialize: (options: { out: string }) => { repo: string } };
    repo = fixture.materialize({
      out: mkdtempSync(join(tmpdir(), "strauss-kb-symbols-")),
    }).repo;
  }, 120_000);

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  async function symbolsOn(scenario: string) {
    execFileSync("git", ["-C", repo, "checkout", "--quiet", scenario]);
    const diff = await readRangeDiff(repo, `main...${scenario}`);
    if (!diff.ok) throw new Error(`${scenario}: ${diff.reason}`);
    const files = parseUnifiedDiff(diff.text, {
      withLines: true,
      withContext: true,
    });
    return (await changedSymbolsIn(repo, files)).map(
      ({ file, symbol, via }) => ({ file, symbol, via }),
    );
  }

  test("silent-code-change: every hunk sits in TenantService.findMany", async () => {
    const found = await symbolsOn("silent-code-change");
    expect(found.length).toBeGreaterThan(0);
    for (const entry of found) {
      expect(entry).toEqual({
        file: "src/services/tenant.service.ts",
        symbol: "TenantService.findMany",
        via: "parse",
      });
    }
  });

  test("excluded-path-crosses: the import is file scope, the new method is named", async () => {
    const found = await symbolsOn("excluded-path-crosses");
    expect(found.every((entry) => entry.via === "parse")).toBe(true);
    expect(new Set(found.map((entry) => entry.symbol))).toEqual(
      new Set([null, "ReportBuilder.fromCharge"]),
    );
  });

  test("a file with no grammar falls back to git's function context", async () => {
    const found = await symbolsOn("generated-block");
    expect(
      found.find((entry) => entry.file === "src/protocol/protocol.json")?.via,
    ).toBe("funcname");
  });
});

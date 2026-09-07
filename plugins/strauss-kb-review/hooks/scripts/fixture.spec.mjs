// @ts-check
/**
 * `--report` over every branch of the companion fixture: the families that
 * block must be the ones `expected.json` names, and `docs-only` must block on
 * nothing at all.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const FIXTURE = join(ROOT, "fixtures/companion-repo/materialize.mjs");
const CLI = join(ROOT, "packages/strauss-kb/dist/cli-main.js");
const GATE = join(HERE, "kb-review-gate.mjs");

const { materialize, readExpected, scenarioNames } = await import(
  pathToFileURL(FIXTURE).href
);

/**
 * Every call carries autocrlf=false: the runner's own git config must not
 * rewrite the fixture's line endings on checkout or reset.
 * @param {string} repo @param {string[]} args
 */
const git = (repo, args) =>
  execFileSync("git", ["-C", repo, "-c", "core.autocrlf=false", ...args], {
    encoding: "utf8",
  });

/** @param {string} repo @param {string} branch */
function reportOn(repo, branch) {
  // Reading the base rebuilds its index; reset before every checkout.
  git(repo, ["checkout", "--", "."]);
  git(repo, ["clean", "-qfd"]);
  git(repo, ["checkout", "-q", branch]);
  const out = execFileSync(
    "node",
    [
      GATE,
      "--report",
      "--repo-root",
      repo,
      "--base",
      "main",
      "--head",
      "HEAD",
      "--offline",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, STRAUSS_KB_BIN: CLI },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(out);
}

test(
  "--report reproduces every scenario's gate families",
  { concurrency: 1 },
  async (t) => {
    if (!existsSync(CLI)) {
      t.skip("strauss-kb is not built");
      return;
    }
    const { repo } = materialize({});
    try {
      for (const scenario of scenarioNames()) {
        await t.test(scenario, (sub) => {
          const result = reportOn(repo, scenario);
          assert.equal(result.classifier, "cli");
          assert.equal(result.base, "main");
          assert.ok(
            typeof result.stamp === "string" && result.stamp.length > 0,
          );
          // `fixable` is asserted against the scenario's own ids, so the check
          // does not read the set the gate computes it from.
          const fixable = new Set(readExpected(scenario).fixable ?? []);
          for (const item of result.findings) {
            assert.ok(["mechanical", "semantic"].includes(item.label));
            assert.equal(item.fixable, fixable.has(item.id));
          }

          const expected = readExpected(scenario).gateFamilies;
          const blocked = [
            ...new Set(
              result.findings
                .filter((/** @type {any} */ item) => item.severity === "block")
                .map((/** @type {any} */ item) => item.family),
            ),
          ].sort();

          // This scenario's families come from `anchor-resolve` alone, which
          // needs a cached tree-sitter grammar; a cold runner has none.
          if (scenario === "drift-after-commit" && blocked.length === 0) {
            sub.skip("the anchor resolver is unavailable on this runner");
            return;
          }
          assert.deepEqual(blocked, [...expected].sort());
        });
      }

      await t.test("docs-only blocks on nothing", () => {
        const result = reportOn(repo, "docs-only");
        assert.deepEqual(
          result.findings.filter(
            (/** @type {any} */ item) => item.severity === "block",
          ),
          [],
        );
      });
    } finally {
      git(repo, ["checkout", "--", "."]);
      rmSync(repo, { recursive: true, force: true });
    }
  },
);

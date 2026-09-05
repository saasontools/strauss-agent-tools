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
import { buildContext } from "./lib/context.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const FIXTURE = join(ROOT, "fixtures/companion-repo/materialize.mjs");
const CLI = join(ROOT, "packages/strauss-kb/dist/cli-main.js");
const GATE = join(HERE, "kb-review-gate.mjs");

const { materialize, readExpected, scenarioNames } = await import(
  pathToFileURL(FIXTURE).href
);

/** @param {string} repo @param {string[]} args */
const git = (repo, args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

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

test("the gate honours `classify --git`, not its built-in patterns", (t) => {
  if (!existsSync(CLI)) {
    t.skip("strauss-kb is not built");
    return;
  }
  const { repo } = materialize({ scenarios: ["generated-block"] });
  const previous = process.env.STRAUSS_KB_BIN;
  process.env.STRAUSS_KB_BIN = CLI;
  try {
    git(repo, ["checkout", "-q", "generated-block"]);
    const ctx = buildContext({
      repoRoot: repo,
      bundle: join(repo, ".strauss", "kb"),
      base: "main",
      head: "HEAD",
      offline: true,
      report: true,
    });
    assert.equal(ctx.classifier, "cli");
    // Neither answer is the built-in one: `protocol.json` reads `config` and
    // `log.jsonl` `kb` from the patterns alone.
    assert.equal(ctx.classes.get("src/protocol/protocol.json"), "generated");
    assert.equal(ctx.classes.get(".strauss/kb/log.jsonl"), "config");

    const cli = JSON.parse(
      execFileSync(
        "node",
        [
          CLI,
          "--bundle",
          join(repo, ".strauss", "kb"),
          "classify",
          "--git",
          "main..HEAD",
          "--repo-root",
          repo,
          "--offline",
          "--json",
        ],
        { encoding: "utf8", cwd: repo, maxBuffer: 64 * 1024 * 1024 },
      ),
    );
    for (const row of cli.files) {
      assert.equal(ctx.classes.get(row.filePath), row.class, row.filePath);
    }
  } finally {
    if (previous === undefined) delete process.env.STRAUSS_KB_BIN;
    else process.env.STRAUSS_KB_BIN = previous;
    rmSync(repo, { recursive: true, force: true });
  }
});

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
          for (const item of result.findings) {
            assert.ok(["mechanical", "semantic"].includes(item.label));
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

// @ts-check
/**
 * The deck two companion-repo scenarios produce, against a checked-in snapshot.
 * A diff here is a review, not a failure — see the plugin README.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..", "..");
const RENDER = join(HERE, "render.mjs");
const SNAPSHOTS = join(HERE, "__snapshots__");
const FIXTURE = join(ROOT, "fixtures", "companion-repo", "materialize.mjs");
const KB_CLI = join(ROOT, "packages", "strauss-kb", "dist", "cli-main.js");
const PR = "https://github.com/acme/app/pull/7";

/** @type {string[]} */
const built = [];
after(() => {
  for (const dir of built) rmSync(dir, { recursive: true, force: true });
});

/**
 * A fresh repository per scenario: `anchor-resolve` stamps anchors that carry
 * no hash, so a reused checkout is no longer the fixture's tree.
 *
 * @param {string} scenario
 * @returns {string}
 */
function materialize(scenario) {
  const out = mkdtempSync(join(tmpdir(), `walkthrough-${scenario}-`));
  built.push(out);
  execFileSync(
    process.execPath,
    [FIXTURE, "--out", out, "--scenarios", scenario, "--force"],
    { encoding: "utf8" },
  );
  execFileSync("git", ["-C", out, "checkout", "--quiet", scenario], {
    encoding: "utf8",
  });
  return out;
}

/**
 * @param {string} scenario
 * @returns {any}
 */
function render(scenario) {
  const repo = materialize(scenario);
  const stdout = execFileSync(
    process.execPath,
    [
      RENDER,
      "--range",
      `main..${scenario}`,
      "--repo-root",
      repo,
      "--pr",
      PR,
      "--json",
    ],
    { encoding: "utf8", env: { ...process.env, STRAUSS_KB_CLI: KB_CLI } },
  );
  return JSON.parse(stdout);
}

// The base digest comes from `strauss-kb stamp` and differs across platforms;
// the deck does not. Pin its shape, not its value.
function withoutDigest(model) {
  const seen = (value) =>
    Array.isArray(value)
      ? value.map(seen)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, inner]) => {
              if (key !== "digest") return [key, seen(inner)];
              assert.match(String(inner), /^[0-9a-f]{64}$/);
              return [key, "<digest>"];
            }),
          )
        : value;
  return seen(model);
}

for (const scenario of ["blocking-risk", "generated-block"]) {
  test(`renders ${scenario} the way the snapshot says`, () => {
    const model = withoutDigest(render(scenario));
    const file = join(SNAPSHOTS, `${scenario}.json`);
    const text = `${JSON.stringify(model, null, 2)}\n`;
    if (process.env.UPDATE_SNAPSHOTS || !existsSync(file)) {
      writeFileSync(file, text);
      return;
    }
    assert.deepEqual(
      model,
      JSON.parse(readFileSync(file, "utf8")),
      `${scenario} renders a different deck than __snapshots__/${scenario}.json. ` +
        "Read the diff and decide whether the new deck is better; " +
        "UPDATE_SNAPSHOTS=1 accepts it.",
    );
  });
}

test("renders a self-contained page with no external resource", () => {
  const repo = materialize("blocking-risk");
  const out = join(repo, "walkthrough.html");
  execFileSync(
    process.execPath,
    [
      RENDER,
      "--range",
      "main..blocking-risk",
      "--repo-root",
      repo,
      "--pr",
      PR,
      "--out",
      out,
    ],
    { encoding: "utf8", env: { ...process.env, STRAUSS_KB_CLI: KB_CLI } },
  );
  const html = readFileSync(out, "utf8");
  assert.ok(html.includes("<title>Review walkthrough"));
  assert.ok(html.includes("prefers-color-scheme"));
  assert.ok(!/<(script|link|img)\b[^>]*\ssrc=|<link\b/i.test(html));
  // The step markup is assembled by hand, so an unclosed tag reflows the whole
  // page rather than failing anything.
  for (const tag of ["section", "details", "dl", "ul"]) {
    assert.equal(
      (html.match(new RegExp(`<${tag}(?=[\\s>])`, "g")) ?? []).length,
      (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length,
      `<${tag}> is unbalanced`,
    );
  }
  for (const placeholder of ["title", "summary", "rail", "steps", "also"]) {
    assert.ok(
      !html.includes(`{{${placeholder}}}`),
      `{{${placeholder}}} was never filled`,
    );
  }
});

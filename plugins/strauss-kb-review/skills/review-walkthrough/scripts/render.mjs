#!/usr/bin/env node
// @ts-check
/**
 * Render a companion base and a diff into one self-contained review guide.
 *
 * Usage:
 *   render.mjs --range <base>..<head> [--repo-root DIR] [--bundle DIR]
 *              [--pr URL] [--reviewer FILE|JSON] [--allow-drift]
 *              (--out FILE.html | --json)
 *
 * Every fact comes from `strauss-kb` (`$STRAUSS_KB_CLI`, else the one on PATH)
 * and from git; no record file is opened. Exit 2 is a usage error, exit 3
 * refuses a base whose anchors drifted or could not be checked, exit 1 is
 * anything else.
 *
 * Node >= 20 standard library only — no dependencies, no build step.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { makeRunners } from "./lib/cli.mjs";
import { renderHtml } from "./lib/html.mjs";
import { normalizePrUrl } from "./lib/links.mjs";
import { buildModel, Refusal } from "./lib/model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, "..", "templates", "walkthrough.html");

const USAGE = `render.mjs --range <base>..<head> [--repo-root DIR] [--bundle DIR]
            [--pr URL] [--reviewer FILE|JSON] [--allow-drift]
            (--out FILE.html | --json)`;

/** A bad invocation, which exits 2 rather than looking like a base problem. */
export class UsageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * `--reviewer` takes the reviewer agent's output: a path to its JSON, or the
 * JSON itself when a caller has it in hand.
 *
 * @param {string|undefined} value
 * @returns {Record<string, any>}
 */
export function readReviewer(value) {
  if (!value) return {};
  const text = value.trimStart().startsWith("{")
    ? value
    : readFileSync(value, "utf8");
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new UsageError(
      `--reviewer is not JSON: ${/** @type {Error} */ (error).message}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError("--reviewer must be an object keyed by record id");
  }
  return /** @type {Record<string, any>} */ (parsed);
}

/**
 * @param {string[]} argv
 * @returns {{ model: any, html: string|null, out: string|null, json: boolean }}
 */
export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      bundle: { type: "string" },
      range: { type: "string" },
      "repo-root": { type: "string" },
      pr: { type: "string" },
      reviewer: { type: "string" },
      out: { type: "string" },
      json: { type: "boolean", default: false },
      "allow-drift": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  if (!values.range) throw new UsageError("--range <base>..<head> is required");
  if (!values.json && !values.out) {
    throw new UsageError("pass --out <file.html>, or --json for the model");
  }
  // Before anything is built: the model carries this string into every href.
  const pr = values.pr === undefined ? null : normalizePrUrl(values.pr);
  if (values.pr !== undefined && pr === null) {
    throw new UsageError(
      "--pr must be https://github.com/<owner>/<repo>/pull/<number>",
    );
  }

  const repoRoot = resolve(values["repo-root"] ?? process.cwd());
  const bundle = resolve(values.bundle ?? join(repoRoot, ".strauss", "kb"));
  const runners = makeRunners({ bundle, repoRoot });
  const model = buildModel(runners, {
    range: values.range,
    repoRoot,
    bundle,
    pr,
    reviewer: readReviewer(values.reviewer),
    allowDrift: values["allow-drift"] === true,
  });

  if (values.json) return { model, html: null, out: null, json: true };
  const html = renderHtml(model, readFileSync(TEMPLATE, "utf8"));
  return { model, html, out: resolve(values.out ?? ""), json: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = main(process.argv.slice(2));
    if (result.json) {
      process.stdout.write(`${JSON.stringify(result.model, null, 2)}\n`);
    } else if (result.out && result.html) {
      writeFileSync(result.out, result.html);
      process.stdout.write(
        `${result.out} — ${result.model.steps} steps, ${result.model.also.length} also\n`,
      );
    }
  } catch (error) {
    const failure = /** @type {Error & { stderr?: string }} */ (error);
    process.stderr.write(`review-walkthrough: ${failure.message}\n`);
    if (failure.stderr?.trim()) {
      process.stderr.write(`${failure.stderr.trim()}\n`);
    }
    if (failure instanceof UsageError) process.stderr.write(`${USAGE}\n`);
    process.exit(
      failure instanceof Refusal ? 3 : failure instanceof UsageError ? 2 : 1,
    );
  }
}

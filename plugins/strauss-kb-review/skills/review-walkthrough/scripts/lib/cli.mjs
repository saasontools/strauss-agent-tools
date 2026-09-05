// @ts-check
/**
 * The two runners the step model is built from. Every fact about the base
 * comes through `kb`; nothing here opens a record file.
 */
import { execFileSync } from "node:child_process";

const MAX_BUFFER = 64 * 1024 * 1024;

/** How the CLI's dispatcher reports a verb it does not have. */
const MISSING_VERB = /unknown command\b/i;

/** Git env that would point a child at another repository or index. */
const GIT_REDIRECTS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_EXTERNAL_DIFF",
];

/** A subprocess that failed and whose stdout could not be used instead. */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {{ argv: string[], stderr?: string }} detail
   */
  constructor(message, detail) {
    super(message);
    this.name = "CliError";
    this.argv = detail.argv;
    this.stderr = detail.stderr ?? "";
  }
}

/**
 * @typedef {object} Runners
 * @property {(argv: string[], options?: { optional?: boolean }) => unknown} kb
 *   Runs `strauss-kb <argv>` and parses its JSON. Every kb verb this skill
 *   calls already prints the machine shape, so none of them takes `--json`.
 *   `optional` returns `null` for a verb this CLI does not have; every other
 *   failure throws, so "could not ask" never reads as "nothing to report".
 * @property {(argv: string[]) => string} git Runs git in the repo root.
 */

/**
 * @param {string} command
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function spawn(command, argv, env) {
  // A `.mjs`/`.js` entry point is run by this node, so the skill works from a
  // checkout with no installed `strauss-kb` on PATH.
  const script = /\.[cm]?js$/.test(command);
  const file = script ? process.execPath : command;
  const args = script ? [command, ...argv] : argv;
  try {
    // stderr is captured, not inherited: a probe for an absent verb must not
    // print the CLI's complaint about it.
    const stdout = execFileSync(file, args, {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
      ...(env ? { env } : {}),
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure =
      /** @type {NodeJS.ErrnoException & { status?: number, stdout?: string, stderr?: string }} */ (
        error
      );
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    };
  }
}

/** @returns {NodeJS.ProcessEnv} */
function gitEnv() {
  const env = { ...process.env };
  for (const name of GIT_REDIRECTS) delete env[name];
  return env;
}

/**
 * @param {object} options
 * @param {string} options.bundle Path to the companion base.
 * @param {string} options.repoRoot Repository the anchors resolve against.
 * @param {string} [options.cli] `strauss-kb` entry point; `$STRAUSS_KB_CLI` else.
 * @returns {Runners}
 */
export function makeRunners({ bundle, repoRoot, cli }) {
  const command = cli ?? process.env.STRAUSS_KB_CLI ?? "strauss-kb";
  return {
    kb(argv, options = {}) {
      const full = ["--bundle", bundle, ...argv];
      const result = spawn(command, full);
      const text = result.stdout.trim();
      // A verb that reports a finding exits non-zero and still prints its JSON
      // — `anchor-resolve` does on drift — so parsed output is the answer
      // whatever the status was.
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          // Not JSON: fall through and fail with what the CLI printed.
        }
      }
      if (options.optional && MISSING_VERB.test(result.stderr)) return null;
      throw new CliError(
        result.status !== 0
          ? `strauss-kb ${argv.join(" ")} exited ${result.status}`
          : `strauss-kb ${argv.join(" ")} printed ${text ? "no JSON" : "nothing"}`,
        { argv: full, stderr: result.stderr || text.slice(0, 400) },
      );
    },
    git(argv) {
      // The runner pins the repository with `-C` and drops the git env that
      // would move it elsewhere. Revs and paths are the caller's: they pass
      // `--end-of-options` ahead of them so a leading `-` is an argument.
      const full = ["-C", repoRoot, ...argv];
      const result = spawn("git", full, gitEnv());
      if (result.status !== 0) {
        throw new CliError(`git ${argv.join(" ")} exited ${result.status}`, {
          argv: full,
          stderr: result.stderr,
        });
      }
      return result.stdout;
    },
  };
}

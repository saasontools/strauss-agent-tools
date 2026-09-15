// @ts-check
/**
 * The gate never imports @saasontools/strauss-kb — it spawns the installed
 * CLI, so the plugin stays a plain directory with no build and no dependency.
 * Never through a shell: the bundle path and the range are caller strings, and
 * `shell: true` would hand them to cmd.exe as source. The launcher is this node
 * running the package's own `dist/cli-main.js`, or a directly executable shim.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { childEnv } from "./util.mjs";

const TIMEOUT_MS = 10_000;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

const ENTRY = join(
  "node_modules",
  "@saasontools",
  "strauss-kb",
  "dist",
  "cli-main.js",
);

/** Past this instant a run is refused unrun, so the gate degrades to silence. */
let deadline = Number.POSITIVE_INFINITY;

/** @param {number} at */
export function setDeadline(at) {
  deadline = at;
}

export function pastDeadline() {
  return Date.now() > deadline;
}

/**
 * The nearest installed CLI: the package's own entry first, then the
 * `node_modules/.bin` shim. On Windows that shim is a `.cmd` only a shell can
 * run, so it is skipped and the entry above is the supported path.
 * @param {string} cwd
 */
export function resolveLocalBin(cwd) {
  let dir = resolve(cwd);
  for (;;) {
    const entry = join(dir, ENTRY);
    if (existsSync(entry)) return entry;
    const shim = join(dir, "node_modules", ".bin", "strauss-kb");
    if (process.platform !== "win32" && existsSync(shim)) return shim;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * @typedef {{ cwd: string, bundle: string, command?: string | null }} Launcher
 * @typedef {{ status: number, stdout: string, stderr: string,
 *   missing: boolean, unknownVerb: boolean }} Run
 */

/** @param {string} cwd @param {string} bundle @returns {Launcher} */
export function launcher(cwd, bundle) {
  return {
    cwd,
    bundle,
    command: process.env.STRAUSS_KB_BIN || resolveLocalBin(cwd) || "strauss-kb",
  };
}

/** @param {Launcher} kb @param {string[]} args @returns {Run} */
export function run(kb, args) {
  const command = kb.command ?? "strauss-kb";
  const argv = ["--bundle", kb.bundle, ...args];
  const left = deadline - Date.now();
  if (left <= 0) {
    return {
      status: 0,
      stdout: "",
      stderr: "",
      missing: true,
      unknownVerb: false,
    };
  }
  const script = /\.[cm]?js$/.test(command);
  const result = spawnSync(
    script ? process.execPath : command,
    script ? [command, ...argv] : argv,
    {
      cwd: kb.cwd,
      encoding: "utf8",
      timeout: Math.min(TIMEOUT_MS, left),
      maxBuffer: MAX_BUFFER_BYTES,
      env: childEnv(),
      shell: false,
    },
  );
  const stderr = result.stderr ?? "";
  return {
    status: result.status ?? (result.error ? 127 : 0),
    stdout: result.stdout ?? "",
    stderr,
    missing: Boolean(result.error),
    unknownVerb: /unknown command|takes no |unknown argument/i.test(stderr),
  };
}

/**
 * A verb's machine shape, or null when it failed for any reason other than a
 * non-zero exit that still printed JSON (`anchor-resolve` does exactly that).
 * @param {Launcher} kb @param {string[]} args @returns {unknown}
 */
export function json(kb, args) {
  const result = run(kb, args);
  if (result.missing || result.unknownVerb) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

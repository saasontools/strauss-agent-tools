#!/usr/bin/env node
/**
 * PostToolUse hook: validates a KB bundle after a manual edit to one of its
 * record files.
 *
 * Write/Edit/MultiEdit bypass the store's write path (kb_write,
 * kb_supersede, ...), which is what keeps supersession links, backlinks, and
 * INDEX.md in agreement with each other. A hand edit can silently break that
 * agreement without anyone noticing until a later read trips over it. This
 * hook runs `strauss-kb validate` against the touched bundle right after
 * such an edit and surfaces any problems to the agent.
 *
 * Non-blocking, deliberately: PostToolUse fires after the tool already ran,
 * and a hand edit is often exactly what was wanted (fixing a typo,
 * recovering a bad merge) — this informs the agent so it can decide whether
 * to fix up the bundle, not reverts or gates anything.
 *
 * Opt out per project or per session with STRAUSS_KB_NO_VALIDATE_HOOK=1 (see
 * the plugin README).
 *
 * Fails open throughout, like the plugin's other hooks: an unresolvable
 * CLI, a bundle that isn't there (yet), or any unexpected error produces no
 * output rather than noise or a stuck hook.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { findBundleRoot } from "./kb-bundle.mjs";

const TIMEOUT_MS = 10_000;
const MAX_LISTED = 20;

function main() {
  if (process.env.STRAUSS_KB_NO_VALIDATE_HOOK) return 0;

  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }

  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string" || !filePath) return 0;

  const cwd =
    typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);

  const bundleRoot = findBundleRoot(absolute);
  if (!bundleRoot) return 0;

  const problems = runValidate(bundleRoot);
  if (!problems || problems.length === 0) return 0;

  const lines = problems
    .slice(0, MAX_LISTED)
    .map((p) => `- [${p.check}] ${p.conceptId}: ${p.note}`);
  if (problems.length > MAX_LISTED) {
    lines.push(`- …and ${problems.length - MAX_LISTED} more`);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          `strauss-kb validate found ${problems.length} problem(s) in ` +
          `${bundleRoot} after a manual edit — supersession links, ` +
          `backlinks, or INDEX.md may now be out of sync:\n${lines.join("\n")}`,
      },
    }),
  );
  return 0;
}

/**
 * Runs `strauss-kb --bundle <root> validate`: PATH first, then `npx` against
 * the published package (same invocation the plugin's mcp.json already
 * uses, minus the server name). Returns the parsed problem array, or null if
 * the CLI could not be resolved or its output could not be read — callers
 * treat null the same as "nothing to report".
 */
function runValidate(bundleRoot) {
  const args = ["--bundle", bundleRoot, "validate"];
  const opts = {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    shell: process.platform === "win32",
  };

  let result = spawnSync("strauss-kb", args, opts);
  if (result.error || result.status === null) {
    result = spawnSync(
      "npx",
      [
        "-y",
        "--@saasontools:registry=https://registry.npmjs.org",
        "-p",
        "@saasontools/strauss-kb@0.x",
        "strauss-kb",
        ...args,
      ],
      opts,
    );
  }
  if (result.error || result.status === null) return null;

  try {
    const parsed = JSON.parse(result.stdout || "[]");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

process.exit(main());

#!/usr/bin/env node
/**
 * PreToolUse hook: blocks raw file access to knowledge-base directories.
 *
 * A superseded or rejected record file reads exactly like a current one — only
 * the store resolves supersession chains and standing — so file reads of a
 * base are redirected to the strauss-kb tools. Exit 2 blocks the call and the
 * stderr message reaches the model at the exact point of violation.
 *
 * Shipped unwired, deliberately: blocking reads on project paths is a
 * workspace policy, not something a plugin should impose on every project it
 * is installed into. Opt in per project by copying this file into
 * `.claude/hooks/` and adding a PreToolUse entry to `.claude/settings.json`
 * with the matcher width you want — see the plugin README.
 *
 * Deliberately self-contained (no imports beyond node builtins): this script
 * runs from wherever it was copied, where the strauss-kb package is not
 * importable. Everything unexpected fails open (exit 0) — a broken hook
 * must never lock an agent out of its own project.
 *
 * INDEX.md is blocked along with the records, for uniformity: the agent gets
 * the index through kb_context / kb_index instead.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const REDIRECT =
  "KB directories are read via strauss-kb tools only (kb_load / kb_query / kb_trace) — " +
  "file reads bypass supersession resolution and return replaced records as if current.";

/**
 * The bundle directories this workspace protects: the default base plus every
 * pin from the three manifest layers — project, local, and user — each layer's
 * relative paths resolved against its own root. A layer that is missing or
 * unreadable is skipped; the rest still protect.
 */
function kbDirs(cwd) {
  const dirs = [resolve(cwd, ".strauss", "kb")];
  const userRoot = process.env.STRAUSS_KB_USER_ROOT || homedir();
  const layers = [
    { root: cwd, file: join(cwd, ".strauss", "kb-pins.json") },
    { root: cwd, file: join(cwd, ".strauss", "kb-pins.local.json") },
    { root: userRoot, file: join(userRoot, ".strauss", "kb-pins.json") },
  ];
  for (const { root, file } of layers) {
    try {
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      for (const pin of Array.isArray(manifest?.pins) ? manifest.pins : []) {
        if (typeof pin?.path === "string" && pin.path) {
          dirs.push(
            isAbsolute(pin.path)
              ? resolve(pin.path)
              : resolve(root, pin.path.split("/").join(sep)),
          );
        }
      }
    } catch {
      // This layer is missing or unreadable — the others still protect.
    }
  }
  return dirs;
}

function isInside(target, dir) {
  const rel = relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }

  const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const toolInput = input?.tool_input ?? {};

  // Read carries file_path; Glob and Grep carry an optional path. A Grep or
  // Glob with no explicit path searches the whole project and is not blocked —
  // over-blocking every project-wide search would cost more than the leak.
  const candidates = [toolInput.file_path, toolInput.path].filter(
    (value) => typeof value === "string" && value.length > 0,
  );
  if (candidates.length === 0) return 0;

  const dirs = kbDirs(cwd);
  for (const candidate of candidates) {
    const target = isAbsolute(candidate) ? resolve(candidate) : resolve(cwd, candidate);
    if (dirs.some((dir) => isInside(target, dir))) {
      process.stderr.write(`${REDIRECT}\n`);
      return 2;
    }
  }
  return 0;
}

process.exit(main());

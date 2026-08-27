#!/usr/bin/env node
/**
 * PreToolUse hook: blocks Antigravity's file-read tools on KB directories.
 *
 * Same rationale as the Claude Code hook (../../../hooks/scripts/): a
 * superseded or rejected record file reads exactly like a current one, and
 * only the store resolves chains and standing. The envelope differs — this
 * protocol blocks with a JSON decision on stdout rather than exit code 2.
 *
 * Duplicated rather than imported from the Claude Code script, deliberately:
 * an Antigravity user copies this adapter directory alone into
 * ~/.gemini/antigravity-cli/plugins/, so a relative import across the plugin
 * tree would break exactly where the script runs.
 *
 * Antigravity does not document its tool_input field names, so every string
 * value in the payload is tested as a path rather than trusting one key.
 * Everything unexpected allows (fail open).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const REDIRECT =
  "KB directories are read via strauss-kb tools only (kb_load / kb_query / kb_trace) — " +
  "file reads bypass supersession resolution and return replaced records as if current.";

/**
 * Every pin from the three manifest layers — project, local, and user — each
 * layer's relative paths resolved against its own root. A layer that is
 * missing or unreadable is skipped; the rest still protect.
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

function stringValues(value, depth = 0) {
  if (typeof value === "string") return [value];
  if (depth >= 3 || value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap((entry) =>
    stringValues(entry, depth + 1),
  );
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.stdout.write("{}");
    return 0;
  }

  const cwd =
    typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const dirs = kbDirs(cwd);
  const candidates = stringValues(input?.tool_input ?? {}).filter(
    (value) => value.length > 0 && value.length < 4_096,
  );

  for (const candidate of candidates) {
    const target = isAbsolute(candidate)
      ? resolve(candidate)
      : resolve(cwd, candidate);
    if (dirs.some((dir) => isInside(target, dir))) {
      process.stdout.write(
        JSON.stringify({ decision: "deny", reason: REDIRECT }),
      );
      return 0;
    }
  }

  process.stdout.write("{}");
  return 0;
}

process.exit(main());

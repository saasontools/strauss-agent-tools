#!/usr/bin/env node
/**
 * Tells an agent when a pinned base changed underneath it.
 *
 * Three events, one script:
 *   SessionStart  seeds the session's stamp state beside the injected block.
 *   PostToolUse   after a `git pull`/`fetch`/`merge`/`rebase`/`checkout`/
 *                 `switch`, compares the pinned bases against that state.
 *   SubagentStop  the same compare, for a sub-agent's own kb_write.
 *
 * State is `$TMPDIR/strauss-kb/<session_id>.json` — never under the repo,
 * since it is per session, not per project. Writes go through a temp file and
 * a rename, so a killed hook cannot leave a half-written state behind.
 *
 * The git short-circuit is what keeps this cheap: HEAD unmoved, or a diff that
 * touches no pinned path, exits before the CLI is spawned at all — the KB is
 * never read. Everything unexpected exits 0 in silence.
 *
 * Self-contained (node builtins only): it also runs from `.claude/hooks/`,
 * where the strauss-kb package is not importable.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// A broken pipe (the hook harness closing stdout early) must not crash the
// process — Node emits it asynchronously on the stream, past any try/catch.
process.stdout.on("error", () => {});

const GIT_SYNC = /\bgit\b[^&|;]*\b(pull|fetch|merge|rebase|checkout|switch)\b/;
const GIT_TIMEOUT_MS = 5_000;
const CLI_TIMEOUT_MS = 10_000;
const MAX_LISTED_IDS = 10;
const MAX_LISTED_BASES = 10;

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }

  const event = input?.hook_event_name;
  const sessionId = input?.session_id;
  if (typeof sessionId !== "string" || !sessionId) return 0;

  const cwd =
    typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const statePath = join(
    tmpdir(),
    "strauss-kb",
    `${sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`,
  );

  if (event === "SessionStart") {
    const stamps = await runStamp(cwd);
    if (stamps) writeState(statePath, { head: await gitHead(cwd), stamps });
    return 0;
  }

  if (event === "PostToolUse") {
    // `Bash` in Claude Code, `shell` in Codex, whose command arrives as argv.
    if (!/^(Bash|shell)$/.test(String(input?.tool_name))) return 0;
    const raw = input?.tool_input?.command;
    const command = Array.isArray(raw) ? raw.join(" ") : raw;
    if (typeof command !== "string" || !GIT_SYNC.test(command)) return 0;
    if (await unmovedOrUnpinned(cwd, statePath)) return 0;
  } else if (event !== "SubagentStop") {
    return 0;
  }

  return compare(cwd, statePath, event);
}

/**
 * True when this git command cannot have touched a pinned base: HEAD is where
 * the state file last saw it, or the diff since then names no pinned path.
 * A git call that fails or an unknown baseline is not an answer — those fall
 * through to the digest compare, which is the one thing that cannot be wrong.
 */
async function unmovedOrUnpinned(cwd, statePath) {
  const state = readState(statePath);
  const head = await gitHead(cwd);
  if (head && state.head === head) return true;

  const baseline = state.head ?? "ORIG_HEAD";
  const changed = await gitChangedPaths(cwd, baseline);
  if (changed === null) return false;

  const dirs = pinnedDirs(cwd);
  const touched = changed.some((path) =>
    dirs.some((dir) => isInside(resolve(cwd, path), dir)),
  );
  if (touched) return false;

  // Nothing pinned moved, but HEAD did: record it so the next hook run can
  // take the cheap path above.
  if (head) writeState(statePath, { head, stamps: state.stamps });
  return true;
}

async function compare(cwd, statePath, event) {
  const stamps = await runStamp(cwd);
  if (!stamps) return 0;

  const before = new Map(
    (readState(statePath).stamps ?? []).map((stamp) => [stamp.path, stamp]),
  );
  const changed = stamps.filter(
    (stamp) => before.get(stamp.path)?.digest !== stamp.digest,
  );
  writeState(statePath, { head: await gitHead(cwd), stamps });
  if (changed.length === 0) return 0;

  const lines = changed
    .slice(0, MAX_LISTED_BASES)
    .map((stamp) => line(stamp, before.get(stamp.path)));
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext: lines.join("\n"),
      },
    }),
  );
  return 0;
}

function line(stamp, before) {
  const ids = changedIds(stamp, before);
  const named = ids.slice(0, MAX_LISTED_IDS).join(", ");
  const more = ids.length > MAX_LISTED_IDS ? ", …" : "";
  return (
    `Knowledge base \`${stamp.path}\` changed since it was loaded ` +
    `(${stamp.recordCount} records) — \`kb_load\` it before relying on it.` +
    (named ? ` Changed: ${named}${more}.` : "")
  );
}

function changedIds(stamp, before) {
  const previous = new Map(
    (before?.records ?? []).map((record) => [record.conceptId, record.digest]),
  );
  const now = new Map(
    (stamp.records ?? []).map((record) => [record.conceptId, record.digest]),
  );
  const ids = new Set();
  for (const [conceptId, digest] of now) {
    if (previous.get(conceptId) !== digest) ids.add(sanitizeId(conceptId));
  }
  for (const conceptId of previous.keys()) {
    if (!now.has(conceptId)) ids.add(sanitizeId(conceptId));
  }
  return [...ids].sort();
}

/** Concept ids come from filenames — kept to one line and bounded anyway. */
function sanitizeId(value) {
  const flat = String(value)
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

function isInside(target, dir) {
  const rel = relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * The pinned bases, from the three manifest layers, each layer's relative
 * paths resolved against its own root. Read here rather than asked of the CLI:
 * the whole point of the short-circuit is to answer without spawning it.
 */
function pinnedDirs(cwd) {
  const userRoot = process.env.STRAUSS_KB_USER_ROOT || homedir();
  const layers = [
    { root: cwd, file: join(cwd, ".strauss", "kb-pins.json") },
    { root: cwd, file: join(cwd, ".strauss", "kb-pins.local.json") },
    { root: userRoot, file: join(userRoot, ".strauss", "kb-pins.json") },
  ];
  const dirs = [];
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
      // This layer is missing or unreadable — the others still count.
    }
  }
  return dirs;
}

function readState(statePath) {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    return {
      head: typeof parsed?.head === "string" ? parsed.head : null,
      stamps: Array.isArray(parsed?.stamps) ? parsed.stamps : [],
    };
  } catch {
    // Missing or unreadable state is "never injected": every base reads as
    // changed, the message goes out once, and this run seeds the file.
    return { head: null, stamps: [] };
  }
}

/** Temp file plus rename: a killed hook never leaves a half-written state. */
function writeState(statePath, state) {
  try {
    mkdirSync(dirname(statePath), { recursive: true });
    const temp = `${statePath}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(state));
    renameSync(temp, statePath);
  } catch {
    // Unwritable state costs a repeat message, never a failed hook.
  }
}

async function gitHead(cwd) {
  const result = await git(cwd, ["rev-parse", "HEAD"]);
  return result === null ? null : result.trim() || null;
}

async function gitChangedPaths(cwd, baseline) {
  const result = await git(cwd, [
    "diff",
    "--name-only",
    "--relative",
    `${baseline}..HEAD`,
  ]);
  if (result === null) return null;
  return result.split("\n").filter(Boolean);
}

async function git(cwd, args) {
  const { spawnSync } = await import("node:child_process");
  const run = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
  });
  if (run.error || run.status !== 0) return null;
  return run.stdout ?? "";
}

/**
 * `strauss-kb stamp --json` over every pinned base, or null when the CLI is
 * not installed. Two tiers, nearest first — this project's own dependency,
 * then `strauss-kb` on PATH. No `npx` tier: this runs after ordinary git
 * commands, and a registry fetch there costs more than the notice is worth.
 */
async function runStamp(cwd) {
  const { spawnSync } = await import("node:child_process");
  const win32 = process.platform === "win32";
  const commands = [resolveLocalBin(cwd), "strauss-kb"].filter(Boolean);

  for (const command of commands) {
    const run = spawnSync(command, ["stamp", "--json"], {
      cwd,
      encoding: "utf8",
      timeout: CLI_TIMEOUT_MS,
      shell: win32,
    });
    if (run.error && !run.signal) continue;
    try {
      const parsed = JSON.parse(run.stdout || "");
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Unparseable output is the same as no answer.
    }
    return null;
  }
  return null;
}

function resolveLocalBin(cwd) {
  const name = process.platform === "win32" ? "strauss-kb.cmd" : "strauss-kb";
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, "node_modules", ".bin", name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function safeMain() {
  try {
    return await main();
  } catch {
    return 0;
  }
}

process.exit(await safeMain());

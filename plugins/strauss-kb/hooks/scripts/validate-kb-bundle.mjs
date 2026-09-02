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
 * CLI, a directory that doesn't actually look like a bundle, or any
 * unexpected error (including a broken stdout pipe) produces no output
 * rather than noise, a stuck hook, or a crash.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import {
  findBundleRoot,
  looksLikeBundle,
  sanitizeForContext,
} from "./kb-bundle.mjs";

// A broken pipe (the hook harness closing stdout early) must not crash the
// process — Node emits it asynchronously on the stream, past any try/catch.
process.stdout.on("error", () => {});

// Kept in lockstep with packages/strauss-kb/package.json's `version` by
// hand — a test (test/plugin-hooks.spec.ts) fails loudly if they drift. A
// floating range here (`@0.x`, as mcp.json legitimately uses for the MCP
// server) would mean this hook runs whatever the registry serves *today*
// against every single manual edit; pinning trades that for "update this
// constant, in the same PR, whenever the package version moves."
const PINNED_STRAUSS_KB_VERSION = "0.1.7";

const CLI_TIMEOUT_MS = 10_000;
// npx may need to resolve/fetch the package first; give it real room, but
// bound it — this is also why hooks.json sets this entry's own `timeout`
// well above this value.
const NPX_TIMEOUT_MS = 60_000;

const MAX_LISTED = 20;
const MAX_NOTE_LEN = 200;
const MAX_CONTEXT_LEN = 4000;

function main() {
  if (isOptedOut()) return 0;

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
  // Unconditional: path.resolve is a no-op on an already-absolute path
  // beyond normalizing it (native separators, `..`/`.` collapsed), and a
  // conditional here previously let an already-absolute-but-forward-slashed
  // Windows path (`C:/Users/...`) skip normalization entirely, permanently
  // no-opping this hook on that platform, and let a `..` segment reach
  // `findBundleRoot` unresolved.
  const absolute = resolve(cwd, filePath);

  const bundleRoot = findBundleRoot(absolute);
  if (!bundleRoot) return 0;
  if (!looksLikeBundle(bundleRoot)) return 0;

  const problems = runValidate(bundleRoot, cwd);
  if (!problems || problems.length === 0) return 0;

  emit(bundleRoot, problems);
  return 0;
}

function isOptedOut() {
  const raw = (process.env.STRAUSS_KB_NO_VALIDATE_HOOK ?? "")
    .trim()
    .toLowerCase();
  // "0" and "false" are common ways to mean "not set" in a shared env file —
  // only an actually-truthy value opts out. Documented as `=1` in the README.
  return raw !== "" && raw !== "0" && raw !== "false";
}

function emit(bundleRoot, problems) {
  const lines = problems.slice(0, MAX_LISTED).map((p) => {
    const check = sanitizeForContext(p.check, 40);
    const conceptId = sanitizeForContext(p.conceptId, 80);
    const note = sanitizeForContext(p.note, MAX_NOTE_LEN);
    return `- [${check}] ${conceptId}: ${note}`;
  });
  if (problems.length > MAX_LISTED) {
    lines.push(`- …and ${problems.length - MAX_LISTED} more`);
  }

  let additionalContext =
    `strauss-kb validate found ${problems.length} problem(s) in ` +
    `${bundleRoot} — supersession links, backlinks, or INDEX.md may be ` +
    `out of sync:\n${lines.join("\n")}`;
  if (additionalContext.length > MAX_CONTEXT_LEN) {
    additionalContext = `${additionalContext.slice(0, MAX_CONTEXT_LEN - 1)}…`;
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
    }),
  );
}

/**
 * Runs `strauss-kb --bundle <root> validate` and returns the parsed problem
 * array, or null if nothing could be run or its output couldn't be read —
 * callers treat null the same as "nothing to report".
 *
 * Three tiers, nearest-and-fastest first: this project's own pinned
 * dependency (`node_modules/.bin/strauss-kb`, walked up from `cwd` the way
 * Node itself resolves `node_modules`), a global install on PATH, and
 * finally `npx` against the exact pinned version — never a floating range,
 * so an edit doesn't quietly start running whatever the registry serves
 * that day. A tier that *started* but timed out or was otherwise killed
 * stops the chain rather than falling through: retrying a slow operation
 * via a slower path (npx, which may need to fetch) just compounds the
 * wait for no benefit. Only "never started at all" (not found) falls
 * through to the next tier.
 */
function runValidate(bundleRoot, cwd) {
  const args = ["--bundle", bundleRoot, "validate"];

  const localBin = resolveLocalBin(cwd);
  if (localBin) {
    const attempt = runCommand(localBin, args, CLI_TIMEOUT_MS);
    if (attempt.started) return parseProblems(attempt);
  }

  const primary = runCommand("strauss-kb", args, CLI_TIMEOUT_MS);
  if (primary.started) return parseProblems(primary);

  const npxArgs = [
    "-y",
    "--@saasontools:registry=https://registry.npmjs.org",
    "-p",
    `@saasontools/strauss-kb@${PINNED_STRAUSS_KB_VERSION}`,
    "strauss-kb",
    ...args,
  ];
  const fallback = runCommand("npx", npxArgs, NPX_TIMEOUT_MS);
  if (!fallback.started) return null;
  return parseProblems(fallback);
}

function parseProblems(attempt) {
  try {
    const parsed = JSON.parse(attempt.stdout || "[]");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Runs one command and classifies the outcome as `started` or not. "Not
 * started" (`ENOENT`, no such command) is the only case worth trying a
 * further fallback for; a `started` result covers both a normal exit
 * (whatever its status — `validate` exits 1 when it found problems, and
 * still wrote them to stdout) and one killed by the timeout, which the
 * caller stops on rather than chaining further.
 *
 * `shell: true` on Windows only, matching what this exact scenario needs:
 * both a bare `strauss-kb`/`npx` lookup and the `.bin` shims npm installs
 * are `.cmd` files there, and `CreateProcess` cannot launch a batch file
 * directly — Windows needs `cmd.exe` in the loop regardless (confirmed by
 * CI: `shell: false` here made every one of these paths fail to start on
 * `windows-latest`, full stop, not just the ones this repo controls the
 * content of).
 *
 * That reintroduces the exact hazard a `shell: true` finding warns about,
 * though, and for a documented reason: Node forces `windowsVerbatimArguments:
 * true` the moment `shell` is set on Windows, which switches OFF Node's own
 * argument escaping — the caller becomes responsible for it (confirmed by
 * CI too: a `bundleRoot` containing a space broke without this). `args` is
 * still always a plain array here, never a hand-built command line — but
 * each element now has to survive both the CommandLineToArgvW boundary
 * (quoteWindowsArg, below) that would otherwise split it on whitespace,
 * and cmd.exe's own line parser, which keeps expanding `%…%` even inside a
 * quoted argument. POSIX needs none of this: `shell: false` unconditionally,
 * argv passed straight to execve, no shell in the loop to parse anything.
 */
function runCommand(command, args, timeoutMs) {
  const win32 = process.platform === "win32";
  const result = spawnSync(command, win32 ? args.map(quoteWindowsArg) : args, {
    encoding: "utf8",
    timeout: timeoutMs,
    shell: win32,
  });

  // A signal means the process was actually running and got killed (by our
  // own timeout, most likely) — it started. Anything else with `error` set
  // (ENOENT and friends) never started at all.
  if (result.error && !result.signal) {
    return { started: false, stdout: "" };
  }
  return { started: true, stdout: result.stdout ?? "" };
}

/**
 * Quotes one argv element for cmd.exe under `windowsVerbatimArguments:
 * true` (see `runCommand`) — Node does none of this itself in that mode.
 * Two independent things need handling: the CommandLineToArgvW boundary
 * (every Windows program, including node.exe itself, parses its own argv
 * this way, so an unquoted space would split one argument into two) and
 * cmd.exe's line parser, which still performs `%NAME%` expansion on text
 * inside double quotes — doubling every percent sign is the standard
 * workaround, since no complete `%…%` pair can then survive from content
 * this function did not itself introduce.
 *
 * This is deliberately not a general shell-metacharacter escaper: the one
 * variable input here is `bundleRoot`, a filesystem path, and Windows path
 * segments cannot contain `< > : " | ? *` to begin with — the characters
 * that make cmd.exe injection dangerous elsewhere are largely not legal
 * path content here regardless of what this function does.
 */
function quoteWindowsArg(arg) {
  const str = String(arg).replace(/%/g, "%%");
  if (str !== "" && !/[\s"]/.test(str)) return str;
  // CommandLineToArgvW quoting: a run of backslashes immediately before a
  // double quote (or at the very end, before the closing quote this adds)
  // must be doubled, and the quote itself escaped.
  const escaped = str
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
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

function safeMain() {
  try {
    return main();
  } catch {
    return 0;
  }
}

process.exit(safeMain());

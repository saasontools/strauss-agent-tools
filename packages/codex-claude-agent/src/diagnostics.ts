import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { lstat, mkdir, statfs } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { RunnerError } from "./errors.js";
import { probeClaudeAuth, SDK_VERSION } from "./sdk.js";
import { DiagnosticsSchema, type Diagnostics } from "./schema.js";
import { repositoryStateDirectory } from "./state.js";
import { readFileNoFollow, writeFileAtomically } from "./utils/secure-files.js";

const execFileAsync = promisify(execFile);
const MINIMUM_SDK_VERSION = "0.3.0";
const CACHE_MS = 10 * 60 * 1_000;
const MINIMUM_DISK_BYTES = 500 * 1024 * 1024;

function atLeast(actual: string, minimum: string): boolean {
  const parse = (value: string) =>
    value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(actual);
  const right = parse(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) > (right[index] ?? 0)) return true;
    if ((left[index] ?? 0) < (right[index] ?? 0)) return false;
  }
  return true;
}

async function command(
  command: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 15_000,
      signal,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const candidate = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      ok: false,
      output:
        `${candidate.stdout ?? ""}${candidate.stderr ?? ""}`.trim() ||
        candidate.message ||
        String(error),
    };
  }
}

function cachePath(root: string): string {
  return path.join(repositoryStateDirectory(root), "diagnostics.json");
}

async function writeDiagnosticsFile(
  filePath: string,
  content: string,
): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new RunnerError(
      "E_EXECUTION",
      `Refusing unsafe diagnostics directory: ${directory}`,
    );
  }
  const existing = await lstat(filePath).catch(() => undefined);
  if (existing?.isSymbolicLink()) {
    throw new RunnerError(
      "E_EXECUTION",
      `Refusing symlinked diagnostics file: ${filePath}`,
    );
  }
  await writeFileAtomically(filePath, content);
}

export async function runDiagnostics(
  root: string,
  options: {
    noCache?: boolean;
    needsWorktree?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<Diagnostics> {
  if (process.env.CODEX_CLAUDE_AGENT_NESTED) {
    throw new RunnerError(
      "E_NESTED",
      "Nested codex-claude-agent invocation is not allowed.",
    );
  }
  if (!options.noCache) {
    try {
      const cached = DiagnosticsSchema.parse(
        JSON.parse(await readFileNoFollow(cachePath(root))),
      );
      const cacheStat = await lstat(cachePath(root));
      if (
        Date.now() - cacheStat.mtimeMs < CACHE_MS &&
        cached.ok &&
        (!options.needsWorktree || cached.freeDiskBytes !== undefined)
      )
        return { ...cached, cached: true };
    } catch {
      // Missing or invalid cache is ignored.
    }
  }

  const checks: Diagnostics["checks"] = [];
  const sdkOk =
    SDK_VERSION !== "unknown" && atLeast(SDK_VERSION, MINIMUM_SDK_VERSION);
  checks.push({
    name: "sdk",
    ok: sdkOk,
    detail: `@anthropic-ai/claude-agent-sdk ${SDK_VERSION}`,
    fix: sdkOk
      ? undefined
      : `Install @anthropic-ai/claude-agent-sdk >= ${MINIMUM_SDK_VERSION}.`,
  });

  let claudeAuth: Diagnostics["claudeAuth"] = "missing";
  if (process.env.ANTHROPIC_API_KEY) {
    claudeAuth = "api-key";
  } else {
    const auth = await command(
      "claude",
      ["auth", "status", "--json"],
      options.signal,
    );
    if (auth.ok && !/not logged|false/i.test(auth.output)) claudeAuth = "login";
    else if (await probeClaudeAuth(10_000, options.signal))
      claudeAuth = "login";
  }
  checks.push({
    name: "auth",
    ok: claudeAuth !== "missing",
    detail:
      claudeAuth === "missing"
        ? "Claude authentication not detected."
        : `Claude auth: ${claudeAuth}`,
    fix:
      claudeAuth === "missing"
        ? "Run `claude auth login` or set ANTHROPIC_API_KEY."
        : undefined,
  });

  const git = await command("git", ["--version"], options.signal);
  const gitVersion = /git version (\d+\.\d+(?:\.\d+)?)/.exec(git.output)?.[1];
  const gitOk =
    git.ok && gitVersion !== undefined && atLeast(gitVersion, "2.30.0");
  checks.push({
    name: "git",
    ok: gitOk,
    detail: git.output || "git not found",
    fix: gitOk ? undefined : "Install Git 2.30 or newer and add it to PATH.",
  });

  let freeDiskBytes: number | undefined;
  if (options.needsWorktree) {
    const disk = await statfs(root);
    freeDiskBytes = disk.bavail * disk.bsize;
    checks.push({
      name: "disk",
      ok: freeDiskBytes >= MINIMUM_DISK_BYTES,
      detail: `${Math.floor(freeDiskBytes / 1024 / 1024)} MB free`,
      fix:
        freeDiskBytes >= MINIMUM_DISK_BYTES
          ? undefined
          : "Free at least 500 MB before creating a worktree.",
    });
  }

  const diagnostics = DiagnosticsSchema.parse({
    ok: checks.every((check) => check.ok),
    cached: false,
    sdkVersion: SDK_VERSION,
    claudeAuth,
    gitVersion,
    freeDiskBytes,
    checks,
  });
  await writeDiagnosticsFile(
    cachePath(root),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
  return diagnostics;
}

export function assertDiagnostics(diagnostics: Diagnostics): void {
  const failure = diagnostics.checks.find((check) => !check.ok);
  if (!failure) return;
  const code =
    failure.name === "auth"
      ? "E_AUTH"
      : failure.name === "sdk"
        ? SDK_VERSION === "unknown"
          ? "E_SDK_MISSING"
          : "E_SDK_VERSION"
        : "E_EXECUTION";
  throw new RunnerError(code, failure.detail, { hint: failure.fix });
}

export function ensureFeatureFlags(
  content: string,
  writableRoot: string,
): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const ensureSectionValues = (
    section: string,
    values: Record<string, string>,
  ): void => {
    let start = lines.findIndex((line) => line.trim() === `[${section}]`);
    if (start < 0) {
      if (lines.at(-1)?.trim()) lines.push("");
      start = lines.push(`[${section}]`) - 1;
    }
    let end = lines.findIndex(
      (line, index) => index > start && /^\s*\[.+\]\s*$/.test(line),
    );
    if (end < 0) end = lines.length;
    for (const [key, value] of Object.entries(values)) {
      const existing = lines.findIndex(
        (line, index) =>
          index > start &&
          index < end &&
          new RegExp(`^\\s*${key}\\s*=`).test(line),
      );
      if (existing >= 0) lines[existing] = `${key} = ${value}`;
      else {
        lines.splice(end, 0, `${key} = ${value}`);
        end += 1;
      }
    }
  };
  ensureSectionValues("features", { hooks: "true", plugin_hooks: "true" });
  const writableLine = lines.findIndex((line) =>
    /^\s*writable_roots\s*=/.test(line),
  );
  const currentRoots =
    writableLine >= 0
      ? [...lines[writableLine]!.matchAll(/"((?:\\.|[^"])*)"/g)].map(
          (match) => JSON.parse(`"${match[1]}"`) as string,
        )
      : [];
  if (!currentRoots.includes(writableRoot)) currentRoots.push(writableRoot);
  ensureSectionValues("sandbox_workspace_write", {
    writable_roots: `[${currentRoots.map((entry) => JSON.stringify(entry)).join(", ")}]`,
  });
  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

export async function setupCodex(
  root: string,
  noCache = false,
): Promise<{ diagnostics: Diagnostics; configPath: string; changed: boolean }> {
  const diagnostics = await runDiagnostics(root, {
    noCache,
    needsWorktree: true,
  });
  const configPath = path.join(
    process.env.CODEX_HOME ?? path.join(homedir(), ".codex"),
    "config.toml",
  );
  const current = await readFileNoFollow(configPath).catch(() => "");
  const next = ensureFeatureFlags(current, path.join(root, ".codex-claude"));
  const changed = next !== current;
  if (changed) {
    await writeDiagnosticsFile(configPath, next);
  }
  return { diagnostics, configPath, changed };
}

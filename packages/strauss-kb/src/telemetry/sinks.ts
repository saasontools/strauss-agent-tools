import { appendFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { normalizeRepoUrl } from "../anchor-resolver/index.js";
import { remoteOriginUrl } from "../drift/git.js";
import type { TelemetryEvent, TelemetryJson } from "./model.js";

export const TELEMETRY_MODES = ["local", "stdout", "off"] as const;
export type TelemetryMode = (typeof TELEMETRY_MODES)[number];

export const EVENTS_FILE = "events.jsonl";

/** Rotation threshold, 10 MiB, and how many rotated files a slug keeps. */
export const ROTATE_AT_BYTES = 10 * 1024 * 1024;
export const MAX_ROTATIONS = 20;

const POST_TIMEOUT_MS = 2_000;

/** Anything but `stdout` and `off` is the default; the mode is read per event. */
export function telemetryMode(): TelemetryMode {
  const value = (process.env["STRAUSS_TELEMETRY"] ?? "").toLowerCase();
  return value === "off" || value === "stdout" ? value : "local";
}

/** Where the local sink writes. Overridable so a test never writes to `$HOME`. */
export function telemetryRoot(): string {
  return (
    process.env["STRAUSS_TELEMETRY_DIR"] ??
    join(homedir(), ".strauss", "telemetry")
  );
}

const slugs = new Map<string, string>();

/**
 * The directory a repository's events go in: `org-name` off the `origin`
 * remote, or the basename of `cwd` when git cannot say. Asked once per process
 * per directory — a subprocess per event would cost more than the append.
 */
export async function repoSlug(cwd: string): Promise<string> {
  const cached = slugs.get(cwd);
  if (cached !== undefined) return cached;
  const slug = slugify(fromRemote(await remoteOriginUrl(cwd)) ?? basename(cwd));
  slugs.set(cwd, slug);
  return slug;
}

/** Test seam: a fresh process has asked git nothing. */
export function resetRepoSlugs(): void {
  slugs.clear();
}

function fromRemote(url: string | null): string | undefined {
  if (!url) return undefined;
  const segments = normalizeRepoUrl(url)
    .replace(/^[a-z0-9+.-]+:\/\//, "")
    .split("/")
    .filter(Boolean);
  return segments.length > 1 ? segments.slice(-2).join("/") : segments[0];
}

/** One path segment: a slug derived from a remote can never leave the root. */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug || "unknown";
}

/** Appends one line, rotating first when the file has reached the cap. */
export async function appendLocal(dir: string, line: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, EVENTS_FILE);
  await rotateIfFull(dir, path);
  await appendFile(path, line);
}

/**
 * Renames to `events.<n>.jsonl` one above the highest `n` on disk, so file
 * order is age order, then drops the oldest past `MAX_ROTATIONS`.
 */
async function rotateIfFull(dir: string, path: string): Promise<void> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return;
  }
  if (size < ROTATE_AT_BYTES) return;
  const rotated = await rotatedNumbers(dir);
  const next = (rotated.at(-1) ?? 0) + 1;
  try {
    await rename(path, join(dir, `events.${next}.jsonl`));
  } catch (error) {
    // Another process rotated between the stat and the rename; its rotation is
    // as good as ours, and the caller's append recreates the file.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return;
  }
  for (const n of rotated.slice(
    0,
    Math.max(0, rotated.length + 1 - MAX_ROTATIONS),
  )) {
    await rm(join(dir, `events.${n}.jsonl`), { force: true });
  }
}

/** The rotated files' numbers, oldest first. */
async function rotatedNumbers(dir: string): Promise<number[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  return names
    .map((name) => /^events\.(\d+)\.jsonl$/.exec(name)?.[1])
    .flatMap((digits) => (digits === undefined ? [] : [Number(digits)]))
    .sort((left, right) => left - right);
}

/** One markdown line for a GitHub job summary. */
export function stepSummaryLine(event: TelemetryEvent): string {
  const fields = [
    ...(event.durationMs === undefined ? [] : [`${event.durationMs}ms`]),
    ...Object.entries(event.data).map(
      ([key, value]) => `${inline(key)}=${inline(scalar(value))}`,
    ),
  ];
  const tail = fields.length ? ` — ${fields.join(", ")}` : "";
  return `- \`${inline(event.component)}\` ${inline(event.event)}${tail}\n`;
}

/** A value cannot end the code span, start a table cell, or end the line. */
function inline(value: string): string {
  return value.replace(/[`|\\]/g, "\\$&").replace(/\r?\n/g, "\\n");
}

function scalar(value: TelemetryJson): string {
  return typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value);
}

/**
 * Rejects on any transport failure or once the timeout fires. The timer is
 * unref'd: a telemetry POST must never be why a CLI process stays alive.
 */
export async function postEvent(
  url: string,
  event: TelemetryEvent,
  signal?: AbortSignal,
): Promise<void> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), POST_TIMEOUT_MS);
  timer.unref();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: signal
        ? AbortSignal.any([signal, timeout.signal])
        : timeout.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
  KB_COMPONENT,
  telemetryEventSchema,
  type TelemetryEventInput,
} from "./model.js";
import {
  appendLocal,
  postEvent,
  repoSlug,
  stepSummaryLine,
  telemetryMode,
  telemetryRoot,
} from "./sinks.js";

const warned = new Set<string>();

/** One warning per process per cause: telemetry must never become the noise. */
function warnOnce(cause: string, message: string): void {
  if (warned.has(cause)) return;
  warned.add(cause);
  process.stderr.write(`strauss-kb: telemetry: ${message}\n`);
}

/** How long a process about to exit gives the HTTP sink to finish. */
export const TELEMETRY_FLUSH_MS = 250;

type InFlight = { done: Promise<void>; abort: () => void };
const posting = new Set<InFlight>();

/**
 * Resolves once every fire-and-forget HTTP post so far has settled. With a cap,
 * posts still running when it elapses are aborted — a collector that does not
 * answer must not be why a command's process stays alive.
 */
export async function telemetryIdle(capMs = 0): Promise<void> {
  const posts = [...posting];
  if (!posts.length) return;
  const settled = Promise.all(posts.map((post) => post.done));
  if (capMs > 0) {
    await Promise.race([settled, cap(capMs)]);
    for (const post of posts) post.abort();
  }
  await settled;
}

/** An unref'd timer: waiting for the cap never itself holds the loop open. */
function cap(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/** Test seam: a fresh process has warned about nothing. */
export function resetTelemetryWarnings(): void {
  warned.clear();
}

/**
 * Record one operation. Never throws, and never blocks the caller past the
 * local append — a sink that is slow or down must not slow the command down
 * with it, so the optional HTTP POST is fired and forgotten.
 */
export async function emit(event: TelemetryEventInput): Promise<void> {
  try {
    const mode = telemetryMode();
    if (mode === "off") return;

    const parsed = telemetryEventSchema.safeParse({
      ts: new Date().toISOString(),
      ...event,
    });
    if (!parsed.success) {
      warnOnce(
        "schema",
        `dropped ${event.component}/${event.event}: ${
          parsed.error.issues[0]?.message ?? "invalid event"
        }`,
      );
      return;
    }

    const line = `${JSON.stringify(parsed.data)}\n`;
    // stdout is the MCP channel; a telemetry line on it is a protocol error.
    if (mode === "stdout") process.stderr.write(line);
    else {
      await appendLocal(
        join(telemetryRoot(), await repoSlug(process.cwd())),
        line,
      );
    }

    const summary = process.env["GITHUB_STEP_SUMMARY"];
    if (summary) await appendFile(summary, stepSummaryLine(parsed.data));

    const url = process.env["STRAUSS_TELEMETRY_URL"];
    if (url) {
      const abort = new AbortController();
      const done = postEvent(url, parsed.data, abort.signal).catch(() =>
        warnOnce(
          "url",
          `POST to ${origin(url)} failed; the local sink still has it`,
        ),
      );
      const post: InFlight = { done, abort: () => abort.abort() };
      posting.add(post);
      void done.finally(() => posting.delete(post));
    }
  } catch (error) {
    warnOnce("sink", `sink unavailable: ${(error as Error).message}`);
  }
}

/** Origin only: a collector token rides in the query string or the userinfo. */
function origin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "the configured collector";
  }
}

/** One `strauss-kb` operation — the shape every command in this package emits. */
export function emitKb(
  event: string,
  fields: Omit<TelemetryEventInput, "component" | "event"> = {},
): Promise<void> {
  return emit({ component: KB_COMPONENT, event, ...fields });
}

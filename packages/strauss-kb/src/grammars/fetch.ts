import { fetchTimeoutMs } from "../remote-repo/index.js";
import type { GrammarOptions, Pinned } from "./model.js";
import { matches } from "./store.js";

/** Attempts per grammar, and the pause after attempt `n`. */
const ATTEMPTS = 3;
const BACKOFF_MS = 250;

/**
 * The manifest pins a fully resolved URL per pack. An override — a mirror, or
 * the suite's own server — replaces its scheme and host and nothing else, so
 * one setting redirects every pack whatever CDN it was pinned from.
 */
export function grammarUrl(url: string, override?: string): string {
  const base = grammarsBaseUrl(override);
  if (!base) return url;
  let root = base;
  while (root.endsWith("/")) root = root.slice(0, -1);
  const pinned = new URL(url);
  return `${root}${pinned.pathname}${pinned.search}`;
}

export function grammarsBaseUrl(override?: string): string | undefined {
  return override ?? process.env["STRAUSS_KB_GRAMMARS_URL"];
}

/** Bytes, or why the last attempt failed — for the log line and the hint. */
export type Download = { bytes: Uint8Array } | { cause: string };

/**
 * A pinned part's bytes, or a cause — never a throw. Grammar and tags query
 * take the same path: a hash mismatch is not retried (the CDN will serve the
 * same file again; the manifest is the safety), while timeouts, dropped
 * connections, 5xx and 429 get `ATTEMPTS` tries.
 */
export async function downloadPart(
  url: string,
  name: string,
  entry: Pinned,
  options: GrammarOptions = {},
): Promise<Download> {
  const log =
    options.log ?? ((line: string) => void process.stderr.write(line));
  const weight =
    entry.bytes === undefined ? "" : ` (${size(entry.bytes)} from manifest)`;
  log(`strauss-kb: downloading ${name}${weight} from ${url}\n`);

  let cause = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const outcome = await attemptDownload(url, entry, options.fetchTimeoutMs);
    if ("bytes" in outcome) return outcome;
    cause = outcome.cause;
    log(
      `strauss-kb: ${name} attempt ${attempt}/${ATTEMPTS} failed: ${cause}\n`,
    );
    if (!outcome.retry) break;
    if (attempt < ATTEMPTS) await pause(BACKOFF_MS * attempt);
  }
  log(`strauss-kb: ${name} not downloaded: ${cause}\n`);
  return { cause };
}

async function attemptDownload(
  url: string,
  entry: Pinned,
  timeoutMs: number | undefined,
): Promise<{ bytes: Uint8Array } | { cause: string; retry: boolean }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(fetchTimeoutMs(timeoutMs)),
    });
    if (!response.ok) {
      return {
        cause: `HTTP ${response.status}`,
        retry: response.status >= 500 || response.status === 429,
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!matches(bytes, entry))
      return { cause: "sha256 mismatch", retry: false };
    return { bytes };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return { cause: timedOut ? "timeout" : "network error", retry: true };
  }
}

/** What the manifest says the file weighs, for the download line. */
function size(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

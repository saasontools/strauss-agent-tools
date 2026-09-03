import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeRepoUrl } from "../anchor-resolver/repo-identity.js";

/** Where bare mirrors live. Overridable so a test never writes to `$HOME`. */
export function repoCacheDir(override?: string): string {
  return (
    override ??
    process.env["STRAUSS_KB_REPO_CACHE"] ??
    join(homedir(), ".strauss", "repo-cache")
  );
}

/** Fetch timeout in ms; a remote that hangs must not hang the run. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export function fetchTimeoutMs(override?: number): number {
  if (override !== undefined) return override;
  const fromEnv = Number(process.env["STRAUSS_KB_FETCH_TIMEOUT_MS"]);
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : DEFAULT_FETCH_TIMEOUT_MS;
}

/**
 * `<cache>/<host>/<org>/<name>.git` for a repository URL.
 *
 * `null` when the declared `repo` carries no path git could fetch — a short
 * form like `org/name` names a repository without saying where it lives.
 */
export function cachePathFor(repo: string, cacheDir: string): string | null {
  const normalized = normalizeRepoUrl(repo);
  const scheme = /^[a-z0-9+.-]+:\/\//.exec(normalized);
  if (!scheme) return null;
  const segments = normalized
    .slice(scheme[0].length)
    .split("/")
    .filter(Boolean)
    .map((segment: string) => safeSegment(segment));
  if (segments.length < 2 || segments.some((segment) => segment === null)) {
    return null;
  }
  const path = segments as string[];
  return join(cacheDir, ...path.slice(0, -1), `${path[path.length - 1]}.git`);
}

/**
 * A path segment a repository URL may contribute to a directory name. A
 * Windows `file:///C:/…` contributes its drive as the first one, and `:` is
 * not legal in a directory name there, so it is folded like any other
 * separator rather than special-cased.
 */
function safeSegment(value: string): string | null {
  return value === "." || value === ".." || value.includes("\0")
    ? null
    : value.replace(/[/\\:]/g, "-");
}

/**
 * A git ref name holding one fetched rev, stable across runs so a second run
 * reads the cache instead of fetching again.
 */
export function revRef(rev: string): string {
  // `.` is dropped rather than kept: `v1..2` would be an invalid ref name.
  const safe = rev.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
  let hash = 5381;
  for (let at = 0; at < rev.length; at++) {
    hash = ((hash * 33) ^ rev.charCodeAt(at)) >>> 0;
  }
  return `refs/strauss/${safe}-${hash.toString(16)}`;
}

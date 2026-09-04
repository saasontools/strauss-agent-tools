import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { KbAnchor } from "../kb-record.schema.js";

const execFileAsync = promisify(execFile);

/* -------------------------------------------------------------------------
 * Which repository is this?
 * ---------------------------------------------------------------------- */

/**
 * Repository identity, normalised on both sides and compared rather than
 * parsed; see ARCHITECTURE.
 *
 * Trailing slashes come off in a loop rather than with `/\/+$/`, which
 * backtracks quadratically on untrusted bundle data.
 */
export function normalizeRepoUrl(value: string): string {
  let url = value.trim().replace(/^git\+/, "");
  // scp-style: git@host:org/name
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(url);
  if (scp) url = `https://${scp[1]}/${scp[2]}`;
  url = url.replace(/^ssh:\/\/(?:[^@/]+@)?/, "https://");
  // Slashes, then `.git`, then slashes again: a remote is written `…/name`,
  // `…/name.git`, and `…/name.git/` interchangeably, and all three name one
  // repository.
  url = trimTrailingSlashes(url);
  if (url.endsWith(".git")) url = url.slice(0, -4);
  return trimTrailingSlashes(url).toLowerCase();
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

/**
 * Does this spelling say where the repository lives?
 *
 * Only a full URL can be fetched from. A short form still matches this root's
 * own origin, which is why `validate` warns rather than rejects.
 */
export function isCanonicalRepoUrl(value: string): boolean {
  return /^[a-z0-9+.-]+:\/\//.test(normalizeRepoUrl(value));
}

/** `org/name` from a normalized URL, or "" when it carries no host. */
function repoPath(normalized: string): string {
  const withoutScheme = normalized.replace(/^[a-z0-9+.-]+:\/\//, "");
  const segments = withoutScheme.split("/").filter(Boolean);
  return segments.length > 1 ? segments.slice(1).join("/") : "";
}

/**
 * Does `declared` name the repository `originUrl` points at?
 *
 * Three spellings are accepted, narrowest first: the whole URL, the `org/name`
 * path, and the bare repository name. The bare name is the loosest and could
 * in principle collide across organisations; it is accepted because it is what
 * people actually write, and the cost of a false positive here is resolving an
 * anchor that was already meant for a repository of that name.
 */
export function repoIdentifies(
  declared: string,
  originUrl: string | null,
): boolean {
  if (!originUrl) return false;
  const origin = normalizeRepoUrl(originUrl);
  const want = normalizeRepoUrl(declared);
  if (!want || !origin) return false;
  if (want === origin) return true;

  const path = repoPath(origin);
  if (!path) return false;
  return want === path || want === (path.split("/").pop() ?? "");
}

/**
 * The `origin` remote of the tree at `repoRoot`, or `null`.
 *
 * `null` for anything that is not a git checkout, has no `origin`, or where
 * git is unavailable — all of which mean the same thing here: this root cannot
 * prove which repository it is. An anchor naming a repository is then treated
 * as foreign rather than resolved hopefully, because a hash that matched by
 * coincidence would be recorded as evidence.
 */
export async function repoOriginUrl(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoRoot, "config", "--get", "remote.origin.url"],
      { timeout: 5_000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * "Is this anchor for another repository?", answered without asking git until
 * an anchor actually declares a `repo`, and only once per run after that.
 */
export class LazyOrigin {
  private url: string | null = null;
  private asked = false;

  constructor(private readonly repoRoot: string) {}

  /** Asks git once, so later `isForeign` calls need no await. */
  async prime(): Promise<void> {
    if (this.asked) return;
    this.url = await repoOriginUrl(this.repoRoot);
    this.asked = true;
  }

  /** Only meaningful after `prime`; an unprimed origin identifies nothing. */
  isForeign(anchor: KbAnchor): boolean {
    if (!anchor.repo) return false;
    return !repoIdentifies(anchor.repo, this.url);
  }

  async foreign(anchor: KbAnchor): Promise<boolean> {
    if (!anchor.repo) return false;
    await this.prime();
    return this.isForeign(anchor);
  }
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AnchorRead } from "../anchor-resolver/model.js";
import { filePathIsSafe, refShapeIsSafe } from "../remote-repo/validate.js";

const execFileAsync = promisify(execFile);

/**
 * Reading a committed file, for the one thing a working tree cannot answer:
 * what the anchored code looked like when the record was written.
 *
 * `ref` and `file` come off an anchor, which is a `.md` file the reader did not
 * write. An argv array stops a shell; it does not stop git's own option
 * parsing, so every positional that derives from bundle data goes after
 * `--end-of-options` and is shape-checked before a subprocess exists. Nothing
 * here fetches — a rev this checkout does not have is a finding, never a
 * network call.
 *
 * The shape checks themselves are `remote-repo/validate.ts`'s: one definition
 * of what a `ref` and a `file` may be, whichever read path asks.
 */

/** Output cap. A recovered file is source, and source this large is not. */
export const MAX_GIT_OUTPUT_BYTES = 1_048_576;

const GIT_TIMEOUT_MS = 5_000;

type GitResult = { ok: true; stdout: string } | { ok: false };

/**
 * `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` are stripped from the child:
 * a caller's environment must not be able to redirect a read that `-C` already
 * addressed.
 */
async function git(cwd: string, args: string[]): Promise<GitResult> {
  const env = { ...process.env };
  delete env["GIT_DIR"];
  delete env["GIT_WORK_TREE"];
  delete env["GIT_INDEX_FILE"];
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      env,
    });
    return { ok: true, stdout };
  } catch {
    return { ok: false };
  }
}

/**
 * The committed file an old-side anchor names, at its own `ref` and nowhere
 * else. No history fallback: `side: "old"` asserts one exact tree, so guessing
 * a nearby commit would answer a question the anchor did not ask.
 *
 * A rev this clone does not carry is `ref-unavailable` — unchecked, not
 * `gone`: a shallow checkout is no evidence the code went away.
 */
export async function readFileAtRef(
  repoRoot: string,
  anchor: { file: string; ref?: string },
): Promise<AnchorRead> {
  if (!filePathIsSafe(anchor.file))
    return { ok: false, reason: "outside-repo" };
  if (!anchor.ref || !refShapeIsSafe(anchor.ref)) {
    return { ok: false, reason: "ref-unreadable" };
  }
  const blob = await catBlob(repoRoot, anchor.ref, anchor.file);
  if (blob !== null) return { ok: true, source: blob };
  return {
    ok: false,
    reason: (await hasCommit(repoRoot, anchor.ref))
      ? "ref-unreadable"
      : "ref-unavailable",
  };
}

/** Whether the rev resolves to a commit here. `^{commit}` is ours, not bundle data. */
async function hasCommit(repoRoot: string, ref: string): Promise<boolean> {
  const found = await git(repoRoot, [
    "cat-file",
    "-e",
    "--end-of-options",
    `${ref}^{commit}`,
  ]);
  return found.ok;
}

/** Repository-relative paths, for the `moved` search. Empty when git fails. */
export async function listRepoFiles(repoRoot: string): Promise<string[]> {
  const result = await git(repoRoot, ["ls-files", "-z", "--cached"]);
  if (!result.ok) return [];
  return result.stdout.split("\0").filter(Boolean);
}

/** The `origin` remote of the tree at `cwd`, or `null` when there is none. */
export async function remoteOriginUrl(cwd: string): Promise<string | null> {
  const result = await git(cwd, ["config", "--get", "remote.origin.url"]);
  return result.ok ? result.stdout.trim() || null : null;
}

/** Where a recovered file came from, so a packet can say how far back it looked. */
export type OldSourceOrigin =
  /** `git cat-file blob <anchor.ref>:<file>` — the rev the record named. */
  | { kind: "ref"; ref: string }
  /** The last commit touching the path before `resolved_at`. */
  | { kind: "history"; ref: string };

export type OldSource =
  | { ok: true; source: string; origin: OldSourceOrigin }
  /**
   * No committed text to diff against: no usable `ref`, no history before
   * `resolved_at`, or the path did not exist at the rev that was found.
   */
  | { ok: false; reason: "unrecoverable" };

/**
 * The anchored file as it was, `ref` first and the record's own timestamp
 * second.
 *
 * `ref` is what the record asserted the evidence was taken at, so it is tried
 * before anything inferred. Falling back to `git log --before=<resolved_at>`
 * recovers the far commoner case of an anchor that was stamped but never
 * pinned; it is weaker — the last commit before a timestamp is a guess about
 * which tree the reader had — which is why the origin travels with the text.
 */
export async function readOldSource(
  repoRoot: string,
  anchor: { file: string; ref?: string; resolved_at?: string },
): Promise<OldSource> {
  if (!filePathIsSafe(anchor.file))
    return { ok: false, reason: "unrecoverable" };

  if (anchor.ref && refShapeIsSafe(anchor.ref)) {
    const shown = await catBlob(repoRoot, anchor.ref, anchor.file);
    if (shown !== null) {
      return {
        ok: true,
        source: shown,
        origin: { kind: "ref", ref: anchor.ref },
      };
    }
  }

  const at = anchor.resolved_at;
  if (!at || Number.isNaN(Date.parse(at))) {
    return { ok: false, reason: "unrecoverable" };
  }
  // `--before` is a git-parsed value, not a path or a rev, and it is passed as
  // one `--before=<date>` token so it can never be read as two arguments.
  const found = await git(repoRoot, [
    "log",
    "-1",
    "--format=%H",
    `--before=${at}`,
    "--end-of-options",
    "HEAD",
    "--",
    anchor.file,
  ]);
  const sha = found.ok ? found.stdout.trim() : "";
  if (!sha || !refShapeIsSafe(sha))
    return { ok: false, reason: "unrecoverable" };

  const shown = await catBlob(repoRoot, sha, anchor.file);
  if (shown === null) return { ok: false, reason: "unrecoverable" };
  return { ok: true, source: shown, origin: { kind: "history", ref: sha } };
}

/**
 * `<rev>:<path>` is one positional, so both halves are validated together.
 * `cat-file blob` rather than `show`: a path naming a directory must fail, and
 * `show` would hand back a tree listing to be hashed as if it were source.
 */
async function catBlob(
  repoRoot: string,
  ref: string,
  file: string,
): Promise<string | null> {
  const path = file.replace(/^\.\//, "");
  const result = await git(repoRoot, [
    "cat-file",
    "blob",
    "--end-of-options",
    `${ref}:${path}`,
  ]);
  return result.ok ? result.stdout : null;
}

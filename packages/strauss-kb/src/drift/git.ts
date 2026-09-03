import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
 * SAA-709 lands the same guards in `src/remote-repo/validate.ts` for the
 * cross-repo read path; when that merges, these two collapse into one module.
 */

/** Long enough for any real branch or sha, short enough to bound the argv. */
const MAX_REF_LENGTH = 200;

/** Output cap. A recovered file is source, and source this large is not. */
export const MAX_GIT_OUTPUT_BYTES = 1_048_576;

const GIT_TIMEOUT_MS = 5_000;

/**
 * The shape a `ref` must have to reach git at all. The leading class excludes
 * `-`, so no ref can be read as an option; `@`, `{`, `\\`, `:`, spaces and
 * control characters are outside the class entirely.
 */
const REF_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function validRef(ref: string): boolean {
  if (!ref || ref.length > MAX_REF_LENGTH) return false;
  // `a..b` is a range, not a rev, and `git show` would resolve it as one.
  if (ref.includes("..") || ref.includes("\0")) return false;
  return REF_SHAPE.test(ref);
}

/**
 * A `file` that may become the path half of `<rev>:<path>`. A leading `-` would
 * be an option; `..` would climb out of the tree the anchor describes.
 */
export function validPath(file: string): boolean {
  const path = file.replace(/^\.\//, "");
  if (!path || path.startsWith("-") || path.includes("\0")) return false;
  return !path.split("/").includes("..");
}

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

/** Repository-relative paths, for the `moved` search. Empty when git fails. */
export async function listRepoFiles(repoRoot: string): Promise<string[]> {
  const result = await git(repoRoot, ["ls-files", "-z", "--cached"]);
  if (!result.ok) return [];
  return result.stdout.split("\0").filter(Boolean);
}

/** Where a recovered file came from, so a packet can say how far back it looked. */
export type OldSourceOrigin =
  /** `git show <anchor.ref>:<file>` — the rev the record itself named. */
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
  if (!validPath(anchor.file)) return { ok: false, reason: "unrecoverable" };

  if (anchor.ref && validRef(anchor.ref)) {
    const shown = await showFile(repoRoot, anchor.ref, anchor.file);
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
  if (!sha || !validRef(sha)) return { ok: false, reason: "unrecoverable" };

  const shown = await showFile(repoRoot, sha, anchor.file);
  if (shown === null) return { ok: false, reason: "unrecoverable" };
  return { ok: true, source: shown, origin: { kind: "history", ref: sha } };
}

/** `<rev>:<path>` is one positional, so both halves are validated together. */
async function showFile(
  repoRoot: string,
  ref: string,
  file: string,
): Promise<string | null> {
  const path = file.replace(/^\.\//, "");
  const result = await git(repoRoot, [
    "show",
    "--end-of-options",
    `${ref}:${path}`,
  ]);
  return result.ok ? result.stdout : null;
}

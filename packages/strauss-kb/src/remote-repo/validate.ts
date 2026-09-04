import { git } from "./git.js";

/**
 * `repo`, `ref`, and `file` are bundle data — a `.md` file the reader did not
 * write — and every one of them reaches `git` argv. An argv array stops the
 * shell, not git's own option parsing: `git fetch origin --upload-pack=<cmd>`
 * runs `<cmd>`, `ext::sh -c <cmd>` is a transport that does the same, and
 * `file:///` reads any repository the process can see. So each value is checked
 * against a shape before git ever sees it, and a value that fails is a finding
 * on the record rather than a command.
 */

/** Long enough for any real branch, short enough to bound the argv. */
const MAX_REF_LENGTH = 200;

/**
 * The shape a `ref` must have to reach git at all. The leading character class
 * excludes `-`, so no ref can be read as an option; `@`, `{`, `\`, spaces, and
 * control characters are outside the class entirely.
 */
const REF_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** Checked with no subprocess, so an invalid ref never spawns git. */
export function refShapeIsSafe(ref: string): boolean {
  if (!ref || ref.length > MAX_REF_LENGTH) return false;
  // `a..b` is a range, not a rev, and `git fetch` would resolve it as one.
  if (ref.includes("..")) return false;
  return REF_SHAPE.test(ref);
}

/**
 * git's own opinion of the name, asked only once the shape has made it safe to
 * pass. `--allow-onelevel` because `main` and a bare sha are both legal here.
 */
export async function refIsWellFormed(ref: string): Promise<boolean> {
  if (!refShapeIsSafe(ref)) return false;
  const checked = await git(["check-ref-format", "--allow-onelevel", ref]);
  return checked.ok;
}

/**
 * A `file` that may become the path half of `<rev>:<path>`. A leading `-` would
 * be an option; `..` would climb out of the tree the anchor describes.
 */
export function filePathIsSafe(file: string): boolean {
  const path = file.replace(/^\.\//, "");
  if (!path || path.startsWith("-") || path.includes("\0")) return false;
  return !path.split("/").includes("..");
}

/** Transports a remote may be fetched over. Plaintext `http` is not one. */
const DEFAULT_PROTOCOLS = ["https", "ssh", "git"] as const;

/**
 * `STRAUSS_KB_REPO_PROTOCOLS` widens the set — a comma list. It exists so the
 * test suite can serve `file://` remotes off disk; it is not a production knob,
 * because every protocol it can add is one that reads or runs something local.
 */
export function allowedProtocols(): string[] {
  const raw = process.env["STRAUSS_KB_REPO_PROTOCOLS"];
  if (raw === undefined) return [...DEFAULT_PROTOCOLS];
  const listed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return listed.length ? listed : [...DEFAULT_PROTOCOLS];
}

/**
 * A `repo` naming a repository without saying where it lives (`org/name`).
 * There is nothing to fetch from, which is not the same finding as a `repo`
 * spelled in a transport we refuse to use.
 */
export function isShortRepoName(repo: string): boolean {
  return /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(repo.trim());
}

/** scp-style `git@host:org/name`, which git reads as ssh. */
const SCP_LIKE = /^[\w.-]+@[\w.-]+:(?!\/)\S+$/;

const URL_SCHEME = /^([A-Za-z0-9+.-]+):\/\//;

// eslint-disable-next-line no-control-regex -- refusing control bytes is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Checked with no subprocess, so a rejected URL never reaches a git remote. */
export function repoUrlIsSafe(repo: string): boolean {
  const url = repo.trim();
  if (!url || url.startsWith("-") || CONTROL_CHARS.test(url)) return false;

  const allowed = allowedProtocols();
  if (SCP_LIKE.test(url)) return allowed.includes("ssh");

  const scheme = URL_SCHEME.exec(url);
  // No `://` means no transport we recognise — `ext::sh -c …` lands here.
  if (!scheme?.[1]) return false;
  if (!allowed.includes(scheme[1].toLowerCase())) return false;

  // `https://user:password@host/…` puts a secret in a URL a bundle wrote; a
  // credential belongs in git's own helper, not in a record.
  const authority = url.slice(scheme[0].length).split("/")[0] ?? "";
  const at = authority.lastIndexOf("@");
  return at < 0 || !authority.slice(0, at).includes(":");
}

/**
 * Defence in depth behind the allowlist: even if a URL slipped past it, git
 * itself refuses the two transports that run or read something local.
 */
export function protocolArgs(): string[] {
  const allowed = allowedProtocols();
  return [
    "-c",
    "protocol.ext.allow=never",
    "-c",
    `protocol.file.allow=${allowed.includes("file") ? "user" : "never"}`,
  ];
}

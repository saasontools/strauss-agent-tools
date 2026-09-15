import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { resolve } from "node:path";
import { runGit, type GitOptions } from "./run.js";
import { attributeNameIsSafe, localRevShapeIsSafe } from "./shape.js";

export type AttributeValues = Readonly<Record<string, string>>;

export type CheckAttr = {
  /** Set or valued attributes per path; `unspecified` is left out. */
  attrs: Map<string, AttributeValues>;
  /** Read at `source`. False means the working tree answered, or nothing did. */
  pinned: boolean;
  /** The clone's `info/attributes` sets something, so the read is not pinned. */
  local: boolean;
};

const DEFAULT_ATTR_MAX_BYTES = 16 * 1_048_576;
const DEFAULT_ATTR_TIMEOUT_MS = 10_000;

/** More than any hand-kept `info/attributes`; the rest is not read. */
const LOCAL_BYTES = 65_536;

/** POSIX open flags; Windows has neither, and no FIFO to block on. */
const NO_FOLLOW = (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
const NON_BLOCK = (constants as { O_NONBLOCK?: number }).O_NONBLOCK ?? 0;

/**
 * `.gitattributes` as they stood at `source`, for every path, in one batched
 * call. The global and system attribute files are never read; the clone's
 * `info/attributes` cannot be switched off, so any attribute set there
 * unpins the read. git before 2.40 has no `--source`: the working tree
 * answers, unpinned. A `source` git cannot resolve, or an unsafe one, reads
 * nothing at all.
 */
export async function checkAttr(
  cwd: string,
  source: string | null,
  paths: readonly string[],
  attributes: readonly string[],
  limits: Pick<GitOptions, "timeoutMs" | "maxBytes"> = {},
): Promise<CheckAttr> {
  const bad = attributes.find((name) => !attributeNameIsSafe(name));
  if (bad !== undefined) throw new TypeError(`unsafe attribute name: ${bad}`);

  const attrs = new Map<string, AttributeValues>();
  const listed = paths.filter((path) => path && !path.includes("\0"));
  if (source !== null && !localRevShapeIsSafe(source)) {
    return { attrs, pinned: false, local: false };
  }
  if (!listed.length || !attributes.length) {
    return { attrs, pinned: source !== null, local: false };
  }

  const run = (extra: string[]) =>
    runGit(
      [
        "-c",
        "core.attributesFile=",
        "check-attr",
        ...extra,
        "--stdin",
        "-z",
        ...attributes,
      ],
      {
        cwd,
        input: `${listed.join("\0")}\0`,
        timeoutMs: limits.timeoutMs ?? DEFAULT_ATTR_TIMEOUT_MS,
        maxBytes: limits.maxBytes ?? DEFAULT_ATTR_MAX_BYTES,
        env: { GIT_ATTR_NOSYSTEM: "1" },
      },
    );

  // Asked first: git reads that file too, and a FIFO there would hold
  // check-attr until the timeout for an answer that would not be pinned.
  if (source !== null && (await hasLocalAttributes(cwd))) {
    return { attrs, pinned: false, local: true };
  }

  let pinned = source !== null;
  let result = await run(source !== null ? [`--source=${source}`] : []);
  // Only git rejecting the option itself falls back: an unresolvable rev must
  // not let the working tree answer for the base.
  if (source !== null && !result.ok && /unknown option/i.test(result.stderr)) {
    pinned = false;
    result = await run([]);
  }
  if (!result.ok) return { attrs, pinned: false, local: false };

  // -z output: path NUL attribute NUL value NUL, repeated.
  const fields = result.stdout.split("\0");
  for (let at = 0; at + 2 < fields.length; at += 3) {
    const path = fields[at] ?? "";
    const name = fields[at + 1] ?? "";
    const value = fields[at + 2] ?? "";
    if (!path || value === "unspecified") continue;
    attrs.set(path, { ...attrs.get(path), [name]: value });
  }
  return { attrs, pinned, local: false };
}

/**
 * Whether the clone's `info/attributes` sets anything. Any line counts: a
 * macro or an unset lowers as surely as a named class. Anything but a missing
 * or regular file — a FIFO, a symlink — counts too, and is never read.
 */
async function hasLocalAttributes(cwd: string): Promise<boolean> {
  const where = await runGit(["rev-parse", "--git-path", "info/attributes"], {
    cwd,
  });
  if (!where.ok) return false;
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      resolve(cwd, where.stdout.trim()),
      constants.O_RDONLY | NO_FOLLOW | NON_BLOCK,
    );
    if (!(await handle.stat()).isFile()) return true;
    const buffer = Buffer.alloc(LOCAL_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, LOCAL_BYTES, 0);
    return buffer
      .toString("utf8", 0, bytesRead)
      .split("\n")
      .some((line) => {
        const text = line.trim();
        return text !== "" && !text.startsWith("#");
      });
  } catch (error) {
    return (error as { code?: unknown }).code !== "ENOENT";
  } finally {
    await handle?.close();
  }
}

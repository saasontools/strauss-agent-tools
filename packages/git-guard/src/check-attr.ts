import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runGit, type GitOptions } from "./run.js";
import { attributeNameIsSafe, localRevShapeIsSafe } from "./shape.js";

export type AttributeValues = Readonly<Record<string, string>>;

export type CheckAttr = {
  /** Set or valued attributes per path; `unspecified` is left out. */
  attrs: Map<string, AttributeValues>;
  /** Read at `source`. False means the working tree answered, or nothing did. */
  pinned: boolean;
  /** `.git/info/attributes` names one of the attributes, so the read is not pinned. */
  local: boolean;
};

const DEFAULT_ATTR_MAX_BYTES = 16 * 1_048_576;
const DEFAULT_ATTR_TIMEOUT_MS = 10_000;

/**
 * `.gitattributes` as they stood at `source`, for every path, in one batched
 * call. The global and system attribute files are never read; the clone's
 * `info/attributes` cannot be switched off, so naming an attribute there
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

  let pinned = source !== null;
  const [first, local] = await Promise.all([
    run(source !== null ? [`--source=${source}`] : []),
    source !== null ? namesAttribute(cwd, attributes) : false,
  ]);
  let result = first;
  // Only git rejecting the option itself falls back: an unresolvable rev must
  // not let the working tree answer for the base.
  if (source !== null && !result.ok && /unknown option/i.test(result.stderr)) {
    pinned = false;
    result = await run([]);
  }
  if (!result.ok) return { attrs, pinned: false, local };

  // -z output: path NUL attribute NUL value NUL, repeated.
  const fields = result.stdout.split("\0");
  for (let at = 0; at + 2 < fields.length; at += 3) {
    const path = fields[at] ?? "";
    const name = fields[at + 1] ?? "";
    const value = fields[at + 2] ?? "";
    if (!path || value === "unspecified") continue;
    attrs.set(path, { ...attrs.get(path), [name]: value });
  }
  return { attrs, pinned: pinned && !local, local };
}

/** Whether the clone's `info/attributes` mentions one of `attributes`. */
async function namesAttribute(
  cwd: string,
  attributes: readonly string[],
): Promise<boolean> {
  const where = await runGit(["rev-parse", "--git-path", "info/attributes"], {
    cwd,
  });
  if (!where.ok) return false;
  let text: string;
  try {
    text = await readFile(resolve(cwd, where.stdout.trim()), "utf8");
  } catch {
    return false;
  }
  return attributes.some((name) => text.includes(name));
}

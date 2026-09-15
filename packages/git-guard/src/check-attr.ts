import { runGit, type GitOptions } from "./run.js";
import { attributeNameIsSafe, localRevShapeIsSafe } from "./shape.js";

export type AttributeValues = Readonly<Record<string, string>>;

export type CheckAttr = {
  /** Set or valued attributes per path; `unspecified` is left out. */
  attrs: Map<string, AttributeValues>;
  /** Read at `source`. False means the working tree answered, or nothing did. */
  pinned: boolean;
};

const DEFAULT_ATTR_MAX_BYTES = 16 * 1_048_576;
const DEFAULT_ATTR_TIMEOUT_MS = 10_000;

/**
 * `.gitattributes` as they stood at `source`, for every path, in one batched
 * call. git before 2.40 has no `--source`; the working tree answers then and
 * `pinned` says so. A `source` git cannot resolve, or an unsafe one, reads
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
    return { attrs, pinned: false };
  }
  if (!listed.length || !attributes.length) {
    return { attrs, pinned: source !== null };
  }

  const run = (extra: string[]) =>
    runGit(["check-attr", ...extra, "--stdin", "-z", ...attributes], {
      cwd,
      input: `${listed.join("\0")}\0`,
      timeoutMs: limits.timeoutMs ?? DEFAULT_ATTR_TIMEOUT_MS,
      maxBytes: limits.maxBytes ?? DEFAULT_ATTR_MAX_BYTES,
    });

  let pinned = source !== null;
  let result = await run(source !== null ? [`--source=${source}`] : []);
  // Only git rejecting the option itself falls back: an unresolvable rev must
  // not let the working tree answer for the base.
  if (source !== null && !result.ok && /unknown option/i.test(result.stderr)) {
    pinned = false;
    result = await run([]);
  }
  if (!result.ok) return { attrs, pinned: false };

  // -z output: path NUL attribute NUL value NUL, repeated.
  const fields = result.stdout.split("\0");
  for (let at = 0; at + 2 < fields.length; at += 3) {
    const path = fields[at] ?? "";
    const name = fields[at + 1] ?? "";
    const value = fields[at + 2] ?? "";
    if (!path || value === "unspecified") continue;
    attrs.set(path, { ...attrs.get(path), [name]: value });
  }
  return { attrs, pinned };
}

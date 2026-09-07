// @ts-check
/** GitHub deep links into a pull request's Files tab. */
import { createHash } from "node:crypto";

/**
 * GitHub keys each file's diff by the sha256 of its repo-relative path.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function fileAnchor(filePath) {
  return createHash("sha256").update(filePath).digest("hex");
}

/** `/<owner>/<repo>/pull/<n>` — the only path a deep link is built on. */
const PR_PATH = /^\/[^/]+\/[^/]+\/pull\/[1-9][0-9]*$/;

/**
 * `--pr` as a canonical pull-request URL, or `null` when it is not one.
 * Checked here, at parse: the model carries this string into every href, so
 * `--json` must never be able to hand a caller a `javascript:` one.
 *
 * @param {string} pr
 * @returns {string|null}
 */
export function normalizePrUrl(pr) {
  /** @type {URL} */
  let url;
  try {
    url = new URL(pr);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.host !== "github.com") return null;
  const path = url.pathname.replace(/\/+$/, "");
  return PR_PATH.test(path) ? `https://github.com${path}` : null;
}

/**
 * @typedef {object} DeepLink
 * @property {string|null} href `null` when no `--pr` was given.
 * @property {boolean} precise Whether the link lands on a line or a file.
 * @property {string} [note] Why the link is file-only, when it is.
 */

/**
 * A link into the PR's Files tab. `side` follows the hunk the record was
 * placed on: `new` numbering is `R`, the pre-change side `L`.
 *
 * @param {object} target
 * @param {string|null} target.pr
 * @param {string} target.filePath
 * @param {number} [target.line]
 * @param {"old"|"new"} [target.side]
 * @returns {DeepLink}
 */
export function deepLink({ pr, filePath, line, side }) {
  if (!pr || !filePath) {
    return {
      href: null,
      precise: false,
      note: pr
        ? "this record names no file, so there is nothing to link to"
        : "no --pr given, so there is nothing to link to",
    };
  }
  const anchor = `diff-${fileAnchor(filePath)}`;
  const base = `${pr.replace(/\/+$/, "")}/files#${anchor}`;
  if (line === undefined) {
    return {
      href: base,
      precise: false,
      note: "no resolved line for this anchor, so the link opens the file",
    };
  }
  return { href: `${base}${side === "old" ? "L" : "R"}${line}`, precise: true };
}

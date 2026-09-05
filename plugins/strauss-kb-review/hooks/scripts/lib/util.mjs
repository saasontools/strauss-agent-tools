// @ts-check
/** Shared helpers: frontmatter, text measures, path classes, finding shape. */

/**
 * @typedef {"block"|"warn"} Severity
 * @typedef {"mechanical"|"semantic"} Kind
 * @typedef {{ id: string, family: string, severity: Severity, kind: Kind,
 *   recordId?: string, file?: string, symbol?: string, message: string }} Finding
 * @typedef {{ file: string, symbol?: string, hash?: string,
 *   resolved_at?: string, [k: string]: unknown }} Anchor
 * @typedef {{ target: string, rel: string }} Link
 * @typedef {{ conceptId: string, path: string, type: string, title: string,
 *   status: string, standing: string, body: string, touched: boolean,
 *   anchors: Anchor[], links: Link[], tags: string[], sources: unknown[],
 *   materiality?: string, confidence?: string, owner?: string,
 *   assumption?: boolean, verify: string[], verified: unknown[],
 *   writtenBy?: string, writtenAt?: string }} KbRecord
 */

const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "rb",
  "php",
  "cs",
  "swift",
  "scala",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "m",
  "sh",
  "vue",
  "svelte",
]);

/** @param {string} path */
export function extensionOf(path) {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/** @param {string} path */
export function isCodePath(path) {
  return CODE_EXT.has(extensionOf(path));
}

/** @param {string} path */
export function basenameOf(path) {
  return path.split("/").pop() ?? path;
}

/** @param {string} text */
export function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Identifier-ish tokens, lowercased, for overlap and similarity measures.
 * @param {string} text */
export function tokens(text) {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) ?? []).filter(
      (word) => !STOP.has(word),
    ),
  );
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "into",
  "not",
  "but",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "its",
  "it's",
  "than",
  "then",
  "when",
  "which",
  "what",
  "who",
  "why",
  "how",
  "one",
  "two",
  "per",
  "you",
  "all",
  "any",
  "can",
  "will",
  "would",
  "there",
  "their",
  "them",
  "they",
]);

/** Share of `a` also present in `b`.
 * @param {Set<string>} a @param {Set<string>} b */
export function overlap(a, b) {
  if (a.size === 0) return 0;
  let hits = 0;
  for (const token of a) if (b.has(token)) hits += 1;
  return hits / a.size;
}

/** Jaccard similarity of two token sets.
 * @param {Set<string>} a @param {Set<string>} b */
export function similarity(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** One `## Heading` section's body, or "" when the heading is absent.
 * @param {string} body @param {string} heading */
export function section(body, heading) {
  const pattern = new RegExp(
    `^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "im",
  );
  const start = body.search(pattern);
  if (start < 0) return "";
  const rest = body.slice(start).replace(pattern, "");
  const next = rest.search(/^##\s+/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/**
 * @param {string} id @param {string} family @param {Severity} severity
 * @param {Kind} kind @param {string} message
 * @param {{ recordId?: string, file?: string, symbol?: string }} [where]
 * @returns {Finding}
 */
export function finding(id, family, severity, kind, message, where = {}) {
  return { id, family, severity, kind, message, ...where };
}

/**
 * The frontmatter subset strauss-kb writes: scalars, quoted scalars, folded
 * and literal blocks, lists of scalars, lists of maps, one nested map.
 * @param {string} text
 * @returns {{ data: Record<string, unknown>, body: string }}
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  return {
    data: /** @type {Record<string, unknown>} */ (
      parseBlock((match[1] ?? "").split(/\r?\n/), 0).value
    ),
    body: text.slice(match[0].length),
  };
}

/**
 * @param {string[]} lines @param {number} at
 * @returns {{ value: unknown, at: number }}
 */
function parseBlock(lines, at) {
  const first = lines[at];
  if (first === undefined) return { value: {}, at };
  const indent = indentOf(first);
  return first.trimStart().startsWith("- ")
    ? parseList(lines, at, indent)
    : parseMap(lines, at, indent);
}

/** @param {string} line */
function indentOf(line) {
  return line.length - line.trimStart().length;
}

/** @param {string[]} lines @param {number} at @param {number} indent */
function parseMap(lines, at, indent) {
  /** @type {Record<string, unknown>} */
  const value = {};
  let index = at;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim() || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }
    if (indentOf(line) < indent) break;
    if (indentOf(line) > indent) {
      index += 1;
      continue;
    }
    const key = /^([A-Za-z0-9_.-]+):\s?(.*)$/.exec(line.trim());
    if (!key) break;
    const [, name, raw] = key;
    if (raw === "|" || raw === ">" || raw === "|-" || raw === ">-") {
      const block = takeBlock(lines, index + 1, indent);
      value[name ?? ""] = raw.startsWith(">")
        ? block.text.split(/\n/).join(" ").trim()
        : block.text;
      index = block.at;
    } else if (raw === "") {
      const nested = parseBlock(lines, index + 1);
      value[name ?? ""] = nested.at === index + 1 ? "" : nested.value;
      index = nested.at;
    } else {
      const plain = !/^["'[{]/.test((raw ?? "").trim());
      const folded = plain
        ? continuation(lines, index + 1, indent)
        : { text: "", at: index + 1 };
      value[name ?? ""] = folded.text
        ? `${scalar(raw ?? "")} ${folded.text}`.trim()
        : scalar(raw ?? "");
      index = folded.at;
    }
  }
  return { value, at: index };
}

/**
 * A plain scalar's folded continuation: the more-indented lines under it, which
 * YAML joins with spaces. Anything that starts a key or a list item ends it.
 * @param {string[]} lines @param {number} at @param {number} indent
 */
function continuation(lines, at, indent) {
  /** @type {string[]} */
  const parts = [];
  let index = at;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const text = line.trim();
    if (!text || indentOf(line) <= indent) break;
    if (text.startsWith("- ") || /^[A-Za-z0-9_.-]+:(\s|$)/.test(text)) break;
    parts.push(text);
    index += 1;
  }
  return { text: parts.join(" "), at: index };
}

/** @param {string[]} lines @param {number} at @param {number} indent */
function parseList(lines, at, indent) {
  /** @type {unknown[]} */
  const value = [];
  let index = at;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (indentOf(line) !== indent || !line.trimStart().startsWith("- ")) break;
    const rest = line.trimStart().slice(2);
    if (/^[A-Za-z0-9_.-]+:(\s|$)/.test(rest)) {
      const width = indent + 2;
      const rewritten = [" ".repeat(width) + rest, ...lines.slice(index + 1)];
      const item = parseMap(rewritten, 0, width);
      value.push(item.value);
      index += item.at;
    } else if (rest === ">-" || rest === ">" || rest === "|" || rest === "|-") {
      const block = takeBlock(lines, index + 1, indent);
      value.push(
        rest.startsWith(">")
          ? block.text.split(/\n/).join(" ").trim()
          : block.text,
      );
      index = block.at;
    } else {
      value.push(scalar(rest));
      index += 1;
    }
  }
  return { value, at: index };
}

/** @param {string[]} lines @param {number} at @param {number} indent */
function takeBlock(lines, at, indent) {
  /** @type {string[]} */
  const text = [];
  let index = at;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() && indentOf(line) <= indent) break;
    text.push(line.trim());
    index += 1;
  }
  return { text: text.join("\n").trim(), at: index };
}

/** A `#` only starts a comment outside a quoted scalar. @param {string} raw */
function scalar(raw) {
  const text = raw.trim();
  const single = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(text);
  if (single) return (single[1] ?? "").replace(/''/g, "'");
  const double = /^"([^"]*)"\s*(?:#.*)?$/.exec(text);
  if (double) return double[1] ?? "";
  const value = text.replace(/\s+#.*$/, "");
  // The flow collections strauss-kb writes are empty ones.
  if (value === "[]") return [];
  if (value === "{}") return {};
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~" || value === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

/** @param {unknown} value @returns {unknown[]} */
export function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

/**
 * The environment a child gets. The `GIT_*` overrides are stripped: a caller's
 * environment must not redirect a read that `cwd` already addressed, and an
 * external diff driver must not run.
 */
export function childEnv() {
  const env = { ...process.env };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_EXTERNAL_DIFF",
  ]) {
    delete env[name];
  }
  return env;
}

/** One line of untrusted text: control characters out, length bounded.
 * @param {unknown} value @param {number} max */
export function oneLine(value, max = 160) {
  const flat = String(value)
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** @param {unknown} value @returns {string} */
export function asString(value) {
  return typeof value === "string" ? value : "";
}

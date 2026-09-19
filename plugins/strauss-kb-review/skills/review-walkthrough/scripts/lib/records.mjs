// @ts-check
/**
 * What a record says, read off what `kb load` returns. The read verbs emit no
 * `strauss_verify`, `strauss_sources` or `strauss_owner` yet, so each reader
 * here prefers the field and falls back to the body the store rendered it
 * into.
 */

/** Rel phrases the store writes outbound links as. Keep in step with LINK_RELS. */
const REL_PHRASES = {
  "Depends on": "depends_on",
  Constrains: "constrains",
  Informs: "informs",
  Blocks: "blocks",
  Invalidates: "invalidates",
  "Verified by": "verified_by",
  Satisfies: "satisfies",
  "Relates to": "related_to",
};

/** Body headings that carry a runnable check, most specific first. */
const VERIFY_HEADINGS = ["how to verify", "verify", "verification"];

/** The footnote `promote` writes on every record it carries. */
const PROMOTED_SOURCE_ID = "promoted";

/** One rendered outbound link, alone on its line. */
const LINK_LINE = /^([A-Z][a-z]+(?: [a-z]+)*) \[([^\]]+)\]\([^)]+\)\.$/;

/**
 * @param {string} conceptId
 * @returns {{ type: string, slug: string }}
 */
export function splitConceptId(conceptId) {
  const cut = conceptId.indexOf(".");
  return cut === -1
    ? { type: conceptId, slug: "" }
    : { type: conceptId.slice(0, cut), slug: conceptId.slice(cut + 1) };
}

/**
 * `## Heading` to its text, headings lowercased so callers match on meaning.
 *
 * @param {string} body
 * @returns {Map<string, string>}
 */
export function sections(body) {
  /** @type {Map<string, string>} */
  const found = new Map();
  /** @type {string|null} */
  let heading = null;
  /** @type {string[]} */
  let buffer = [];
  // The store appends a record's typed links to its last section; they are
  // structure, not prose, so they never belong in a section's text.
  const flush = () => {
    if (heading === null) return;
    const text = buffer
      .filter((line) => !LINK_LINE.test(line))
      .join("\n")
      .trim();
    found.set(heading, text);
  };
  for (const line of (body ?? "").split(/\r?\n/)) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = (match[1] ?? "").toLowerCase();
      buffer = [];
    } else if (heading !== null) {
      buffer.push(line);
    }
  }
  flush();
  return found;
}

/**
 * @param {string} body
 * @param {string[]} names Lowercased headings, most specific first.
 * @returns {string|null}
 */
export function section(body, names) {
  const found = sections(body);
  for (const name of names) {
    const text = found.get(name);
    if (text) return text;
  }
  return null;
}

/**
 * The typed links leaving a record, as the store renders them in the body.
 *
 * @param {string} body
 * @returns {{ rel: string, target: string }[]}
 */
export function outboundLinks(body) {
  /** @type {{ rel: string, target: string }[]} */
  const links = [];
  const pattern = new RegExp(LINK_LINE.source, "gm");
  for (const match of (body ?? "").matchAll(pattern)) {
    const rel = REL_PHRASES[/** @type {keyof typeof REL_PHRASES} */ (match[1])];
    const target = match[2];
    if (rel && target) links.push({ rel, target });
  }
  return links;
}

/**
 * Whether the record cites a source of its own. Sources reach the body as
 * footnote definitions, so the id has to be one the record declares:
 * `promote` appends a footnote to everything it carries, and that footnote
 * says where the record came from, not what it was asked to satisfy.
 *
 * @param {{ body?: string, sources?: { id?: string }[] }} record
 * @returns {boolean}
 */
export function citesSource(record) {
  const declared = (Array.isArray(record?.sources) ? record.sources : [])
    .map((source) => source?.id)
    .filter((id) => typeof id === "string" && id !== PROMOTED_SOURCE_ID);
  if (!declared.length) return false;
  const defined = new Set(
    ((record?.body ?? "").match(/^\[\^[^\]]+\]:/gm) ?? []).map((line) =>
      line.slice(2, -2),
    ),
  );
  return declared.some((id) => defined.has(/** @type {string} */ (id)));
}

/**
 * The command a `verify`-carrying record asks the reviewer to run. Read off
 * `strauss_verify` where the CLI returns it, else the body section.
 *
 * @param {{ body?: string, verify?: unknown, strauss_verify?: unknown }} record
 * @returns {string|null}
 */
export function verifyCommand(record) {
  const declared = record?.verify ?? record?.strauss_verify;
  if (typeof declared === "string" && declared.trim()) return declared.trim();
  const text = section(record?.body ?? "", VERIFY_HEADINGS);
  if (!text) return null;
  const fenced = /```[a-z]*\n([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) {
    const first = fenced[1].split(/\r?\n/).find((line) => line.trim());
    if (first) return first.trim();
  }
  const inline = /`([^`\n]+)`/.exec(text);
  if (inline?.[1]) return inline[1].trim();
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !entry.endsWith("."));
  return line ?? null;
}

/**
 * First sentence of a body section, for a step's one-line reason.
 *
 * @param {string|null} text
 * @returns {string|null}
 */
export function firstSentence(text) {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const stop = /(?<=[.?!])\s/.exec(flat);
  return stop ? flat.slice(0, stop.index + 1) : flat;
}

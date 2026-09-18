import { fromMarkdown } from "mdast-util-from-markdown";
import { KB_CONCEPT_ID_PATTERN, type KbRecord } from "./kb-record.schema.js";

/**
 * Markdown citations in a record's prose.
 *
 * Not an edge: `strauss_links` is. `validate` reads it only to warn that a
 * record's prose and its links have come apart.
 */

// A link whose href is a record filename, `<concept-id>.md`.
const RECORD_FILE = new RegExp(
  `^(${KB_CONCEPT_ID_PATTERN.source.replace(/^\^|\$$/g, "")})\\.md$`,
);

type MdNode = { type: string; url?: string; children?: MdNode[] };

/**
 * Every concept id this record's prose cites, itself excluded.
 *
 * Parsed to an mdast tree rather than matched by pattern: a link in a fence, an
 * indented block or a code span is an example, and only a parser knows which.
 */
export function bodyCitations(record: KbRecord): Set<string> {
  // A link to a record file spells `.md`; a body without it has none to parse.
  if (!record.body.includes(".md")) return new Set();
  // The parser's cost is quadratic in list nesting on one line (blockquotes
  // are linear), so a line no real record writes is refused before parsing.
  for (const line of record.body.split("\n")) {
    if (nestingAt(line) > MAX_NESTING) {
      throw new KbBodyUnreadableError(
        record.conceptId,
        new Error(`a line opens more than ${MAX_NESTING} nested lists`),
      );
    }
  }
  let tree: MdNode;
  try {
    tree = fromMarkdown(record.body) as MdNode;
  } catch (error) {
    throw new KbBodyUnreadableError(record.conceptId, error);
  }
  const targets = new Set<string>();
  // An explicit stack, not recursion: nesting depth is the author's to choose,
  // and a call per level lets one record overflow every consumer's stack.
  const pending: MdNode[] = [tree];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (node.type === "link" && node.url) {
      const target = RECORD_FILE.exec(node.url)?.[1];
      if (target && target !== record.conceptId) targets.add(target);
    }
    const children = node.children ?? [];
    for (let at = children.length - 1; at >= 0; at -= 1) {
      const child = children[at];
      if (child) pending.push(child);
    }
  }
  return targets;
}

/** Targets the prose cites that the record's `strauss_links` does not name. */
export function unmirroredCitations(record: KbRecord): string[] {
  const declared = new Set(
    (record.frontmatter.strauss_links ?? []).map((link) => link.target),
  );
  return [...bodyCitations(record)].filter((target) => !declared.has(target));
}

/** Deepest list nesting a single line may open. */
const MAX_NESTING = 64;

/** How many list markers open this line, past any `>`, in one pass. */
function nestingAt(line: string): number {
  let depth = 0;
  let at = 0;
  for (;;) {
    while (line[at] === " " || line[at] === "\t") at += 1;
    if (line[at] === ">") {
      at += 1;
      continue;
    }
    let width = 0;
    if (line[at] === "*" || line[at] === "+" || line[at] === "-") {
      width = 1;
    } else {
      let digits = 0;
      while (digits < 10 && isDigit(line.charCodeAt(at + digits))) digits += 1;
      const close = line[at + digits];
      if (digits > 0 && digits < 10 && (close === "." || close === ")")) {
        width = digits + 1;
      }
    }
    const after = line[at + width];
    if (!width || (after !== undefined && after !== " " && after !== "\t")) {
      return depth;
    }
    depth += 1;
    at += width;
  }
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

/** A body the parser refused, named by record so one cannot hide in a base. */
export class KbBodyUnreadableError extends Error {
  constructor(
    readonly conceptId: string,
    cause: unknown,
  ) {
    super(
      `${conceptId}: body could not be parsed as markdown (${
        cause instanceof Error ? cause.message : String(cause)
      })`,
      { cause },
    );
    this.name = "KbBodyUnreadableError";
  }
}

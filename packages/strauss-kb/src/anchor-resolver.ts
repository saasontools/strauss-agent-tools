import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { KbAnchor, KbRecord } from "./kb-record.schema.js";

/**
 * Resolves symbolic anchors to text and detects drift against stored hashes.
 *
 * Resolvers are pure — source string in, range out — so tests need no
 * filesystem and a tree-sitter or codegraph resolver later slots behind the
 * same interface. Only the file readers touch disk.
 *
 * The bias throughout is that a wrong answer is worse than no answer. A span
 * that stops short of the code it claims to cover hashes as stable while the
 * code moves underneath it, and a stable hash is read as evidence — so every
 * shape this resolver cannot lex confidently returns `null` and is reported
 * `unresolved` rather than being guessed at.
 */

export type ResolvedSymbol = {
  text: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
};

export interface AnchorResolver {
  name: string;
  resolve(source: string, symbol: string): ResolvedSymbol | null;
}

/** Why an anchor could not be compared. Never an error — always a finding. */
export type AnchorUnresolvedReason =
  | "file-missing"
  | "symbol-not-found"
  | "outside-repo"
  | "file-too-large"
  | "file-unreadable";

/** Big enough for any hand-written source file, small enough to read eagerly. */
export const MAX_ANCHOR_FILE_BYTES = 1_048_576;

/**
 * How far above a candidate the parent of a dotted symbol may sit and still
 * be taken as scoping it. Crude on purpose: a real parser owns this question,
 * and until one takes the seat a fixed window is at least predictable.
 */
const PARENT_SCOPE_LINES = 50;

/* -------------------------------------------------------------------------
 * A crude lexer, sufficient for counting braces
 * ---------------------------------------------------------------------- */

type ScanState = { blockComment: boolean; template: boolean };

const CLEAN_STATE: ScanState = { blockComment: false, template: false };

/**
 * Strips comments and string literals from one line, carrying block-comment
 * and template-literal state across lines.
 *
 * Brace counting over raw text is wrong in both directions: a `}` inside a
 * string or a comment ends a block early — the truncation that hashes as
 * stable — and a `{` inside one opens a block that never closes. This is not
 * a tokenizer: a regex literal containing a brace (`/}/`) still fools it, and
 * `#` is left alone because TypeScript spells private fields with it. Both
 * limits are documented in the README.
 */
function stripLine(
  line: string,
  state: ScanState,
): { code: string; state: ScanState } {
  let out = "";
  let index = 0;
  let { blockComment, template } = state;

  while (index < line.length) {
    const char = line[index];
    const next = line[index + 1];

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    // Braces inside `${...}` are balanced by construction, so ignoring the
    // whole template rather than re-entering code inside it is safe here.
    if (template) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === "`") template = false;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 2;
      continue;
    }
    if (char === "/" && next === "/") break;
    if (char === "`") {
      template = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      index += 1;
      while (index < line.length) {
        if (line[index] === "\\") {
          index += 2;
          continue;
        }
        if (line[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    out += char;
    index += 1;
  }

  return { code: out, state: { blockComment, template } };
}

/* -------------------------------------------------------------------------
 * Span capture
 * ---------------------------------------------------------------------- */

function span(
  lines: string[],
  from: number,
  to: number,
): ResolvedSymbol {
  return {
    text: lines.slice(from, to + 1).join("\n"),
    startLine: from + 1,
    endLine: to + 1,
  };
}

/**
 * From the matched line to the line where brace depth returns to zero.
 *
 * Depth is tested at end of line, never mid-line, which is what makes a
 * destructured signature work: `function f({ a, b }) {` opens, closes and
 * opens again within one line, so the header ends at depth one and the scan
 * keeps going. Testing mid-line would have ended the span on the signature —
 * a hash over the header alone, stable across every edit to the body.
 *
 * A top-level `;` reached before any brace opens is a braceless declaration
 * (`const N = 5;`) and the matched line alone is the span.
 *
 * Everything else is `null`: a brace that never opens and never terminates,
 * or one still open at end of file. Both mean the lexer lost the thread, and
 * a guessed span would hash as stable over code it does not cover.
 */
function captureBraceBlock(
  lines: string[],
  matchLine: number,
): ResolvedSymbol | null {
  let depth = 0;
  let opened = false;
  let state = CLEAN_STATE;

  for (let index = matchLine; index < lines.length; index++) {
    const stripped = stripLine(lines[index] ?? "", state);
    state = stripped.state;

    for (const char of stripped.code) {
      if (char === "{") {
        depth += 1;
        opened = true;
      } else if (char === "}") {
        depth = Math.max(0, depth - 1);
      } else if (char === ";" && !opened) {
        return span(lines, matchLine, index);
      }
    }

    if (opened && depth === 0) return span(lines, matchLine, index);
  }

  return null;
}

/** `def f(...)` / `class C:` — a header ending in a colon, body by indent. */
const PYTHON_HEADER = /^\s*(?:async\s+)?(?:def|class)\s+[A-Za-z_]\w*\s*[(:]/;

/**
 * A Python block: the header, however many lines its signature runs to, plus
 * every following line that is blank or indented past the header.
 *
 * Brace counting would capture a `def` line and nothing else — a signature
 * hash that never sees a body change, which is worse than no anchor at all.
 * A header whose body never arrives is `null` for the same reason.
 */
function captureIndentedBlock(
  lines: string[],
  matchLine: number,
): ResolvedSymbol | null {
  const header = lines[matchLine] ?? "";
  const indent = header.length - header.trimStart().length;

  let headerEnd = -1;
  for (
    let index = matchLine;
    index < lines.length && index <= matchLine + 20;
    index++
  ) {
    const code = stripLine(lines[index] ?? "", CLEAN_STATE).code.trimEnd();
    if (code.endsWith(":")) {
      headerEnd = index;
      break;
    }
    // `def f(): pass` — the body is on the header line, so the line is the span.
    if (code.includes(":")) return span(lines, matchLine, index);
  }
  if (headerEnd === -1) return null;

  let end = headerEnd;
  for (let index = headerEnd + 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line.trim() === "") continue;
    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent <= indent) break;
    end = index;
  }

  // A signature with no body under it is the false-stability case again.
  return end === headerEnd ? null : span(lines, matchLine, end);
}

/* -------------------------------------------------------------------------
 * The v1 resolver
 * ---------------------------------------------------------------------- */

/**
 * Candidate lines, best shape first. A declaration outranks an assignment,
 * which outranks a call-shaped line, which outranks a bare mention — so an
 * anchor lands on where a symbol is defined rather than the first place it is
 * used, which `findIndex` over one loose pattern used to do.
 */
const TIERS: ((name: string) => RegExp)[] = [
  (name) =>
    new RegExp(
      `(?:function|class|interface|type|enum|const|let|var|def)\\s+${name}\\b`,
    ),
  (name) => new RegExp(`\\b${name}\\s*[:=]`),
  (name) => new RegExp(`\\b${name}\\s*\\(`),
  (name) => new RegExp(`\\b${name}\\b`),
];

/**
 * v1 heuristic resolver. A dotted symbol like `OrderService.cancel` matches on
 * its last segment, with the parent used to scope the search: a candidate
 * counts only if the parent name appears in the fifty lines above it, when any
 * candidate satisfies that at all.
 *
 * Deterministic, and ambiguity is not resolved by guessing — two lines of
 * equally good shape mean the resolver cannot tell which one the record meant,
 * and it says so by returning `null`.
 */
export const regexResolver: AnchorResolver = {
  name: "regex",
  resolve(source, symbol) {
    const segments = symbol.split(".");
    const name = segments[segments.length - 1];
    if (!name) return null;
    const parent =
      segments.length > 1 ? segments[segments.length - 2] : undefined;

    const escaped = escapeRegExp(name);
    const parentPattern = parent
      ? new RegExp(`\\b${escapeRegExp(parent)}\\b`)
      : null;
    const lines = source.split("\n");

    for (const tier of TIERS) {
      const pattern = tier(escaped);
      let candidates = lines
        .map((line, index) => ({ line, index }))
        .filter((entry) => pattern.test(entry.line))
        .map((entry) => entry.index);
      if (!candidates.length) continue;

      // Nearest enclosing parent wins, not merely a parent somewhere above:
      // two classes in one file each declaring `cancel` both see the first
      // class's name in the window, and only distance tells them apart.
      if (parentPattern && candidates.length > 1) {
        const distances = candidates.map((index) =>
          distanceToParent(lines, index, parentPattern),
        );
        const nearest = Math.min(...distances);
        if (Number.isFinite(nearest)) {
          candidates = candidates.filter(
            (_, at) => distances[at] === nearest,
          );
        }
      }

      // Two lines of the same shape: which one the record meant is a guess,
      // and a guessed anchor hashes as evidence.
      if (candidates.length !== 1) return null;

      const matchLine = candidates[0] as number;
      return PYTHON_HEADER.test(lines[matchLine] ?? "")
        ? captureIndentedBlock(lines, matchLine)
        : captureBraceBlock(lines, matchLine);
    }

    return null;
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lines from the nearest parent mention at or above `index`, or Infinity. */
function distanceToParent(
  lines: string[],
  index: number,
  parent: RegExp,
): number {
  const floor = Math.max(0, index - PARENT_SCOPE_LINES);
  for (let at = index; at >= floor; at--) {
    if (parent.test(lines[at] ?? "")) return index - at;
  }
  return Number.POSITIVE_INFINITY;
}

/** CRLF normalized to LF before hashing, so checkout style cannot read as drift. */
export function hashAnchorText(text: string): string {
  return `sha256:${createHash("sha256")
    .update(text.replace(/\r\n/g, "\n"))
    .digest("hex")}`;
}

/**
 * An anchor without a symbol is about the whole file; with one, the resolver
 * decides. Source newlines are normalized first so line counts and hashes
 * agree with `hashAnchorText`.
 *
 * A file's last line is the last line with content: a trailing newline is a
 * terminator, not an empty line, and counting it would have made every
 * whole-file anchor's `lines` one larger than the file.
 */
export function resolveAnchor(
  source: string,
  anchor: KbAnchor,
  resolver: AnchorResolver = regexResolver,
): ResolvedSymbol | null {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!anchor.symbol) {
    const lines = normalized.split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return {
      text: normalized,
      startLine: 1,
      endLine: Math.max(1, lines.length),
    };
  }
  return resolver.resolve(normalized, anchor.symbol);
}

export type KbAnchorDriftEntry = {
  file: string;
  symbol?: string;
  state: "match" | "drifted" | "unresolved";
  storedHash: string;
  currentHash?: string;
  /** `null` when the anchor recorded no `lines` — size unknown, not zero. */
  diffSize: number | null;
  reason?: AnchorUnresolvedReason;
};

/**
 * An anchor's `file` must stay inside the repository root — a record points
 * at code, not at arbitrary files on the machine reading it. Bundles are
 * data, so a traversal or absolute path here is untrusted input, not a bug
 * in the caller. Returns the resolved path, or `null` when it escapes.
 *
 * Lexical only, and therefore not the whole containment check: see
 * `readAnchorFile`, which re-tests the real path after following symlinks.
 */
export function anchorFilePath(repoRoot: string, file: string): string | null {
  // Anchors are repo-relative, hand-written often enough that `./` shows up.
  const path = resolve(repoRoot, file.replace(/^\.\//, ""));
  const rel = relative(resolve(repoRoot), path);
  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    isAbsolute(rel)
  ) {
    return null;
  }
  return path;
}

function contains(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
}

export type AnchorRead =
  | { ok: true; source: string }
  | { ok: false; reason: AnchorUnresolvedReason };

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Reads the file an anchor points at, or says why it could not.
 *
 * Containment is checked twice: lexically, then again against the real path.
 * A symlink inside the repository pointing out of it passes the first check
 * and defeats the whole rule — an untrusted bundle could otherwise use
 * `kb_load` to probe for files anywhere the process can read. The repo root is
 * realpath'd too, because on macOS the conventional temp roots are themselves
 * symlinks and a raw comparison would refuse every legitimate anchor there.
 *
 * Only ENOENT is `file-missing`. A permission error or a directory where a
 * file should be is not evidence that code moved, and reporting one as drift
 * would put a finding on a record nothing is wrong with.
 */
export async function readAnchorFile(
  repoRoot: string,
  file: string,
): Promise<AnchorRead> {
  const lexical = anchorFilePath(repoRoot, file);
  if (lexical === null) return { ok: false, reason: "outside-repo" };

  let root: string;
  let path: string;
  try {
    root = await realpath(resolve(repoRoot));
    path = await realpath(lexical);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { ok: false, reason: "file-missing" };
    }
    return { ok: false, reason: "file-unreadable" };
  }
  if (!contains(root, path)) return { ok: false, reason: "outside-repo" };

  try {
    const stats = await stat(path);
    if (!stats.isFile()) return { ok: false, reason: "file-unreadable" };
    // Anchors point at source. Reading a bundled artefact or a checked-in
    // binary into memory on a read path is a cost with no finding behind it.
    if (stats.size > MAX_ANCHOR_FILE_BYTES) {
      return { ok: false, reason: "file-too-large" };
    }
    return { ok: true, source: await readFile(path, "utf8") };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { ok: false, reason: "file-missing" };
    }
    return { ok: false, reason: "file-unreadable" };
  }
}

/**
 * Every checked anchor failed to find its file at all.
 *
 * The signature of a repo root that was never given rather than of code that
 * moved: a bundle read from somewhere other than the tree it describes misses
 * every file, and reporting that as base-wide drift would train a reader to
 * ignore the warning. One file found anywhere makes the root plausible, and
 * the misses become real findings again.
 */
export function looksLikeWrongRepoRoot(
  drift: Map<string, KbAnchorDriftEntry[]>,
): boolean {
  let checked = 0;
  for (const entries of drift.values()) {
    for (const entry of entries) {
      checked += 1;
      if (entry.state !== "unresolved" || entry.reason !== "file-missing") {
        return false;
      }
    }
  }
  return checked > 0;
}

/**
 * Re-resolves every hash-carrying anchor and compares against the stored hash.
 *
 * Anchors without a `hash` are skipped outright — until someone stamps hashes,
 * this costs nothing on the load/query path. A missing file or an unresolvable
 * symbol is a finding (`unresolved`), never a throw: drift detection runs over
 * bases whose code has moved, and the moved code is exactly what it exists to
 * report. Each distinct file is read once per run. All checked entries are
 * returned per record; callers filter.
 */
export async function detectAnchorDrift(
  records: KbRecord[],
  options: { repoRoot?: string; resolver?: AnchorResolver } = {},
): Promise<Map<string, KbAnchorDriftEntry[]>> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const resolver = options.resolver ?? regexResolver;
  const drift = new Map<string, KbAnchorDriftEntry[]>();
  const reads = new Map<string, AnchorRead>();

  for (const record of records) {
    const entries: KbAnchorDriftEntry[] = [];

    for (const anchor of record.frontmatter.strauss_anchors ?? []) {
      if (!anchor.hash) continue;

      const base: Pick<KbAnchorDriftEntry, "file" | "symbol" | "storedHash"> = {
        file: anchor.file,
        ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
        storedHash: anchor.hash,
      };

      if (!reads.has(anchor.file)) {
        reads.set(anchor.file, await readAnchorFile(repoRoot, anchor.file));
      }
      const read = reads.get(anchor.file) as AnchorRead;
      if (!read.ok) {
        entries.push({
          ...base,
          state: "unresolved",
          diffSize: null,
          reason: read.reason,
        });
        continue;
      }

      const resolved = resolveAnchor(read.source, anchor, resolver);
      if (!resolved) {
        entries.push({
          ...base,
          state: "unresolved",
          diffSize: null,
          reason: "symbol-not-found",
        });
        continue;
      }

      const currentHash = hashAnchorText(resolved.text);
      const currentLines = resolved.endLine - resolved.startLine + 1;
      entries.push({
        ...base,
        state: currentHash === anchor.hash ? "match" : "drifted",
        currentHash,
        diffSize:
          anchor.lines === undefined
            ? null
            : Math.abs(currentLines - anchor.lines),
      });
    }

    if (entries.length) drift.set(record.conceptId, entries);
  }

  return drift;
}

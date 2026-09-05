import { createHash } from "node:crypto";
import type { KbAnchor } from "../kb-record.schema.js";
import type { GrammarOptions } from "../grammars/index.js";
import { TreeSitterResolver } from "../tree-sitter-resolver/index.js";
import type {
  AnchorResolution,
  AnchorResolverName,
  AnchorResolver,
  ResolvedSymbol,
  ResolverAttempt,
} from "./model.js";

/**
 * Symbol → text, and text → hash.
 *
 * Resolvers are pure: source string in, range out. Any shape the lexer cannot
 * handle confidently returns `null` and is reported `unresolved`, never guessed.
 */

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

function span(lines: string[], from: number, to: number): ResolvedSymbol {
  return {
    text: lines.slice(from, to + 1).join("\n"),
    startLine: from + 1,
    endLine: to + 1,
  };
}

/**
 * From the matched line to the line where brace depth returns to zero.
 *
 * Depth is tested at end of line, never mid-line, so a destructured signature
 * (`function f({ a, b }) {`) does not end the span. A top-level `;` before any
 * brace opens is a braceless declaration and the matched line alone is the
 * span. Everything else is `null`.
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
          candidates = candidates.filter((_, at) => distances[at] === nearest);
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
  const outcome = resolveAnchorSpan(source, anchor, [resolver]);
  return outcome.ok ? outcome.span : null;
}

/**
 * Walks the resolver chain: tree-sitter, then regex, then a whole-file span
 * when the anchor names no symbol.
 *
 * A resolver that understands the language answers for it, except when it has
 * no definition of the symbol at all: a tags query defines functions and types
 * but not constants, aliases or fields, so `symbol-not-found` falls through and
 * the anchor records the resolver that did answer. `symbol-ambiguous` and
 * `resolver-unavailable` end the chain — one would be settled by guessing, the
 * other would trade a precise span for a guessed one.
 */
export function resolveAnchorSpan(
  source: string,
  anchor: KbAnchor,
  resolvers: readonly AnchorResolver[] = [regexResolver],
): AnchorResolution {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!anchor.symbol) {
    const lines = normalized.split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return {
      ok: true,
      span: {
        text: normalized,
        startLine: 1,
        endLine: Math.max(1, lines.length),
      },
    };
  }

  for (const resolver of resolvers) {
    const attempt = resolver.attempt
      ? resolver.attempt(normalized, anchor.symbol, anchor.file)
      : fromResolve(resolver, normalized, anchor.symbol, anchor.file);
    if (attempt.kind === "abstain") continue;
    if (attempt.kind === "unresolved") {
      if (attempt.reason === "symbol-not-found") continue;
      return { ok: false, reason: attempt.reason };
    }
    return {
      ok: true,
      span: attempt.span,
      ...(isResolverName(resolver.name) ? { resolver: resolver.name } : {}),
    };
  }
  return { ok: false, reason: "symbol-not-found" };
}

/** A resolver with no `attempt`: a span or a plain miss, never an abstain. */
function fromResolve(
  resolver: AnchorResolver,
  source: string,
  symbol: string,
  file: string,
): ResolverAttempt {
  const span = resolver.resolve(source, symbol, file);
  return span
    ? { kind: "resolved", span }
    : { kind: "unresolved", reason: "symbol-not-found" };
}

function isResolverName(name: string): name is AnchorResolverName {
  return name === "tree-sitter" || name === "regex";
}

/** Loads every chained resolver's per-language assets, once. */
export async function prepareResolvers(
  resolvers: readonly AnchorResolver[],
  files: readonly string[],
): Promise<void> {
  for (const resolver of resolvers) await resolver.prepare?.(files);
}

/**
 * The read-path chain. A fresh tree-sitter resolver per call, so its parse
 * cache lives exactly as long as the run that owns it. `offline` rides down to
 * grammar loading: a run that may not reach the network uses the cache or
 * reports `resolver-unavailable`.
 */
export function defaultAnchorResolvers(
  grammars: GrammarOptions = {},
): AnchorResolver[] {
  return [new TreeSitterResolver(grammars), regexResolver];
}

/**
 * Was the swap the whole story?
 *
 * Only when the resolver that stamped the anchor still reproduces the stored
 * hash against this very source. Otherwise the code moved too, and calling it
 * a resolver change would hide the edit behind a bookkeeping note.
 */
export function resolverChanged(
  source: string,
  anchor: KbAnchor,
  produced: AnchorResolverName | undefined,
): boolean {
  const previous = anchor.resolver ?? "regex";
  if (!produced || !anchor.symbol || previous === produced) return false;
  if (previous !== "regex") return false;
  const before = regexResolver.resolve(
    source.replace(/\r\n/g, "\n"),
    anchor.symbol,
  );
  return before !== null && hashAnchorText(before.text) === anchor.hash;
}

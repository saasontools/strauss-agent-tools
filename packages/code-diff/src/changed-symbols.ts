import type { DiffFile, DiffHunk } from "./model.js";

/** A named declaration's lines in the post-change file, from a parse of it. */
export type Declaration = { name: string; startLine: number; endLine: number };

export type ChangedSymbol = {
  file: string;
  hunk: DiffHunk;
  /** The declaration the hunk sits in; null for a file-scope hunk. */
  symbol: string | null;
  /** `parse` when declarations named it, `funcname` when git's hunk context did. */
  via: "parse" | "funcname";
};

/**
 * The declaration each post-change hunk sits in: the smallest whose lines hold
 * the hunk's, blank edge lines trimmed. `declarations` undefined means the file
 * has no grammar, and git's function context names the hunk instead.
 */
export function changedSymbols(
  file: DiffFile,
  declarations?: readonly Declaration[],
): ChangedSymbol[] {
  return file.hunks
    .filter((hunk) => (hunk.side ?? "new") === "new")
    .map((hunk) =>
      declarations
        ? {
            file: file.filePath,
            hunk,
            symbol: innermost(declarations, trimmed(hunk)),
            via: "parse" as const,
          }
        : {
            file: file.filePath,
            hunk,
            symbol: contextSymbol(hunk.context ?? ""),
            via: "funcname" as const,
          },
    );
}

type Span = { startLine: number; endLine: number };

function innermost(declarations: readonly Declaration[], span: Span) {
  let best: Declaration | undefined;
  for (const declaration of declarations) {
    if (declaration.startLine > span.startLine) continue;
    if (declaration.endLine < span.endLine) continue;
    if (
      !best ||
      declaration.endLine - declaration.startLine <
        best.endLine - best.startLine
    ) {
      best = declaration;
    }
  }
  return best?.name ?? null;
}

/**
 * Blank lines at a hunk's edges belong to no declaration. A pure deletion —
 * kept lines, none of them — sits between its line and the next, so both
 * must be inside the declaration that takes it.
 */
function trimmed(hunk: DiffHunk): Span {
  const { startLine, endLine, lines } = hunk;
  if (lines?.length === 0) return { startLine, endLine: startLine + 1 };
  if (!lines || lines.length !== endLine - startLine + 1) {
    return { startLine, endLine };
  }
  let first = 0;
  let last = lines.length - 1;
  while (first < last && !lines[first]?.trim()) first += 1;
  while (last > first && !lines[last]?.trim()) last -= 1;
  return { startLine: startLine + first, endLine: startLine + last };
}

/**
 * The declared name in git's function context — a class, function, interface,
 * type or method. Language-blind, and for a file-scope hunk it names the
 * nearest preceding declaration, which the hunk did not touch.
 */
export function contextSymbol(line: string): string | null {
  const context = line.slice(0, MAX_CONTEXT);
  const match =
    /\b(?:class|interface|enum|struct|trait|impl)\s+([A-Za-z_$][\w$]*)/.exec(
      context,
    ) ??
    /\b(?:function|def|fn)\s+([A-Za-z_$][\w$]*)/.exec(context) ??
    // Go: `func (s *Server) Cancel(` names Cancel, not the receiver.
    /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)/.exec(context) ??
    /^\s*(?:(?:public|private|protected|static|readonly|async|export|abstract)\s+)*([A-Za-z_$][\w$]*)\s*\(/.exec(
      context,
    );
  const name = match?.[1];
  return name && !RESERVED.has(name) ? name : null;
}

/** git keeps a function context near 80 characters; past this, it is not one. */
const MAX_CONTEXT = 256;

const RESERVED = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "new",
  "typeof",
  "await",
  "constructor",
]);

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { KbAnchor, KbRecord } from "./kb-record.schema.js";

/**
 * Resolves symbolic anchors to text and detects drift against stored hashes.
 *
 * Resolvers are pure — source string in, range out — so tests need no
 * filesystem and a tree-sitter or codegraph resolver later slots behind the
 * same interface. Only `detectAnchorDrift` touches disk, and it is the one
 * caller that has to.
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

/**
 * v1 heuristic resolver. A dotted symbol like `OrderService.cancel` matches on
 * its last segment; the first line carrying a declaration-ish pattern wins,
 * with looser fallbacks behind it. The block is captured by brace counting —
 * blind to strings and comments, which is good enough until a real parser
 * takes this seat. Deterministic: first match wins.
 */
export const regexResolver: AnchorResolver = {
  name: "regex",
  resolve(source, symbol) {
    const segments = symbol.split(".");
    const name = segments[segments.length - 1];
    if (!name) return null;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `(?:function|class|interface|type|enum|const|let|var|def)\\s+${escaped}\\b`,
      ),
      new RegExp(`${escaped}\\s*[:=(]`),
      new RegExp(`\\b${escaped}\\b`),
    ];

    const lines = source.split("\n");
    let matchLine = -1;
    for (const pattern of patterns) {
      matchLine = lines.findIndex((line) => pattern.test(line));
      if (matchLine !== -1) break;
    }
    if (matchLine === -1) return null;

    return captureBlock(lines, matchLine);
  },
};

/**
 * From the matched line, the block runs to the line balancing the first `{` —
 * unless a top-level `;` arrives first (a braceless declaration like
 * `const N = 5;`), in which case the matched line alone is the text. A brace
 * left unbalanced at end of file takes everything to the end: a truncated
 * block would hash as stable while the code below it moved.
 */
function captureBlock(lines: string[], matchLine: number): ResolvedSymbol {
  const single = {
    text: lines[matchLine] ?? "",
    startLine: matchLine + 1,
    endLine: matchLine + 1,
  };

  let depth = 0;
  let opened = false;
  for (let index = matchLine; index < lines.length; index++) {
    for (const char of lines[index] ?? "") {
      if (char === "{") {
        depth++;
        opened = true;
      } else if (char === "}") {
        depth--;
      } else if (char === ";" && !opened) {
        return single;
      }
      if (opened && depth === 0) {
        return {
          text: lines.slice(matchLine, index + 1).join("\n"),
          startLine: matchLine + 1,
          endLine: index + 1,
        };
      }
    }
  }
  if (!opened) return single;
  return {
    text: lines.slice(matchLine).join("\n"),
    startLine: matchLine + 1,
    endLine: lines.length,
  };
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
 */
export function resolveAnchor(
  source: string,
  anchor: KbAnchor,
  resolver: AnchorResolver = regexResolver,
): ResolvedSymbol | null {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!anchor.symbol) {
    return {
      text: normalized,
      startLine: 1,
      endLine: normalized.split("\n").length,
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
  reason?: "file-missing" | "symbol-not-found" | "outside-repo";
};

/**
 * An anchor's `file` must stay inside the repository root — a record points
 * at code, not at arbitrary files on the machine reading it. Bundles are
 * data, so a traversal or absolute path here is untrusted input, not a bug
 * in the caller. Returns the resolved path, or `null` when it escapes.
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

/**
 * Re-resolves every hash-carrying anchor and compares against the stored hash.
 *
 * Anchors without a `hash` are skipped outright — until someone stamps hashes,
 * this costs nothing on the load/query path. An unreadable file or an
 * unresolvable symbol is a finding (`unresolved`), never a throw: drift
 * detection runs over bases whose code has moved, and the moved code is
 * exactly what it exists to report. All checked entries are returned per
 * record; callers filter.
 */
export async function detectAnchorDrift(
  records: KbRecord[],
  options: { repoRoot?: string; resolver?: AnchorResolver } = {},
): Promise<Map<string, KbAnchorDriftEntry[]>> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const resolver = options.resolver ?? regexResolver;
  const drift = new Map<string, KbAnchorDriftEntry[]>();
  const sources = new Map<string, string | null>();

  for (const record of records) {
    const entries: KbAnchorDriftEntry[] = [];

    for (const anchor of record.frontmatter.strauss_anchors ?? []) {
      if (!anchor.hash) continue;

      const base: Pick<KbAnchorDriftEntry, "file" | "symbol" | "storedHash"> = {
        file: anchor.file,
        ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
        storedHash: anchor.hash,
      };

      const path = anchorFilePath(repoRoot, anchor.file);
      if (path === null) {
        entries.push({
          ...base,
          state: "unresolved",
          diffSize: null,
          reason: "outside-repo",
        });
        continue;
      }
      if (!sources.has(path)) {
        sources.set(path, await readFile(path, "utf8").catch(() => null));
      }
      const source = sources.get(path) ?? null;
      if (source === null) {
        entries.push({
          ...base,
          state: "unresolved",
          diffSize: null,
          reason: "file-missing",
        });
        continue;
      }

      const resolved = resolveAnchor(source, anchor, resolver);
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

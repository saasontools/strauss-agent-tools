import type { DiffFile, DiffHunk } from "../../match-diff.js";

/**
 * `git diff --unified=0` → the structure `matchToDiff` takes.
 *
 * CLI-side, not library: a caller holding a patch already has a parser for it,
 * and the library stays free of a flavour of unified diff.
 */

const FILE_HEADER = /^diff --git (.+)$/;
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const SIMILARITY = /^similarity index (\d+)%$/;
/** What `readRangeDiff` pins. A patch from elsewhere may spell it otherwise. */
const KNOWN_PREFIX = /^[ab]\//;

export type ParseDiffOptions = {
  /**
   * Keep a file the patch names but gives no hunk — a rename `-M` matched
   * whole, a binary change, a mode-only change. Off by default: a hunkless
   * file has no line for a record to sit on.
   */
  keepEmpty?: boolean;
  /** Carry each hunk's changed lines, for a caller that reads content. */
  withLines?: boolean;
};

/**
 * Files with at least one hunk, unless `keepEmpty` asks for the rest. A binary
 * file, a mode-only change and a rename that changed nothing carry no hunks,
 * so by default they appear nowhere: there is no line for a record to sit on.
 *
 * `rename from`/`similarity index` are always read onto the file; they are two
 * header lines, and a caller that ignores them pays nothing.
 */
export function parseUnifiedDiff(
  patch: string,
  options: ParseDiffOptions = {},
): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let listed = false;
  let shared: string | undefined;
  let oldPath: string | undefined;
  let rename: Pick<DiffFile, "renamedFrom" | "similarity"> = {};
  // Only between `diff --git` and the first hunk is a `---`/`+++` line a
  // header; past it, an added or removed line of source can spell one.
  let inHeader = false;
  // The two hunks one header can emit, so a `+`/`-` line lands on its own side.
  let added: DiffHunk | undefined;
  let removed: DiffHunk | undefined;

  const list = (): void => {
    if (!current || listed) return;
    files.push(current);
    listed = true;
  };
  const open = (filePath: string): void => {
    current = { filePath, hunks: [], ...rename };
    listed = false;
  };
  /** Rename headers follow the `diff --git` line the file was opened on. */
  const amend = (): void => {
    if (current) Object.assign(current, rename);
  };
  const close = (): void => {
    if (options.keepEmpty) list();
    current = undefined;
    listed = false;
    added = undefined;
    removed = undefined;
  };

  for (const raw of patch.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

    const start = FILE_HEADER.exec(line);
    if (start) {
      close();
      oldPath = undefined;
      rename = {};
      shared = sharedHeaderPath(start[1] as string);
      inHeader = true;
      // Opened here rather than on `+++`: a binary or mode-only change has no
      // `+++` line at all, and `keepEmpty` is what asks for those files.
      if (shared) open(shared);
      continue;
    }
    if (inHeader) {
      const similarity = SIMILARITY.exec(line);
      if (similarity) {
        rename.similarity = Number(similarity[1]);
        amend();
        continue;
      }
      if (line.startsWith("rename from ")) {
        rename.renamedFrom = unquote(line.slice(12).trim());
        amend();
        continue;
      }
      // The only header naming the new path when the rename changed no line.
      if (line.startsWith("rename to ")) {
        open(unquote(line.slice(10).trim()));
        continue;
      }
      if (line.startsWith("--- ")) {
        oldPath = sidePath(line.slice(4), shared);
        continue;
      }
      if (line.startsWith("+++ ")) {
        // A deletion names `/dev/null` on the new side; the record still points
        // at the path that was removed.
        const path = sidePath(line.slice(4), shared) ?? oldPath;
        if (path) open(path);
        else current = undefined;
        continue;
      }
    }

    const hunk = HUNK.exec(line);
    if (!hunk) {
      if (!options.withLines || inHeader) continue;
      if (line.startsWith("+")) added?.lines?.push(line.slice(1));
      else if (line.startsWith("-")) removed?.lines?.push(line.slice(1));
      continue;
    }
    inHeader = false;
    added = undefined;
    removed = undefined;
    if (!current) continue;
    const [next, before] = hunksOf(hunk, options.withLines === true);
    added = next;
    removed = before;
    list();
    current.hunks.push(...(before ? [next, before] : [next]));
  }

  close();
  return files;
}

/**
 * Both halves of one hunk header. An omitted count is one line.
 *
 * The post-change side is always emitted: a count of zero there is a removal,
 * which git addresses by the line it happened after, so the hunk is that
 * single line, clamped to 1 for a removal at the top of a file or a file
 * deleted outright. The pre-change side is emitted only where the hunk
 * actually removed lines, carrying `side: "old"` so a record anchored to the
 * base rev lands on the code that went away rather than on whatever replaced
 * it.
 */
function hunksOf(
  hunk: RegExpExecArray,
  withLines: boolean,
): [DiffHunk, DiffHunk?] {
  const oldStart = Number(hunk[1]);
  const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2]);
  const newStart = Number(hunk[3]);
  const newCount = hunk[4] === undefined ? 1 : Number(hunk[4]);

  const lines = withLines ? { lines: [] as string[] } : {};
  const added: DiffHunk =
    newCount === 0
      ? { ...point(newStart), ...lines }
      : { startLine: newStart, endLine: newStart + newCount - 1, ...lines };
  if (oldCount === 0) return [added];
  return [
    added,
    {
      startLine: oldStart,
      endLine: oldStart + oldCount - 1,
      side: "old",
      ...(withLines ? { lines: [] } : {}),
    },
  ];
}

function point(start: number): DiffHunk {
  const at = Math.max(1, start);
  return { startLine: at, endLine: at };
}

/**
 * `a/src/x.ts` → `src/x.ts`; `/dev/null` → nothing to attribute a hunk to. A
 * prefix this does not know is left to the `diff --git` line, which carries
 * the same two and so says what they wrap.
 */
function sidePath(raw: string, shared: string | undefined): string | undefined {
  const text = unquote(raw.replace(/\t.*$/, "").trim());
  if (text === "/dev/null") return undefined;
  if (KNOWN_PREFIX.test(text)) return text.slice(2);
  return shared ?? text;
}

/**
 * The repo-relative path both operands of a `diff --git` line wrap, whatever
 * prefixes they carry. Nothing when the two are equal — `--no-prefix` — or for
 * a rename, whose paths differ; there the `---`/`+++` lines are all there is.
 */
function sharedHeaderPath(rest: string): string | undefined {
  const pair = splitHeaderPair(rest);
  if (!pair || pair[0] === pair[1]) return undefined;
  const from = unquote(pair[0]).split("/");
  const to = unquote(pair[1]).split("/");
  const shared: string[] = [];
  while (from.length > 1 && to.length > 1 && from.at(-1) === to.at(-1)) {
    shared.unshift(from.pop() as string);
    to.pop();
  }
  return shared.length ? shared.join("/") : undefined;
}

/** `<old> <new>`. Equal-length operands are the rule, so the middle splits. */
function splitHeaderPair(rest: string): [string, string] | undefined {
  if (rest.startsWith('"')) {
    const end = endOfQuoted(rest);
    if (end < 0 || rest[end + 1] !== " ") return undefined;
    return [rest.slice(0, end + 1), rest.slice(end + 2)];
  }
  const mid = (rest.length - 1) / 2;
  if (Number.isInteger(mid) && rest[mid] === " ") {
    return [rest.slice(0, mid), rest.slice(mid + 1)];
  }
  const at = rest.indexOf(" ");
  return at === -1 ? undefined : [rest.slice(0, at), rest.slice(at + 1)];
}

/** The closing quote of a C-style token, past any the body escaped. */
function endOfQuoted(text: string): number {
  for (let at = 1; at < text.length; at += 1) {
    if (text[at] === "\\") {
      at += 1;
      continue;
    }
    if (text[at] === '"') return at;
  }
  return -1;
}

const ESCAPES: Record<string, number> = {
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
  '"': 0x22,
  "\\": 0x5c,
};

const OCTAL = /^[0-7]{3}/;
const utf8 = new TextEncoder();

/**
 * git quotes a path holding a space, a quote, or a byte outside ASCII, and
 * escapes it C-style. A non-ASCII character is three octal escapes — one per
 * UTF-8 byte — so the bytes are decoded together rather than one at a time.
 */
function unquote(text: string): string {
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) {
    return text;
  }
  const body = text.slice(1, -1);
  const bytes: number[] = [];

  for (let at = 0; at < body.length;) {
    const slash = body.indexOf("\\", at);
    if (slash < 0) {
      bytes.push(...utf8.encode(body.slice(at)));
      break;
    }
    if (slash > at) bytes.push(...utf8.encode(body.slice(at, slash)));

    const octal = OCTAL.exec(body.slice(slash + 1, slash + 4));
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8));
      at = slash + 4;
      continue;
    }
    const next = body[slash + 1];
    if (next === undefined) {
      bytes.push(ESCAPES["\\"] as number);
      break;
    }
    const mapped = ESCAPES[next];
    if (mapped === undefined) bytes.push(...utf8.encode(next));
    else bytes.push(mapped);
    at = slash + 2;
  }

  return new TextDecoder().decode(Uint8Array.from(bytes));
}

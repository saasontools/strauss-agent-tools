import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { filePathIsSafe } from "@saasontools/git-guard";
import type { DiffFile } from "../model.js";
import { toplevel } from "../repo/head.js";
import { readAttributes, type Attributes } from "./attributes.js";
import { classifyDiff } from "./classify.js";
import type { ClassifyResult, Declared } from "./model.js";
import { HEADER_LINES } from "./rules.js";

export type ClassifyFilesOptions = {
  /** The commit whose `.gitattributes` decide; null reads the working tree. */
  base: string | null;
  declared?: Declared;
};

/**
 * Classify a diff against the repository holding `repoRoot`: attributes at
 * `base`, each file's banner from the working tree, which a range read at head
 * holds. Paths are read from the top level, as the diff spells them.
 */
export async function classifyFiles(
  repoRoot: string,
  files: readonly DiffFile[],
  { base, declared }: ClassifyFilesOptions,
): Promise<ClassifyResult> {
  const top = (await toplevel(repoRoot)) ?? repoRoot;
  const [withHeaders, attributes] = await Promise.all([
    mapLimit(files, READERS, async (file) => ({
      ...file,
      header: await header(top, file.filePath),
    })),
    readAttributes(
      top,
      base,
      files.map((file) => file.filePath),
    ),
  ]);
  const notes = files.length ? notesFor(attributes, base) : [];
  return {
    files: classifyDiff(withHeaders, {
      ...(declared ? { declared } : {}),
      attributes: attributes.classes,
      repoDeclares: attributes.repoDeclares,
    }),
    ...(notes.length ? { notes } : {}),
  };
}

/** Where the answer is weaker than asked, in the words a caller reads. */
function notesFor(attributes: Attributes, base: string | null): string[] {
  const fallback =
    "only strauss-class=source applies, and the default path table is off";
  if (base === null) return [`no base was given: ${fallback}`];
  if (!attributes.pinned) {
    return [`.gitattributes could not be read at ${base}: ${fallback}`];
  }
  if (attributes.probeFailed) {
    return [
      `could not read .gitattributes at ${base} to find declared classes: the default path table is off`,
    ];
  }
  return [];
}

/** More than the banner window can need, and less than a lockfile costs. */
const HEADER_BYTES = 65_536;

/** How many files are open at once, whatever the diff's size. */
const READERS = 16;

/** POSIX open flags; Windows has neither, and no FIFO to block on. */
const NO_FOLLOW = (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
const NON_BLOCK = (constants as { O_NONBLOCK?: number }).O_NONBLOCK ?? 0;

/**
 * The file's first lines from the working tree, or nothing — a deletion, or a
 * tree parked elsewhere — and the diff's own added lines answer instead.
 */
async function header(
  root: string,
  filePath: string,
): Promise<string[] | undefined> {
  if (!filePathIsSafe(filePath)) return undefined;
  let handle: FileHandle | undefined;
  try {
    // A committed symlink is not followed and a FIFO does not block the open:
    // only a regular file is read.
    handle = await open(
      join(root, filePath),
      constants.O_RDONLY | NO_FOLLOW | NON_BLOCK,
    );
    if (!(await handle.stat()).isFile()) return undefined;
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return buffer
      .toString("utf8", 0, bytesRead)
      .split("\n")
      .slice(0, HEADER_LINES);
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

/** Runs at most `limit` at a time, keeping each result in its input's place. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const at = next;
      next += 1;
      out[at] = await run(items[at] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

import { Buffer } from "node:buffer";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { filePathIsSafe } from "@saasontools/git-guard";
import type { DiffFile } from "../model.js";
import { toplevel } from "../repo/head.js";
import { readAttributes } from "./attributes.js";
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
  const notes =
    attributes.pinned || !files.length
      ? []
      : [
          base === null
            ? ".gitattributes read from the working tree: no base was given"
            : `.gitattributes read from the working tree: git could not read them at ${base} (check-attr --source needs git 2.40)`,
        ];
  return {
    files: classifyDiff(withHeaders, {
      ...(declared ? { declared } : {}),
      attributes: attributes.classes,
      repoDeclares: attributes.repoDeclares,
    }),
    ...(notes.length ? { notes } : {}),
  };
}

/** More than the banner window can need, and less than a lockfile costs. */
const HEADER_BYTES = 65_536;

/** How many files are open at once, whatever the diff's size. */
const READERS = 16;

/**
 * The file's first lines from the working tree, or nothing — a deletion, or a
 * tree parked elsewhere — and the diff's own added lines answer instead.
 */
async function header(
  root: string,
  filePath: string,
): Promise<string[] | undefined> {
  // Lexical only: a committed symlink can still point outside the root, and
  // what leaks is one bit — whether the target's head carries a banner.
  if (!filePathIsSafe(filePath)) return undefined;
  let handle: FileHandle | undefined;
  try {
    handle = await open(join(root, filePath), "r");
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

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { INDEX_FILE } from "./kb-index.js";
import { LOG_FILE } from "./kb-log.js";

export const SEARCH_INDEX_FILE = ".index.sqlite";

const COLLECTION = "kb";

/**
 * BM25 over one knowledge base, via qmd's SDK.
 *
 * Reached only when a base is too large to hand over whole — see `load()`,
 * which is the first thing a reader should try.
 *
 * Lexical only. `searchLex` is BM25 and needs no model. Measured against the
 * substring scan it replaces it wins on word forms and little else: `pages`
 * finds a record saying only `page`, and eight of nine probe queries returned
 * exactly what substring returned.
 *
 * The vector tier does close the semantic gap — "why not just use a mutex"
 * finds the record about compare-and-swap, which no lexical match can. It stays
 * off because its scores do not separate right from wrong: a wrong hit scored
 * 0.318 against a correct one at 0.295, and a query about a subject absent from
 * the base still returns its nearest record rather than nothing.
 *
 * The index is derived and disposable — one file per base, gitignored, deleted
 * and rebuilt at will. That is only true because a base is self-contained: an
 * index covering exactly one directory can always be rebuilt from it.
 *
 * qmd is used as a **library**, and is an optional peer dependency: with it
 * absent every path here still answers, `searchBase` returns null, and the
 * store falls back to a substring scan. Its own MCP server would let an agent
 * reach a base without passing the store, and its default markdown glob would
 * return `INDEX.md` as a search hit — the case `list()` already excludes,
 * reintroduced by a reader this package does not control. Hence the explicit
 * `ignore` below.
 */
/**
 * A hit as qmd reports it — by its own normalised path, not by our identity.
 *
 * qmd rewrites `decision.cursor-keyset.md` to `decision-cursor-keyset.md`,
 * which destroys the separator between a record's type and its slug and cannot
 * be undone from the string alone: `decision-cursor-keyset` could be the type
 * `decision` or a type `decision-cursor`. The caller maps these back through
 * the records it already holds rather than parsing them.
 */
export type SearchHit = { displayPath: string; score: number };

type QmdStore = {
  searchLex(
    query: string,
    options?: { limit?: number; collection?: string },
  ): Promise<{ displayPath?: string; filepath?: string; score?: number }[]>;
  addCollection(
    name: string,
    opts: { path: string; pattern?: string; ignore?: string[] },
  ): Promise<void>;
  listCollections(): Promise<unknown[]>;
  update(options?: { collections?: string[] }): Promise<unknown>;
  close(): Promise<void>;
};

export type KbSearchLogger = {
  warn?(entry: Record<string, unknown>): void;
};

/** What this module needs of qmd, which is all it is allowed to assume. */
export type QmdModule = { createStore(options: unknown): Promise<unknown> };

export type SearchOptions = {
  limit?: number;
  logger?: KbSearchLogger;
  /**
   * The backend, supplied rather than imported. Production passes nothing and
   * gets the dynamic import below; a caller that already holds qmd — or a test
   * covering the present-backend branch on a machine where the optional peer is
   * not installed — passes it here.
   */
  qmd?: QmdModule;
};

/**
 * Opens (or creates) the base's index and answers a query against it.
 *
 * Re-indexes when the index is older than the newest record rather than on a
 * schedule or a write hook: the same repair-on-read rule `INDEX.md` follows,
 * and for the same reason — a derived artifact that can rebuild itself does not
 * need anyone to remember to rebuild it.
 */
export async function searchBase(
  bundlePath: string,
  query: string,
  options: SearchOptions = {},
): Promise<SearchHit[] | null> {
  const qmd = options.qmd ?? (await loadQmd(options.logger));
  if (!qmd) return null;

  let store: QmdStore | null = null;
  try {
    store = (await qmd.createStore({
      dbPath: join(bundlePath, SEARCH_INDEX_FILE),
      config: {
        collections: {
          [COLLECTION]: {
            path: bundlePath,
            pattern: "**/*.md",
            // Both store-owned files are markdown and neither is a record.
            ignore: [INDEX_FILE, LOG_FILE],
          },
        },
      },
    })) as QmdStore;

    if (await isStale(bundlePath)) {
      await store.update({ collections: [COLLECTION] });
    }

    const hits = await store.searchLex(query, {
      collection: COLLECTION,
      ...(options.limit ? { limit: options.limit } : {}),
    });
    return hits
      .map((hit) => ({
        displayPath: hit.displayPath ?? hit.filepath ?? "",
        score: hit.score ?? 0,
      }))
      .filter((hit) => hit.displayPath.length > 0);
  } catch (error) {
    // A search index is an optimisation. Losing it must degrade recall, never
    // the answer — `query()` falls back to substring rather than failing.
    options.logger?.warn?.({
      operation: "kb.search",
      outcome: "unavailable",
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  } finally {
    await store?.close().catch(() => undefined);
  }
}

/** Whether any record is newer than the index. */
async function isStale(bundlePath: string): Promise<boolean> {
  const indexAt = await stat(join(bundlePath, SEARCH_INDEX_FILE))
    .then((s) => s.mtimeMs)
    .catch(() => 0);
  if (!indexAt) return true;

  const { readdir } = await import("node:fs/promises");
  const names = await readdir(bundlePath).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.endsWith(".md") || name === INDEX_FILE) continue;
    const at = await stat(join(bundlePath, name))
      .then((s) => s.mtimeMs)
      .catch(() => 0);
    if (at > indexAt) return true;
  }
  return false;
}

/**
 * Maps qmd's normalised paths back onto real records.
 *
 * Comparing on the same normalisation rather than trying to invert it: a dot in
 * a concept id and a dash in a slug are indistinguishable once qmd has rewritten
 * the name, so the only reliable direction is forwards, from ids we hold.
 */
export function resolveHits<T extends { conceptId: string }>(
  hits: SearchHit[],
  records: T[],
): T[] {
  const byName = new Map<string, T>();
  for (const record of records) {
    const name = flatten(record.conceptId);
    // A collision would make the mapping a guess; drop both rather than pick.
    if (byName.has(name)) byName.delete(name);
    else byName.set(name, record);
  }

  const resolved: T[] = [];
  for (const hit of hits) {
    const file = hit.displayPath.split("/").pop() ?? "";
    const name = file.endsWith(".md") ? file.slice(0, -".md".length) : file;
    const record = byName.get(flatten(name));
    if (record) resolved.push(record);
  }
  return resolved;
}

function flatten(value: string): string {
  return value.replace(/[.]/g, "-").toLowerCase();
}

/**
 * Held in a variable rather than written inline. qmd is not a dependency of
 * this package, so a literal specifier sends the compiler looking for types
 * that are not installed; the indirection keeps the import dynamic at runtime
 * and invisible at build time, which is what an optional engine needs.
 */
const QMD_MODULE = "@tobilu/qmd";

/**
 * Loaded on demand so a caller that never searches pays nothing for a
 * dependency that pulls in native SQLite bindings and a llama runtime — and
 * returns null rather than throwing when it is not installed at all, which is
 * the normal case for an optional peer.
 */
export async function loadQmd(
  logger?: KbSearchLogger,
): Promise<QmdModule | null> {
  try {
    return (await import(QMD_MODULE)) as unknown as QmdModule;
  } catch {
    logger?.warn?.({ operation: "kb.search", outcome: "qmd-unavailable" });
    return null;
  }
}

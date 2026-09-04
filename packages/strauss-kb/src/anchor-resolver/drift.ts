import { DEFAULT_IO_CONCURRENCY } from "../concurrency.js";
import type { KbAnchor, KbRecord } from "../kb-record.schema.js";
import {
  readRemoteAnchors,
  wantKey,
  type RemoteOptions,
  type RemoteRead,
  type RemoteWant,
} from "../remote-repo/index.js";
import type {
  AnchorFileReader,
  AnchorRead,
  AnchorResolver,
  KbAnchorDriftEntry,
} from "./model.js";
import { anchorFileReader, readAnchorFiles } from "./read.js";
import { LazyOrigin, normalizeRepoUrl } from "./repo-identity.js";
import { hashAnchorText, regexResolver, resolveAnchor } from "./resolver.js";

export type AnchorDriftOptions = {
  repoRoot?: string;
  resolver?: AnchorResolver;
  concurrency?: number;
  /** Test seam: replaces the disk reader. */
  reader?: AnchorFileReader;
  /** Remote resolution of foreign anchors; `offline` keeps a run off the wire. */
  remote?: RemoteOptions;
  /** Test seam: replaces the remote blob reader. */
  readRemote?: typeof readRemoteAnchors;
};

type Planned = { anchor: KbAnchor; foreign: boolean };

/**
 * Re-resolves every hash-carrying anchor and compares against the stored hash.
 *
 * An anchor naming another repository is read from that repository's remote
 * through a bare cache; everything else is read from the working tree. A
 * missing file, an unreachable remote, or an unresolvable symbol is a finding
 * (`unresolved`), never a throw.
 *
 * Four phases: collect the checkable anchors, read the working tree's distinct
 * files and the remotes' distinct (repo, rev, file) blobs, then resolve and
 * hash in record order — so the output never depends on which read finished
 * first.
 */
export async function detectAnchorDrift(
  records: KbRecord[],
  options: AnchorDriftOptions = {},
): Promise<Map<string, KbAnchorDriftEntry[]>> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const resolver = options.resolver ?? regexResolver;
  const origin = new LazyOrigin(repoRoot);

  const planned = new Map<string, Planned[]>();
  let declaresRepo = false;
  for (const record of records) {
    const anchors = (record.frontmatter.strauss_anchors ?? []).filter(
      (anchor) => anchor.hash,
    );
    if (!anchors.length) continue;
    if (anchors.some((anchor) => anchor.repo)) declaresRepo = true;
    planned.set(
      record.conceptId,
      anchors.map((anchor) => ({ anchor, foreign: false })),
    );
  }
  if (declaresRepo) {
    await origin.prime();
    for (const entries of planned.values()) {
      for (const entry of entries)
        entry.foreign = origin.isForeign(entry.anchor);
    }
  }

  const files: string[] = [];
  const wants: RemoteWant[] = [];
  for (const entries of planned.values()) {
    for (const { anchor, foreign } of entries) {
      if (!foreign) files.push(anchor.file);
      else wants.push(...remoteWants(anchor));
    }
  }

  // Disk and network are independent; neither waits for the other.
  const [reads, remote] = await Promise.all([
    readAnchorFiles(
      files,
      options.reader ?? anchorFileReader(repoRoot),
      options.concurrency ?? DEFAULT_IO_CONCURRENCY,
    ),
    (options.readRemote ?? readRemoteAnchors)(wants, options.remote ?? {}),
  ]);

  const drift = new Map<string, KbAnchorDriftEntry[]>();
  for (const record of records) {
    const entries: KbAnchorDriftEntry[] = [];
    for (const { anchor, foreign } of planned.get(record.conceptId) ?? []) {
      entries.push(
        foreign
          ? remoteEntry(anchor, remote, resolver)
          : localEntry(anchor, reads.get(anchor.file) as AnchorRead, resolver),
      );
    }
    if (entries.length) drift.set(record.conceptId, entries);
  }
  return drift;
}

/**
 * What must be read for one foreign anchor: the pinned commit, plus the
 * default branch it is "current" against when the anchor pins one at all.
 */
export function remoteWants(anchor: KbAnchor): RemoteWant[] {
  const repo = anchor.repo as string;
  const wants: RemoteWant[] = [{ repo, file: anchor.file }];
  if (anchor.ref) wants.unshift({ repo, ref: anchor.ref, file: anchor.file });
  return wants;
}

function base(
  anchor: KbAnchor,
): Pick<KbAnchorDriftEntry, "file" | "symbol" | "storedHash"> {
  return {
    file: anchor.file,
    ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
    storedHash: anchor.hash as string,
  };
}

function unresolved(
  anchor: KbAnchor,
  reason: KbAnchorDriftEntry["reason"],
  repo?: string,
): KbAnchorDriftEntry {
  return {
    ...base(anchor),
    state: "unresolved",
    diffSize: null,
    ...(reason ? { reason } : {}),
    ...(repo ? { repo } : {}),
  };
}

/** The hash of an anchor's text in one source, or `null` when it cannot resolve. */
function hashIn(
  source: string,
  anchor: KbAnchor,
  resolver: AnchorResolver,
): { hash: string; lines: number } | null {
  const resolved = resolveAnchor(source, anchor, resolver);
  if (!resolved) return null;
  return {
    hash: hashAnchorText(resolved.text),
    lines: resolved.endLine - resolved.startLine + 1,
  };
}

function compared(
  anchor: KbAnchor,
  current: { hash: string; lines: number },
  extra: Partial<KbAnchorDriftEntry> = {},
): KbAnchorDriftEntry {
  return {
    ...base(anchor),
    state: current.hash === anchor.hash ? "match" : "drifted",
    currentHash: current.hash,
    diffSize:
      anchor.lines === undefined
        ? null
        : Math.abs(current.lines - anchor.lines),
    ...extra,
  };
}

function localEntry(
  anchor: KbAnchor,
  read: AnchorRead,
  resolver: AnchorResolver,
): KbAnchorDriftEntry {
  if (!read.ok) return unresolved(anchor, read.reason);
  const current = hashIn(read.source, anchor, resolver);
  return current
    ? compared(anchor, current)
    : unresolved(anchor, "symbol-not-found");
}

/**
 * A foreign anchor's three states.
 *
 * The pinned commit decides whether the evidence still holds; the default
 * branch only adds `drifted-on-default` on top of a ref that still matches. A
 * default branch that could not be read therefore never downgrades a `ref` hit
 * — offline, a pinned anchor still verifies.
 */
function remoteEntry(
  anchor: KbAnchor,
  remote: Map<string, RemoteRead>,
  resolver: AnchorResolver,
): KbAnchorDriftEntry {
  const repo = anchor.repo as string;
  const key = normalizeRepoUrl(repo);
  const atDefault = remote.get(wantKey(key, undefined, anchor.file));
  const primary = anchor.ref
    ? remote.get(wantKey(key, anchor.ref, anchor.file))
    : atDefault;

  if (!primary) return unresolved(anchor, "remote-unreachable", repo);
  if (!primary.ok) return unresolved(anchor, primary.reason, repo);

  const current = hashIn(primary.source, anchor, resolver);
  if (!current) return unresolved(anchor, "symbol-not-found", repo);
  if (!anchor.ref) return compared(anchor, current, { repo });
  if (current.hash !== anchor.hash) {
    return compared(anchor, current, { repo, remoteState: "drifted-from-ref" });
  }

  const head = atDefault?.ok
    ? hashIn(atDefault.source, anchor, resolver)
    : null;
  return head && head.hash !== anchor.hash
    ? {
        ...compared(anchor, head, { repo }),
        state: "drifted",
        remoteState: "drifted-on-default",
      }
    : compared(anchor, current, { repo, remoteState: "matches-ref" });
}

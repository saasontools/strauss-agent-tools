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
  AnchorHashKind,
  AnchorRead,
  AnchorResolver,
  AnchorResolverName,
  KbAnchorDriftEntry,
  KbDriftClass,
} from "./model.js";
import { anchorFileReader, readAnchorFiles } from "./read.js";
import { LazyOrigin, normalizeRepoUrl } from "./repo-identity.js";
import {
  anchorHashOf,
  defaultAnchorResolvers,
  prepareResolvers,
  resolveAnchorSpan,
  resolverChanged,
} from "./resolver.js";

export type AnchorDriftOptions = {
  repoRoot?: string;
  /** Single resolver, no chain. Convenience for tests. */
  resolver?: AnchorResolver;
  /** The chain, tried in order. Defaults to tree-sitter then regex. */
  resolvers?: readonly AnchorResolver[];
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
  const resolvers =
    options.resolvers ??
    (options.resolver ? [options.resolver] : defaultAnchorResolvers());
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
  await prepareResolvers(resolvers, [
    ...files,
    ...wants.map((want) => want.file),
  ]);

  const drift = new Map<string, KbAnchorDriftEntry[]>();
  for (const record of records) {
    const entries: KbAnchorDriftEntry[] = [];
    for (const { anchor, foreign } of planned.get(record.conceptId) ?? []) {
      entries.push(
        foreign
          ? remoteEntry(anchor, remote, resolvers)
          : localEntry(anchor, reads.get(anchor.file) as AnchorRead, resolvers),
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
    ...classOf(reason),
  };
}

/**
 * The class a hash comparison alone can settle.
 *
 * A vanished file or an undefined symbol is `gone` — the strongest signal
 * there is, because the described code does not exist to be re-read. Anything
 * that resolved and hashed differently is `changed` until a search proves it
 * only moved.
 */
export function provisionalDriftClass(
  entry: Pick<KbAnchorDriftEntry, "state" | "reason">,
): KbDriftClass | undefined {
  if (entry.state === "unresolved") {
    return entry.reason === "file-missing" ||
      entry.reason === "symbol-not-found"
      ? "gone"
      : undefined;
  }
  return entry.state === "drifted" ? "changed" : undefined;
}

/** `class` for an unresolved reason, or nothing to spread. */
function classOf(reason: KbAnchorDriftEntry["reason"]): {
  class?: KbDriftClass;
} {
  const settled = provisionalDriftClass({ state: "unresolved", reason });
  return settled ? { class: settled } : {};
}

type Current = {
  hash: string;
  kind: AnchorHashKind;
  lines: number;
  resolver?: AnchorResolverName;
};

/** The hash of an anchor's text in one source, or the reason it has none. */
function hashIn(
  source: string,
  anchor: KbAnchor,
  resolvers: readonly AnchorResolver[],
):
  | { ok: true; current: Current }
  | { ok: false; reason: KbAnchorDriftEntry["reason"] } {
  const outcome = resolveAnchorSpan(source, anchor, resolvers);
  if (!outcome.ok) return { ok: false, reason: outcome.reason };
  const { hash, kind } = anchorHashOf(anchor, outcome);
  return {
    ok: true,
    current: {
      hash,
      kind,
      lines: outcome.span.endLine - outcome.span.startLine + 1,
      ...(outcome.resolver ? { resolver: outcome.resolver } : {}),
    },
  };
}

/**
 * Which resolver produced the hash, and — when it differs from the stored one
 * — whether that swap is the whole difference. A regex-stamped anchor re-read
 * by tree-sitter drifts because the resolver changed, not because the code
 * did; named so a reader can tell the two apart before reaching for
 * `--rebaseline`.
 */
function resolverExtras(
  source: string,
  anchor: KbAnchor,
  current: Current,
): Partial<KbAnchorDriftEntry> {
  return {
    ...(current.resolver ? { resolver: current.resolver } : {}),
    ...(current.hash !== anchor.hash &&
    resolverChanged(source, anchor, current.resolver)
      ? { reason: "resolver-changed" as const }
      : {}),
  };
}

function compared(
  anchor: KbAnchor,
  current: Current,
  extra: Partial<KbAnchorDriftEntry> = {},
): KbAnchorDriftEntry {
  const matched = current.hash === anchor.hash;
  return {
    ...base(anchor),
    state: matched ? "match" : "drifted",
    currentHash: current.hash,
    hashKind: current.kind,
    diffSize:
      anchor.lines === undefined
        ? null
        : Math.abs(current.lines - anchor.lines),
    ...(matched ? {} : { class: "changed" as const }),
    ...extra,
  };
}

function localEntry(
  anchor: KbAnchor,
  read: AnchorRead,
  resolvers: readonly AnchorResolver[],
): KbAnchorDriftEntry {
  if (!read.ok) return unresolved(anchor, read.reason);
  const found = hashIn(read.source, anchor, resolvers);
  if (!found.ok) return unresolved(anchor, found.reason);
  return compared(
    anchor,
    found.current,
    resolverExtras(read.source, anchor, found.current),
  );
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
  resolvers: readonly AnchorResolver[],
): KbAnchorDriftEntry {
  const repo = anchor.repo as string;
  const key = normalizeRepoUrl(repo);
  const atDefault = remote.get(wantKey(key, undefined, anchor.file));
  const primary = anchor.ref
    ? remote.get(wantKey(key, anchor.ref, anchor.file))
    : atDefault;

  if (!primary) return unresolved(anchor, "remote-unreachable", repo);
  if (!primary.ok) return unresolved(anchor, primary.reason, repo);

  const found = hashIn(primary.source, anchor, resolvers);
  if (!found.ok) return unresolved(anchor, found.reason, repo);
  const current = found.current;
  const extras = resolverExtras(primary.source, anchor, current);
  if (!anchor.ref) return compared(anchor, current, { repo, ...extras });
  if (current.hash !== anchor.hash) {
    return compared(anchor, current, {
      repo,
      ...extras,
      remoteState: "drifted-from-ref",
    });
  }

  const head = atDefault?.ok
    ? hashIn(atDefault.source, anchor, resolvers)
    : null;
  return head?.ok && head.current.hash !== anchor.hash
    ? {
        ...compared(anchor, head.current, {
          repo,
          ...(head.current.resolver ? { resolver: head.current.resolver } : {}),
        }),
        state: "drifted",
        remoteState: "drifted-on-default",
      }
    : compared(anchor, current, {
        repo,
        ...extras,
        remoteState: "matches-ref",
      });
}

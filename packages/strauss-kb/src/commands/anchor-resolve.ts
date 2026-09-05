import { z } from "zod";
import {
  anchorFileReader,
  anchorHashOf,
  defaultAnchorResolvers,
  hashAnchorText,
  LazyOrigin,
  normalizeRepoUrl,
  prepareResolvers,
  readAnchorFiles,
  remoteWants,
  resolveAnchorSpan,
  resolverChanged,
  type AnchorDriftReason,
  type AnchorHashKind,
  type AnchorRead,
  type AnchorResolver,
  type AnchorResolverName,
  type AnchorUnresolvedReason,
  type RemoteAnchorState,
} from "../anchor-resolver/index.js";
import { grammarHints } from "../grammars/index.js";
import {
  KbRecordNotFoundError,
  KbSelfVerificationError,
} from "../kb-errors.js";
import { assertBaseNotFrozen, KbBaseFrozenError } from "../kb-pins/index.js";
import type { KbAnchor } from "../kb-record.schema.js";
import {
  isUncheckedReason,
  readRemoteAnchors,
  wantKey,
} from "../remote-repo/index.js";
import { argvFlag, bundlePath, conceptId, define } from "./model.js";

type AnchorResolveResult = {
  file: string;
  symbol?: string;
  state: "stamped" | "match" | "drifted" | "unresolved";
  storedHash?: string;
  currentHash?: string;
  /** What the compared hashes were taken over. */
  hashKind?: AnchorHashKind;
  /** `null` when the anchor recorded no `lines` — size unknown, not zero. */
  diffSize?: number | null;
  reason?: AnchorUnresolvedReason | AnchorDriftReason;
  resolver?: AnchorResolverName;
  rebaselined?: boolean;
  /** Set only when the anchor was resolved against another repository. */
  repo?: string;
  remoteState?: RemoteAnchorState;
};

/** What one anchor was compared against, and what "current" is beside it. */
type AnchorSource =
  | { ok: true; source: string; repo?: string; head?: string }
  | { ok: false; reason: AnchorUnresolvedReason; repo?: string };

/** Which resolvers produced this run's spans, for the verify note. */
function resolverSummary(results: AnchorResolveResult[]): string {
  const names = [
    ...new Set(
      results.flatMap((entry) => (entry.resolver ? [entry.resolver] : [])),
    ),
  ].sort();
  return names.length ? `${names.join(" + ")} resolver` : "whole-file";
}

export const anchorResolveCommand = define({
  name: "anchor-resolve",
  tool: "kb_anchor_resolve",
  usage:
    "anchor-resolve <concept-id> [--repo-root <path>] [--offline] [--rebaseline] [--restamp]",
  description:
    "Resolve a record's anchors: stamp a hash onto anchors that lack one, report drift where the code moved. An anchor naming another repository is read from that remote through a bare cache; --offline uses the cache only. kb_verify's mechanical counterpart — reach for it when the question is whether the code still is what it was. Exits non-zero on drift.",
  input: z.object({
    bundlePath,
    conceptId,
    repoRoot: z.string().min(1).optional(),
    offline: z
      .boolean()
      .optional()
      .describe(
        "Resolve foreign anchors from the local repo cache only, never fetching.",
      ),
    rebaseline: z
      .boolean()
      .optional()
      .describe(
        "Accept the current code as the new baseline for anchors that drifted.",
      ),
    restamp: z
      .boolean()
      .optional()
      .describe(
        "Refresh `resolved_at` on anchors that already match. Off by default, so a green run writes nothing.",
      ),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argv[1],
    repoRoot: argvFlag(argv, "--repo-root"),
    offline: argv.includes("--offline"),
    rebaseline: argv.includes("--rebaseline"),
    restamp: argv.includes("--restamp"),
  }),
  run: async (
    { store, actor, now },
    { bundlePath: path, conceptId: id, repoRoot, offline, rebaseline, restamp },
  ) => {
    const root = repoRoot ?? process.cwd();
    const record = await store.read(path, id);
    if (!record) throw new KbRecordNotFoundError(id);

    const anchors = record.frontmatter.strauss_anchors ?? [];
    if (!anchors.length) {
      return {
        conceptId: id,
        results: [] as AnchorResolveResult[],
        verified: false,
        note: "record has no anchors",
      };
    }

    const results: AnchorResolveResult[] = [];
    const updated: KbAnchor[] = [];
    let dirty = false;

    const sources = await readSources(anchors, root, offline === true);
    const resolvers = defaultAnchorResolvers({ offline: offline === true });
    await prepareResolvers(
      resolvers,
      anchors.map((anchor) => anchor.file),
    );

    for (const anchor of anchors) {
      const base: Pick<
        AnchorResolveResult,
        "file" | "symbol" | "storedHash" | "repo"
      > = {
        file: anchor.file,
        ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
        // Carried onto unresolved findings too: an anchor that once hashed
        // and now resolves to nothing is a broken anchor, and the exit code
        // has to be able to tell it from one nobody ever stamped.
        ...(anchor.hash ? { storedHash: anchor.hash } : {}),
      };
      const source = sources.get(anchor) as AnchorSource;
      if (source.repo) base.repo = source.repo;

      if (!source.ok) {
        results.push({ ...base, state: "unresolved", reason: source.reason });
        updated.push(anchor);
        continue;
      }

      const outcome = resolveAnchorSpan(source.source, anchor, resolvers);
      if (!outcome.ok) {
        results.push({
          ...base,
          state: "unresolved",
          reason: outcome.reason,
        });
        updated.push(anchor);
        continue;
      }

      const resolved = outcome.span;
      const producedBy = outcome.resolver;
      const { hash: currentHash, kind } = anchorHashOf(anchor, outcome);
      const currentLines = resolved.endLine - resolved.startLine + 1;
      // A fresh or rebaselined stamp takes the strongest hash the resolver can
      // offer: `hash_kind: "ast"` is over the parsed token stream, so
      // reformatting the anchored code stops registering as drift. An anchor
      // already carrying a raw hash keeps comparing raw until it is
      // rebaselined — see `anchorHashOf`.
      const stampedKind = outcome.normalized ? "ast" : "raw";
      const stampedHash = outcome.normalized
        ? anchorHashOf({ ...anchor, hash: undefined }, outcome).hash
        : currentHash;
      // `resolver` records which resolver the stored hash came from, so a
      // later run can tell a precise span from a heuristic one.
      const stamped: KbAnchor = {
        ...anchor,
        hash: stampedHash,
        hash_kind: stampedKind,
        lines: currentLines,
        resolved_at: now(),
        ...(producedBy ? { resolver: producedBy } : {}),
      };
      const pinned = anchor.ref !== undefined && source.repo !== undefined;

      if (!anchor.hash) {
        // The write path for hashes: kb_write callers record symbols, not
        // digests, and this pass fills them in once the code settles.
        results.push({
          ...base,
          state: "stamped",
          currentHash: stampedHash,
          hashKind: stampedKind,
          ...(producedBy ? { resolver: producedBy } : {}),
        });
        updated.push(stamped);
        dirty = true;
        continue;
      }

      if (anchor.hash !== currentHash) {
        results.push({
          ...base,
          state: "drifted",
          currentHash,
          hashKind: kind,
          diffSize: lineDelta(anchor, currentLines),
          ...(producedBy ? { resolver: producedBy } : {}),
          // A regex-stamped anchor re-read by tree-sitter drifts because the
          // resolver changed, not because the code did.
          ...(resolverChanged(source.source, anchor, producedBy)
            ? { reason: "resolver-changed" as const }
            : {}),
          ...(pinned ? { remoteState: "drifted-from-ref" as const } : {}),
          ...(rebaseline ? { rebaselined: true } : {}),
        });
        updated.push(rebaseline ? stamped : anchor);
        if (rebaseline) dirty = true;
        continue;
      }

      // The evidence still holds at the pinned commit and the default branch
      // has moved past it. Never rebaselined: the repair is to move `ref`,
      // which is the author's field, not this command's.
      const onDefault = pinned
        ? headHash(source, anchor, resolvers)
        : undefined;
      if (onDefault && onDefault.hash !== anchor.hash) {
        results.push({
          ...base,
          state: "drifted",
          currentHash: onDefault.hash,
          diffSize: lineDelta(anchor, onDefault.lines),
          remoteState: "drifted-on-default",
        });
        updated.push(anchor);
        continue;
      }

      results.push({
        ...base,
        state: "match",
        currentHash,
        hashKind: kind,
        ...(producedBy ? { resolver: producedBy } : {}),
        ...(pinned ? { remoteState: "matches-ref" as const } : {}),
      });
      // Nothing changed, so nothing is written: a re-dated record on every
      // green CI run would be a mutation, a log line, and a git diff saying
      // only that a check ran. `resolved_at` is filled in when it is absent
      // (the anchor predates hashing), or on request.
      const refresh = restamp || anchor.resolved_at === undefined;
      updated.push(refresh ? { ...anchor, resolved_at: now() } : anchor);
      if (refresh) dirty = true;
    }

    // Frozen bases refuse writes, not reads: pure drift reporting is
    // legitimate on a concluded base, so the report is computed first and the
    // freeze only costs the mutation. Reported rather than thrown — a caller
    // asking a concluded base whether its code moved deserves the answer.
    let frozen = false;
    if (dirty) {
      try {
        await assertBaseNotFrozen(process.cwd(), path);
      } catch (error) {
        if (!(error instanceof KbBaseFrozenError)) throw error;
        frozen = true;
      }
      if (!frozen) await store.updateAnchors(path, id, updated, actor);
    }
    const frozenNote = frozen
      ? { frozen: true, note: "base is frozen: nothing was stamped" }
      : {};
    // What to do about a grammar this run could not obtain. Written once, in
    // the grammars module, so doctor and this command say the same thing.
    const hints = grammarHints();
    const hintNote = hints.length ? { hints } : {};

    // Evidence only when every checkable anchor already matched: a freshly
    // stamped anchor is a baseline nobody has checked. An anchor nothing could
    // reach stays outside the denominator rather than against it, and also
    // keeps the run from verifying — "could not look" is not "matches".
    const unreachable = results.filter((entry) =>
      isUncheckedReason(entry.reason),
    ).length;
    const checked = results.length - unreachable;
    const matches = results.filter((entry) => entry.state === "match").length;
    const note = `${matches}/${checked} anchors match${
      unreachable ? `, ${unreachable} unreachable` : ""
    }`;
    const clean = checked > 0 && matches === checked && unreachable === 0;
    if (clean) {
      try {
        await store.verify(
          path,
          id,
          `anchor-resolve: ${note} (${resolverSummary(results)})`,
          actor,
          now(),
        );
      } catch (error) {
        // A mechanical resolve run by the record's own generator is still a
        // useful drift report; only the verified[] stamp is refused.
        if (!(error instanceof KbSelfVerificationError)) throw error;
        return {
          conceptId: id,
          results,
          verified: false,
          verifyRefused: "self-verification",
          ...frozenNote,
          ...hintNote,
        };
      }
      return {
        conceptId: id,
        results,
        verified: true,
        ...frozenNote,
        ...hintNote,
      };
    }

    return {
      conceptId: id,
      results,
      verified: false,
      ...(unreachable ? { note } : {}),
      ...frozenNote,
      ...hintNote,
    };
  },
  // A stored hash that no longer resolves is a broken anchor, not an absence:
  // the file was deleted or the symbol renamed, and exiting zero on it would
  // let the one edit that destroys an anchor pass the gate that exists to
  // catch it. An anchor nobody ever stamped is still just unstamped, and one
  // whose remote nothing could reach was never checked — failing CI on either
  // would gate on work this command did not do.
  failsWhen: (result) =>
    (result as { results: AnchorResolveResult[] }).results.some(
      (entry) =>
        entry.state === "drifted" ||
        (entry.state === "unresolved" &&
          entry.storedHash !== undefined &&
          !isUncheckedReason(entry.reason)),
    ),
});

function lineDelta(anchor: KbAnchor, current: number): number | null {
  return anchor.lines === undefined ? null : Math.abs(current - anchor.lines);
}

/** The anchor's hash on the remote's default branch, when one was read. */
function headHash(
  source: { head?: string },
  anchor: KbAnchor,
  resolvers: readonly AnchorResolver[],
): { hash: string; lines: number } | undefined {
  if (source.head === undefined) return undefined;
  const outcome = resolveAnchorSpan(source.head, anchor, resolvers);
  if (!outcome.ok) return undefined;
  return {
    hash: hashAnchorText(outcome.span.text),
    lines: outcome.span.endLine - outcome.span.startLine + 1,
  };
}

/**
 * What each anchor is read from: the working tree for this repository's own
 * anchors, a bare remote cache for every other. Both sets are collected first,
 * so git is spawned once per (repo, rev) and never inside the loop.
 */
async function readSources(
  anchors: readonly KbAnchor[],
  root: string,
  offline: boolean,
): Promise<Map<KbAnchor, AnchorSource>> {
  const origin = new LazyOrigin(root);
  if (anchors.some((anchor) => anchor.repo)) await origin.prime();
  const foreign = new Map(
    anchors.map((anchor) => [anchor, origin.isForeign(anchor)] as const),
  );

  const local = anchors.filter((anchor) => !foreign.get(anchor));
  const remote = anchors.filter((anchor) => foreign.get(anchor));
  const reads = await readAnchorFiles(
    local.map((anchor) => anchor.file),
    anchorFileReader(root),
  );
  const blobs = await readRemoteAnchors(remote.flatMap(remoteWants), {
    offline,
  });

  const sources = new Map<KbAnchor, AnchorSource>();
  for (const anchor of local) {
    const read = reads.get(anchor.file) as AnchorRead;
    sources.set(
      anchor,
      read.ok
        ? { ok: true, source: read.source }
        : { ok: false, reason: read.reason },
    );
  }
  for (const anchor of remote) {
    const repo = anchor.repo as string;
    const key = normalizeRepoUrl(repo);
    const atDefault = blobs.get(wantKey(key, undefined, anchor.file));
    const primary = anchor.ref
      ? blobs.get(wantKey(key, anchor.ref, anchor.file))
      : atDefault;
    if (!primary?.ok) {
      sources.set(anchor, {
        ok: false,
        reason: primary?.ok === false ? primary.reason : "remote-unreachable",
        repo,
      });
      continue;
    }
    sources.set(anchor, {
      ok: true,
      source: primary.source,
      repo,
      ...(anchor.ref && atDefault?.ok ? { head: atDefault.source } : {}),
    });
  }
  return sources;
}

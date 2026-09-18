import {
  anchorHashOf,
  defaultAnchorResolvers,
  hashAnchorText,
  prepareResolvers,
  resolveAnchorSpan,
  resolverChanged,
  type AnchorResolver,
} from "../../anchor-resolver/index.js";
import type { KbAnchor } from "../../kb-record.schema.js";
import type { AnchorPlan, AnchorResolveResult, AnchorSource } from "./model.js";
import { readSources } from "./sources.js";

export type PlanOptions = {
  root: string;
  offline: boolean;
  rebaseline: boolean;
  restamp: boolean;
  check: boolean;
  /** A base that refuses writes: plan only what it would accept. */
  frozen?: boolean;
  now: () => string;
};

/**
 * The comparison pass: what each anchor's code looks like now, and which write
 * that earns. Nothing here persists, so no finding it produces says a baseline
 * moved — `apply` is what turns a pending write into an outcome.
 */
export async function planAnchors(
  anchors: readonly KbAnchor[],
  options: PlanOptions,
): Promise<AnchorPlan[]> {
  const { root, offline, rebaseline, restamp, check, frozen, now } = options;
  const sources = await readSources(anchors, root, offline);
  const resolvers = defaultAnchorResolvers({ offline });
  await prepareResolvers(
    resolvers,
    anchors.map((anchor) => anchor.file),
  );

  const plans: AnchorPlan[] = [];
  for (const anchor of anchors) {
    const base: Pick<
      AnchorResolveResult,
      "file" | "symbol" | "side" | "storedHash" | "repo"
    > = {
      file: anchor.file,
      ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
      ...(anchor.side === "old" ? { side: "old" as const } : {}),
      // Carried onto unresolved findings too: an anchor that once hashed
      // and now resolves to nothing is a broken anchor, and the exit code
      // has to be able to tell it from one nobody ever stamped.
      ...(anchor.hash ? { storedHash: anchor.hash } : {}),
    };
    const source = sources.get(anchor) as AnchorSource;
    if (source.repo) base.repo = source.repo;

    if (!source.ok) {
      plans.push({
        finding: { ...base, state: "unresolved", reason: source.reason },
        anchor,
      });
      continue;
    }

    const outcome = resolveAnchorSpan(source.source, anchor, resolvers);
    if (!outcome.ok) {
      plans.push({
        finding: { ...base, state: "unresolved", reason: outcome.reason },
        anchor,
      });
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
      // digests, and this pass fills them in once the code settles. The
      // finding says `unstamped` until the record is written.
      plans.push({
        finding: {
          ...base,
          state: "unstamped",
          currentHash: stampedHash,
          hashKind: stampedKind,
          ...(producedBy ? { resolver: producedBy } : {}),
        },
        anchor: check ? anchor : stamped,
        ...(check ? {} : { write: "stamp" as const }),
      });
      continue;
    }

    if (anchor.hash !== currentHash) {
      plans.push({
        finding: {
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
        },
        anchor: rebaseline && !check ? stamped : anchor,
        ...(rebaseline && !check ? { write: "rebaseline" as const } : {}),
      });
      continue;
    }

    // The evidence still holds at the pinned commit and the default branch
    // has moved past it. Never rebaselined: the repair is to move `ref`,
    // which is the author's field, not this command's.
    const onDefault = pinned ? headHash(source, anchor, resolvers) : undefined;
    if (onDefault && onDefault.hash !== anchor.hash) {
      plans.push({
        finding: {
          ...base,
          state: "drifted",
          currentHash: onDefault.hash,
          diffSize: lineDelta(anchor, onDefault.lines),
          remoteState: "drifted-on-default",
          ...(rebaseline
            ? {
                outcome: "skipped" as const,
                outcomeReason: "pinned-ref" as const,
              }
            : {}),
        },
        anchor,
      });
      continue;
    }

    // Nothing changed, so nothing is written: a re-dated record on every
    // green CI run would be a mutation, a log line, and a git diff saying
    // only that a check ran. `resolved_at` is filled in when it is absent
    // (the anchor predates hashing), or on request. Only `--restamp` asks,
    // so a frozen base keeps the backfill rather than failing forever on a
    // date nobody wanted.
    const backfill = anchor.resolved_at === undefined && !frozen;
    const refresh = !check && (restamp || backfill);
    plans.push({
      finding: {
        ...base,
        state: "match",
        currentHash,
        hashKind: kind,
        ...(producedBy ? { resolver: producedBy } : {}),
        ...(pinned ? { remoteState: "matches-ref" as const } : {}),
      },
      anchor: refresh ? { ...anchor, resolved_at: now() } : anchor,
      ...(refresh ? { write: "refresh" as const } : {}),
    });
  }
  return plans;
}

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

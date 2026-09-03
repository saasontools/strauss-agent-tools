import { z } from "zod";
import {
  anchorFileReader,
  anchorHashOf,
  defaultAnchorResolvers,
  LazyOrigin,
  prepareResolvers,
  readAnchorFiles,
  resolveAnchorSpan,
  resolverChanged,
  type AnchorDriftReason,
  type AnchorHashKind,
  type AnchorRead,
  type AnchorResolverName,
  type AnchorUnresolvedReason,
} from "../anchor-resolver.js";
import {
  KbRecordNotFoundError,
  KbSelfVerificationError,
} from "../kb-errors.js";
import { assertBaseNotFrozen, KbBaseFrozenError } from "../kb-pins/index.js";
import type { KbAnchor } from "../kb-record.schema.js";
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
};

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
    "anchor-resolve <concept-id> [--repo-root <path>] [--rebaseline] [--restamp]",
  description:
    "Resolve a record's anchors against the working tree: stamp a hash onto anchors that lack one, report drift where the code moved. kb_verify's mechanical counterpart — reach for it when the question is whether the code still is what it was, not whether the claim still holds. Anchors naming another repository are skipped. Exits non-zero on drift.",
  input: z.object({
    bundlePath,
    conceptId,
    repoRoot: z.string().min(1).optional(),
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
    rebaseline: argv.includes("--rebaseline"),
    restamp: argv.includes("--restamp"),
  }),
  run: async (
    { store, actor, now },
    { bundlePath: path, conceptId: id, repoRoot, rebaseline, restamp },
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
    const origin = new LazyOrigin(root);
    let dirty = false;

    // Foreign anchors are settled first so their files are never read, then
    // the rest of the record's distinct files are fetched in one pass.
    if (anchors.some((anchor) => anchor.repo)) await origin.prime();
    const foreign = new Map(
      anchors.map((anchor) => [anchor, origin.isForeign(anchor)] as const),
    );
    const files = anchors
      .filter((anchor) => !foreign.get(anchor))
      .map((anchor) => anchor.file);
    const reads = await readAnchorFiles(files, anchorFileReader(root));
    const resolvers = defaultAnchorResolvers();
    await prepareResolvers(resolvers, files);

    for (const anchor of anchors) {
      const base: Pick<AnchorResolveResult, "file" | "symbol" | "storedHash"> =
        {
          file: anchor.file,
          ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
          // Carried onto unresolved findings too: an anchor that once hashed
          // and now resolves to nothing is a broken anchor, and the exit code
          // has to be able to tell it from one nobody ever stamped.
          ...(anchor.hash ? { storedHash: anchor.hash } : {}),
        };

      // Another repository's anchor: left exactly as it is, not read, not
      // stamped, and not counted against the record. Resolving it needs a
      // second checkout, which is SAA-709.
      if (foreign.get(anchor)) {
        results.push({ ...base, state: "unresolved", reason: "foreign-repo" });
        updated.push(anchor);
        continue;
      }

      const fileRead = reads.get(anchor.file) as AnchorRead;
      if (!fileRead.ok) {
        results.push({ ...base, state: "unresolved", reason: fileRead.reason });
        updated.push(anchor);
        continue;
      }

      const outcome = resolveAnchorSpan(fileRead.source, anchor, resolvers);
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
      } else if (anchor.hash === currentHash) {
        results.push({
          ...base,
          state: "match",
          currentHash,
          hashKind: kind,
          ...(producedBy ? { resolver: producedBy } : {}),
        });
        // Nothing changed, so nothing is written: a re-dated record on every
        // green CI run would be a mutation, a log line, and a git diff saying
        // only that a check ran. `resolved_at` is filled in when it is absent
        // (the anchor predates hashing), or on request.
        const refresh = restamp || anchor.resolved_at === undefined;
        updated.push(refresh ? { ...anchor, resolved_at: now() } : anchor);
        if (refresh) dirty = true;
      } else {
        results.push({
          ...base,
          state: "drifted",
          currentHash,
          hashKind: kind,
          diffSize:
            anchor.lines === undefined
              ? null
              : Math.abs(currentLines - anchor.lines),
          ...(producedBy ? { resolver: producedBy } : {}),
          ...(resolverChanged(fileRead.source, anchor, producedBy)
            ? { reason: "resolver-changed" as const }
            : {}),
          ...(rebaseline ? { rebaselined: true } : {}),
        });
        updated.push(rebaseline ? stamped : anchor);
        if (rebaseline) dirty = true;
      }
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

    // Evidence only when every checkable anchor already matched: a freshly
    // stamped anchor is a baseline nobody has checked. Anchors in another
    // repository are outside the denominator rather than against it, and the
    // note says how many were skipped.
    const checked = results.filter((entry) => entry.reason !== "foreign-repo");
    const skipped = results.length - checked.length;
    const matches = checked.filter((entry) => entry.state === "match").length;
    const clean =
      checked.length > 0 && checked.every((entry) => entry.state === "match");
    if (clean) {
      try {
        await store.verify(
          path,
          id,
          `anchor-resolve: ${matches}/${checked.length} anchors match${
            skipped ? `, ${skipped} in another repo` : ""
          } (${resolverSummary(results)})`,
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
        };
      }
      return { conceptId: id, results, verified: true, ...frozenNote };
    }

    return { conceptId: id, results, verified: false, ...frozenNote };
  },
  // A stored hash that no longer resolves is a broken anchor, not an absence:
  // the file was deleted or the symbol renamed, and exiting zero on it would
  // let the one edit that destroys an anchor pass the gate that exists to
  // catch it. An anchor nobody ever stamped is still just unstamped, and one
  // belonging to another repository was never this run's to check — failing CI
  // on either would gate on work this command did not do.
  failsWhen: (result) =>
    (result as { results: AnchorResolveResult[] }).results.some(
      (entry) =>
        entry.state === "drifted" ||
        (entry.state === "unresolved" &&
          entry.storedHash !== undefined &&
          entry.reason !== "foreign-repo"),
    ),
});

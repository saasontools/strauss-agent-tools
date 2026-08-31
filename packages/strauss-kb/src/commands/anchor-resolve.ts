import { z } from "zod";
import {
  hashAnchorText,
  readAnchorFile,
  resolveAnchor,
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
  /** `null` when the anchor recorded no `lines` — size unknown, not zero. */
  diffSize?: number | null;
  reason?: AnchorUnresolvedReason;
  rebaselined?: boolean;
};

export const anchorResolveCommand = define({
  name: "anchor-resolve",
  tool: "kb_anchor_resolve",
  usage:
    "anchor-resolve <concept-id> [--repo-root <path>] [--rebaseline] [--restamp]",
  description:
    "Resolve a record's anchors against the working tree: stamp a hash onto anchors that lack one, and report drift where the code moved out from under a stored hash. An unreadable file or unfindable symbol is a finding, not an error. Exits non-zero when an anchor drifted or when one that carries a hash no longer resolves — a deleted file is as much a broken anchor as a rewritten one — so a CI gate can run it; --rebaseline accepts the current code as the new baseline. An anchor that still matches is left alone rather than re-dated, so a green run writes nothing at all; --restamp refreshes `resolved_at` when you want the record to say when it was last checked.",
  input: z.object({
    bundlePath,
    conceptId,
    repoRoot: z.string().min(1).optional(),
    rebaseline: z.boolean().optional(),
    restamp: z
      .boolean()
      .optional()
      .describe(
        "Refresh `resolved_at` on anchors that already match. Off by default: a matching anchor is unchanged, and rewriting the record on every green run would fill the log with nothing.",
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
    let dirty = false;

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

      const read = await readAnchorFile(root, anchor.file);
      if (!read.ok) {
        results.push({ ...base, state: "unresolved", reason: read.reason });
        updated.push(anchor);
        continue;
      }

      const resolved = resolveAnchor(read.source, anchor);
      if (!resolved) {
        results.push({
          ...base,
          state: "unresolved",
          reason: "symbol-not-found",
        });
        updated.push(anchor);
        continue;
      }

      const currentHash = hashAnchorText(resolved.text);
      const currentLines = resolved.endLine - resolved.startLine + 1;
      const stamped: KbAnchor = {
        ...anchor,
        hash: currentHash,
        lines: currentLines,
        resolved_at: now(),
      };

      if (!anchor.hash) {
        // The write path for hashes: kb_write callers record symbols, not
        // digests, and this pass fills them in once the code settles.
        results.push({ ...base, state: "stamped", currentHash });
        updated.push(stamped);
        dirty = true;
      } else if (anchor.hash === currentHash) {
        results.push({
          ...base,
          state: "match",
          currentHash,
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
          diffSize:
            anchor.lines === undefined
              ? null
              : Math.abs(currentLines - anchor.lines),
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

    // Every anchor matched — not "nothing went wrong". A freshly stamped
    // anchor is a baseline nobody has checked against anything, and counting
    // it as evidence would let a record verify itself into trustworthiness on
    // the very run that invented its hash.
    const matches = results.filter((entry) => entry.state === "match").length;
    const clean =
      results.length > 0 && results.every((entry) => entry.state === "match");
    if (clean) {
      try {
        await store.verify(
          path,
          id,
          `anchor-resolve: ${matches}/${results.length} anchors match (regex resolver)`,
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
  // catch it. An anchor nobody ever stamped is still just unstamped.
  failsWhen: (result) =>
    (result as { results: AnchorResolveResult[] }).results.some(
      (entry) =>
        entry.state === "drifted" ||
        (entry.state === "unresolved" && entry.storedHash !== undefined),
    ),
});

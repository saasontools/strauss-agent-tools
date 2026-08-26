import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { hashAnchorText, resolveAnchor } from "../anchor-resolver.js";
import {
  KbRecordNotFoundError,
  KbSelfVerificationError,
} from "../kb-errors.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
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
  reason?: "file-missing" | "symbol-not-found";
  rebaselined?: boolean;
};

export const anchorResolveCommand = define({
  name: "anchor-resolve",
  tool: "kb_anchor_resolve",
  usage: "anchor-resolve <concept-id> [--repo-root <path>] [--rebaseline]",
  description:
    "Resolve a record's anchors against the working tree: stamp a hash onto anchors that lack one, refresh matches, and report drift where the code moved out from under a stored hash. An unreadable file or unfindable symbol is a finding, not an error. Exits non-zero on drift, so a CI gate can run it; --rebaseline accepts the current code as the new baseline.",
  input: z.object({
    bundlePath,
    conceptId,
    repoRoot: z.string().min(1).optional(),
    rebaseline: z.boolean().optional(),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argv[1],
    repoRoot: argvFlag(argv, "--repo-root"),
    rebaseline: argv.includes("--rebaseline"),
  }),
  run: async (
    { store, actor, now },
    { bundlePath: path, conceptId: id, repoRoot, rebaseline },
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
      const base: Pick<AnchorResolveResult, "file" | "symbol"> = {
        file: anchor.file,
        ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
      };

      // Anchors are repo-relative, hand-written often enough that `./` shows up.
      const source = await readFile(
        join(root, anchor.file.replace(/^\.\//, "")),
        "utf8",
      ).catch(() => null);
      if (source === null) {
        results.push({ ...base, state: "unresolved", reason: "file-missing" });
        updated.push(anchor);
        continue;
      }

      const resolved = resolveAnchor(source, anchor);
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
          storedHash: anchor.hash,
          currentHash,
        });
        updated.push({ ...anchor, resolved_at: now() });
        dirty = true;
      } else {
        results.push({
          ...base,
          state: "drifted",
          storedHash: anchor.hash,
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
    // legitimate on a concluded base, so the gate runs only when a stamp,
    // refresh, or rebaseline is about to land.
    if (dirty) {
      await assertBaseNotFrozen(process.cwd(), path);
      await store.updateAnchors(path, id, updated, actor);
    }

    const matches = results.filter((entry) => entry.state === "match").length;
    const clean =
      matches >= 1 &&
      results.every(
        (entry) => entry.state !== "drifted" && entry.state !== "unresolved",
      );
    if (clean) {
      try {
        await store.verify(
          path,
          id,
          `anchor-resolve: ${matches}/${matches} anchors match (regex resolver)`,
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
        };
      }
      return { conceptId: id, results, verified: true };
    }

    return { conceptId: id, results, verified: false };
  },
  failsWhen: (result) =>
    (result as { results: AnchorResolveResult[] }).results.some(
      (entry) => entry.state === "drifted",
    ),
});

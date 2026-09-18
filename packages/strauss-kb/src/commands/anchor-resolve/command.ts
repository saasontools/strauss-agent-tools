import { z } from "zod";
import { grammarHints } from "../../grammars/index.js";
import { KbFlagConflictError, KbRecordNotFoundError } from "../../kb-errors.js";
import { isUncheckedReason } from "../../remote-repo/index.js";
import { argvFlag, bundlePath, conceptId, define } from "../model.js";
import { applyPlan, baseFrozen } from "./apply.js";
import type { AnchorResolveResult } from "./model.js";
import { planAnchors } from "./plan.js";

export const anchorResolveCommand = define({
  name: "anchor-resolve",
  tool: "kb_anchor_resolve",
  usage:
    "anchor-resolve <concept-id> [--repo-root <path>] [--offline] [--rebaseline] [--restamp] [--check]",
  description:
    "Resolve a record's anchors: stamp a hash onto anchors that lack one, report drift where the code moved. An anchor naming another repository is read from that remote through a bare cache; --offline uses the cache only. Never writes verified[]; a judgment is kb_verify. Each result says what it compared and whether the write applied.",
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
    check: z
      .boolean()
      .optional()
      .describe(
        "Resolve and report only: no hash, no `resolved_at`, no log entry.",
      ),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argv[1],
    repoRoot: argvFlag(argv, "--repo-root"),
    offline: argv.includes("--offline"),
    rebaseline: argv.includes("--rebaseline"),
    restamp: argv.includes("--restamp"),
    check: argv.includes("--check"),
  }),
  run: async (
    { store, actor, now },
    {
      bundlePath: path,
      conceptId: id,
      repoRoot,
      offline,
      rebaseline,
      restamp,
      check,
    },
  ) => {
    if (check && (rebaseline || restamp)) {
      throw new KbFlagConflictError([
        "check",
        rebaseline ? "rebaseline" : "restamp",
      ]);
    }
    const root = repoRoot ?? process.cwd();
    const record = await store.read(path, id);
    if (!record) throw new KbRecordNotFoundError(id);

    const anchors = record.frontmatter.strauss_anchors ?? [];
    if (!anchors.length) {
      return {
        conceptId: id,
        results: [] as AnchorResolveResult[],
        note: "record has no anchors",
      };
    }

    // Two passes: what the code says, then what the base took. A report that
    // claimed a baseline while preparing one would call a refused write a
    // completed rebaseline.
    const frozen = check ? false : await baseFrozen(process.cwd(), path);
    const plans = await planAnchors(anchors, {
      root,
      offline: offline === true,
      rebaseline: rebaseline === true,
      restamp: restamp === true,
      check: check === true,
      frozen,
      now,
    });
    const applied = await applyPlan(plans, {
      store,
      actor,
      bundlePath: path,
      conceptId: id,
      frozen,
    });
    const results = applied.results;

    // A freeze is only news where it cost something: a base that owed no
    // write is not "nothing was stamped".
    const refused = frozen && plans.some((plan) => plan.write);
    // What to do about a grammar this run could not obtain. Written once, in
    // the grammars module, so doctor and this command say the same thing.
    const hints = grammarHints();
    const hintNote = hints.length ? { hints } : {};

    // Never `verified[]`: that trail holds judgments, and the hash above is
    // the mechanical evidence. An anchor nothing could reach stays outside the
    // denominator — "could not look" is not "matches".
    const unreachable = results.filter((entry) =>
      isUncheckedReason(entry.reason),
    ).length;
    const matches = results.filter((entry) => entry.state === "match").length;
    // One `note`, so a refused write never costs the caller the count it was
    // reading.
    const note = [
      unreachable
        ? `${matches}/${results.length - unreachable} anchors match, ${unreachable} unreachable`
        : "",
      refused ? "base is frozen: nothing was stamped" : "",
      applied.error ? `nothing was written: ${applied.error}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    return {
      conceptId: id,
      results,
      ...(note ? { note } : {}),
      ...(refused ? { frozen: true } : {}),
      ...hintNote,
    };
  },
  // Drift is a finding until a write settles it: a rebaseline the base took is
  // the answer to the drift it reports, while one refused, skipped, or never
  // asked for leaves the gate exactly what it was meant to catch.
  //
  // A stored hash that no longer resolves is a broken anchor, not an absence:
  // the file was deleted or the symbol renamed. An anchor nobody ever stamped
  // is still just unstamped, and one whose remote nothing could reach was
  // never checked — failing CI on either would gate on work this command did
  // not do.
  failsWhen: (result) =>
    (result as { results: AnchorResolveResult[] }).results.some(
      (entry) =>
        entry.outcome === "failed" ||
        entry.outcome === "skipped" ||
        (entry.state === "drifted" && entry.outcome !== "applied") ||
        (entry.state === "unresolved" &&
          entry.storedHash !== undefined &&
          !isUncheckedReason(entry.reason)),
    ),
});

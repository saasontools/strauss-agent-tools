import { assertBaseNotFrozen } from "../../kb-pins/index.js";
import { isUncheckedReason } from "../../remote-repo/index.js";
import {
  anchorResolveCommand,
  type AnchorResolveResult,
} from "../anchor-resolve/index.js";
import { argvFlag, define } from "../model.js";
import {
  applyAnchorSet,
  type KbAnchorSetOutcome,
} from "../../anchors/index.js";
import { anchorSetCommandInput, type KbAnchorSetResult } from "./model.js";

/** Said in the result, because the caller's next step depends on knowing it. */
const NOTE =
  "pointers only: nothing was resolved or verified. Run anchor-resolve to check the new pointers, --rebaseline to accept the code, or pass resolve to do both here.";
const STAMPED_NOTE =
  "pointers set and stamped against the current code. Not verification: run verify separately if someone reviewed it.";
const INCOMPLETE_NOTE =
  "pointers set, but not every anchor was stamped: see each resolved entry's state and outcome.";

export const anchorSetCommand = define({
  name: "anchor-set",
  tool: "kb_anchor_set",
  usage:
    "anchor-set <concept-id> [--resolve] [--repo-root <path>] [--offline] < anchors.json",
  description:
    "Set a record's code anchors after a reviewed refactor, with a reason. The array is the whole set. With resolve, every anchor is stamped against the current code in the same call; without it, run kb_anchor_resolve next. Recorded in the log, never verification.",
  input: anchorSetCommandInput,
  fromArgv: async (argv, path, stdin) => ({
    bundlePath: path,
    conceptId: argv[1],
    input: JSON.parse(await stdin()) as unknown,
    resolve: argv.includes("--resolve"),
    repoRoot: argvFlag(argv, "--repo-root"),
    offline: argv.includes("--offline"),
  }),
  run: async (
    ctx,
    { bundlePath: path, conceptId: id, input, resolve, repoRoot, offline },
  ): Promise<KbAnchorSetResult> => {
    const { store, actor } = ctx;
    await assertBaseNotFrozen(process.cwd(), path);

    // Inside the mutation, so the logged changes are against the record as it
    // stands, not as the caller last read it.
    let applied: KbAnchorSetOutcome | undefined;
    const record = await store.updateAnchors(
      path,
      id,
      (current) => {
        applied = applyAnchorSet(current, input.anchors);
        return {
          anchors: applied.anchors,
          log: {
            operation: "anchor-set",
            reason: input.reason,
            anchors: applied.changes,
          },
        };
      },
      actor,
    );

    const changes = applied?.changes ?? [];
    if (!resolve) {
      return {
        conceptId: id,
        reason: input.reason,
        changes,
        anchors: record.frontmatter.strauss_anchors ?? [],
        baseline: "unchanged",
        note: NOTE,
      };
    }

    // Choosing the pointer is the reading, so the current code is the
    // baseline. Reuses anchor-resolve rather than restating it.
    const resolved = (await anchorResolveCommand.run(
      ctx,
      anchorResolveCommand.input.parse({
        bundlePath: path,
        conceptId: id,
        rebaseline: true,
        ...(repoRoot ? { repoRoot } : {}),
        ...(offline ? { offline } : {}),
      }),
    )) as { results: AnchorResolveResult[] };
    const after = await store.read(path, id);
    // Stamped is what the base holds, not what was asked: a refused or
    // skipped write, or an anchor nothing resolved, leaves the set incomplete.
    const stamped = resolved.results.every(
      (entry) => entry.state === "match" || entry.outcome === "applied",
    );
    return {
      conceptId: id,
      reason: input.reason,
      changes,
      anchors: after?.frontmatter.strauss_anchors ?? [],
      baseline: stamped ? "stamped" : "incomplete",
      resolved: resolved.results,
      note: stamped ? STAMPED_NOTE : INCOMPLETE_NOTE,
    };
  },
  // With `resolve`, a pointer that names nothing is a failed set, not a
  // finding to read later, and a stamp that did not land fails as it does in
  // anchor-resolve. A remote nothing could reach was never checked, so it does
  // not fail — the same line anchor-resolve draws.
  failsWhen: (result, input) => {
    const resolved = (result as KbAnchorSetResult).resolved ?? [];
    return (
      resolved.some(
        (entry) =>
          entry.state === "unresolved" && !isUncheckedReason(entry.reason),
      ) ||
      anchorResolveCommand.failsWhen?.({ results: resolved }, input) === true
    );
  },
});

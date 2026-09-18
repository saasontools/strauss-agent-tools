import { assertBaseNotFrozen } from "../../kb-pins/index.js";
import { anchorResolveCommand } from "../anchor-resolve.js";
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
    )) as { results: unknown[] };
    const after = await store.read(path, id);
    return {
      conceptId: id,
      reason: input.reason,
      changes,
      anchors: after?.frontmatter.strauss_anchors ?? [],
      baseline: "stamped",
      resolved: resolved.results,
      note: STAMPED_NOTE,
    };
  },
});

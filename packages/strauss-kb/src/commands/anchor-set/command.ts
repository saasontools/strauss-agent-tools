import { assertBaseNotFrozen } from "../../kb-pins/index.js";
import { define } from "../model.js";
import {
  applyAnchorSet,
  type KbAnchorSetOutcome,
} from "../../anchors/index.js";
import { anchorSetCommandInput, type KbAnchorSetResult } from "./model.js";

/** Said in the result, because the caller's next step depends on knowing it. */
const NOTE =
  "pointers only: nothing was resolved, rebaselined or verified. Run anchor-resolve to check the new pointers, --rebaseline to accept the code, and verify separately.";

export const anchorSetCommand = define({
  name: "anchor-set",
  tool: "kb_anchor_set",
  usage: "anchor-set <concept-id> < anchors.json",
  description:
    "Set a record's code anchors after a reviewed refactor, with a reason. The array is the whole set. Carry an anchor's hash forward to keep drift visible until you read the new code; omit it to let anchor-resolve stamp the current code. Recorded in the log, never verification.",
  input: anchorSetCommandInput,
  fromArgv: async (argv, path, stdin) => ({
    bundlePath: path,
    conceptId: argv[1],
    input: JSON.parse(await stdin()) as unknown,
  }),
  run: async (
    { store, actor },
    { bundlePath: path, conceptId: id, input },
  ): Promise<KbAnchorSetResult> => {
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

    return {
      conceptId: id,
      reason: input.reason,
      changes: applied?.changes ?? [],
      anchors: record.frontmatter.strauss_anchors ?? [],
      baseline: "unchanged",
      note: NOTE,
    };
  },
});

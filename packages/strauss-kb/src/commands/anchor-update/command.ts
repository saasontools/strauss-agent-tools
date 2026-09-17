import { z } from "zod";
import { assertBaseNotFrozen } from "../../kb-pins/index.js";
import { bundlePath, conceptId, define } from "../model.js";
import {
  anchorPatchInputSchema,
  type KbAnchorPatchResult,
  type KbAnchorUpdateResult,
} from "./model.js";
import { applyAnchorPatch } from "./patch.js";

/** Said in the result, because the caller's next step depends on knowing it. */
const NOTE =
  "pointers only: nothing was resolved, rebaselined or verified. Run anchor-resolve to check the new pointers, --rebaseline to accept the code, and verify separately.";

export const anchorUpdateCommand = define({
  name: "anchor-update",
  tool: "kb_anchor_update",
  usage: "anchor-update <concept-id> < patch.json",
  description:
    "Move a record's anchors after a reviewed refactor: replace a pointer, add one, remove one, with a reason. Anchors you do not name survive, and a replaced one keeps its old hash — changed code still reports drift until kb_anchor_resolve rebaselines it. Each selector must match exactly one anchor.",
  input: z.object({
    bundlePath,
    conceptId,
    input: anchorPatchInputSchema,
  }),
  fromArgv: async (argv, path, stdin) => ({
    bundlePath: path,
    conceptId: argv[1],
    input: JSON.parse(await stdin()) as unknown,
  }),
  run: async (
    { store, actor },
    { bundlePath: path, conceptId: id, input },
  ): Promise<KbAnchorUpdateResult> => {
    await assertBaseNotFrozen(process.cwd(), path);

    // The patch is computed inside the mutation, against the anchors the
    // record holds then — so a concurrent edit is either patched on top of or
    // caught by the store's digest check, never silently overwritten.
    let applied: KbAnchorPatchResult | undefined;
    const record = await store.updateAnchors(
      path,
      id,
      (current) => {
        applied = applyAnchorPatch(id, current, input);
        return {
          anchors: applied.anchors,
          log: {
            operation: "anchor-update",
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

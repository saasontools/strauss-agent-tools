import { z } from "zod";
import {
  composeDecisionRecord,
  decisionInputSchema,
} from "../decision-record.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { bundlePath, define } from "./model.js";

export const writeDecisionCommand = define({
  name: "write-decision",
  tool: "kb_write_decision",
  usage: "write-decision < decision.json",
  description: [
    "Write a decision. Takes `alternative` and `impact` as fields rather than free sections, because what was rejected is the part a later reader cannot reconstruct from the code — a heading is too easy to leave empty.",
    "",
    "What belongs in one:",
    '- Record a decision when a later reader would otherwise "simplify" the constraint away. If the diff already answers the question, there is nothing here to write.',
    "- `alternative` is what you turned down and why, not a list of everything considered.",
    "- A reference to material you read goes in `sources`; a reference to code goes in `anchors`; a reference to another record goes in `relatedConceptIds`.",
  ].join("\n"),
  input: z.object({ bundlePath, input: decisionInputSchema }),
  fromArgv: async (_argv, path, stdin) => ({
    bundlePath: path,
    input: JSON.parse(await stdin()) as unknown,
  }),
  run: async ({ store, actor, now }, { bundlePath: path, input }) => {
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await store.write(
      path,
      composeDecisionRecord(input, actor, now()),
      actor,
    );
    return { conceptId: record.conceptId };
  },
});

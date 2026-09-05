import { z } from "zod";
import {
  composeDecisionRecord,
  decisionInputSchema,
  DECISION_TYPE,
} from "../decision-record.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { actorClassOf, emitKb } from "../telemetry/index.js";
import { bundlePath, define } from "./model.js";

export const writeDecisionCommand = define({
  name: "write-decision",
  tool: "kb_write_decision",
  usage: "write-decision < decision.json",
  description:
    "Write a decision, with `alternative` (what was rejected and why) and `impact` as fields. Record one when a later reader would otherwise simplify the constraint away; skip when the diff already answers it. `sources` for material read, `anchors` for code, `relatedConceptIds` for records.",
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
    await emitKb("write-decision", {
      bundle: path,
      actorClass: actorClassOf(actor),
      data: {
        type: DECISION_TYPE,
        tags: input.tags ?? [],
        anchors: input.anchors?.length ?? 0,
        action: record.action,
      },
    });
    return {
      conceptId: record.conceptId,
      action: record.action,
      supersededIds: record.supersededIds,
    };
  },
});

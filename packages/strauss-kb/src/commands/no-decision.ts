import { z } from "zod";
import { composeNoDecisionRecord } from "../decision-record.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { bundlePath, define } from "./model.js";

export const noDecisionCommand = define({
  name: "no-decision",
  tool: "kb_no_decision",
  usage: "no-decision <reason...>",
  description:
    'Claim in one sentence that there was nothing to decide. Gating on "did you write a decision?" rewards writing a junk one; gating on "did you answer?" does not, so silence has to be expressible. Idempotent — restating it is not a collision.',
  input: z.object({ bundlePath, reason: z.string().min(1) }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    reason: argv.slice(1).join(" ").trim(),
  }),
  run: async ({ store, actor, now }, { bundlePath: path, reason }) => {
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await store.write(
      path,
      { ...composeNoDecisionRecord(reason, actor, now()), overwrite: true },
      actor,
    );
    return { conceptId: record.conceptId };
  },
});

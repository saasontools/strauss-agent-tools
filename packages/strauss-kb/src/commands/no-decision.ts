import { z } from "zod";
import { composeNoDecisionRecord } from "../decision-record.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import {
  ACTOR,
  actorOf,
  argvActor,
  argvWithout,
  bundlePath,
  define,
  FREE_TEXT,
} from "./model.js";

export const noDecisionCommand = define({
  name: "no-decision",
  tool: "kb_no_decision",
  usage: "no-decision [--actor K:N] <reason...>",
  description:
    "Record in one sentence that a piece of work had nothing to decide. Idempotent.",
  input: z.object({ bundlePath, reason: FREE_TEXT, actor: ACTOR }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    reason: argvWithout(argv.slice(1), "--actor").join(" ").trim(),
    ...argvActor(argv),
  }),
  run: async (ctx, input) => {
    const path = input.bundlePath;
    await assertBaseNotFrozen(process.cwd(), path);
    const actor = actorOf(ctx, input);
    const record = await ctx.store.write(
      path,
      {
        ...composeNoDecisionRecord(input.reason, actor, ctx.now()),
        overwrite: true,
      },
      actor,
    );
    return { conceptId: record.conceptId };
  },
});

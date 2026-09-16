import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import {
  ACTOR,
  actorOf,
  argvActor,
  argvWithout,
  bundlePath,
  conceptId,
  define,
  FREE_TEXT,
} from "./model.js";

export const answerCommand = define({
  name: "answer",
  tool: "kb_answer",
  usage: "answer <concept-id> [--actor K:N] <answer...>",
  description:
    "Resolve an open question: set status, stamp who and when, append an Answer section. If the answer overturns a decision or assumption, supersede that record explicitly.",
  input: z.object({
    bundlePath,
    conceptId,
    answer: FREE_TEXT,
    actor: ACTOR,
  }),
  fromArgv: (argv, path) => {
    const words = argvWithout(argv.slice(1), "--actor");
    return {
      bundlePath: path,
      conceptId: words[0],
      answer: words.slice(1).join(" ").trim(),
      ...argvActor(argv),
    };
  },
  run: async (ctx, parsed) => {
    const { bundlePath: path, conceptId: id, answer } = parsed;
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await ctx.store.answer(
      path,
      id,
      answer,
      actorOf(ctx, parsed),
    );
    return { conceptId: record.conceptId };
  },
});

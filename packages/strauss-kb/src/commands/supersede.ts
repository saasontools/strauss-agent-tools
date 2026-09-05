import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { actorClassOf, emitKb } from "../telemetry/index.js";
import {
  ACTOR,
  actorOf,
  argvActor,
  argvWithout,
  bundlePath,
  conceptId,
  define,
} from "./model.js";

export const supersedeCommand = define({
  name: "supersede",
  tool: "kb_supersede",
  usage: "supersede <concept-id> <replacement-id> [--actor K:N]",
  description:
    "Mark a record superseded by another, linked in both directions. Use instead of editing a record whose meaning changed.",
  input: z.object({
    bundlePath,
    conceptId,
    replacementId: conceptId,
    actor: ACTOR,
  }),
  fromArgv: (argv, path) => {
    const words = argvWithout(argv.slice(1), "--actor");
    return {
      bundlePath: path,
      conceptId: words[0],
      replacementId: words[1],
      ...argvActor(argv),
    };
  },
  run: async (ctx, parsed) => {
    const { bundlePath: path, conceptId: id, replacementId } = parsed;
    const actor = actorOf(ctx, parsed);
    await assertBaseNotFrozen(process.cwd(), path);
    await ctx.store.supersede(path, id, replacementId, actor);
    await emitKb("supersede", {
      bundle: path,
      actorClass: actorClassOf(actor),
      data: { conceptId: id, replacementId },
    });
    return { superseded: id, replacedBy: replacementId };
  },
});

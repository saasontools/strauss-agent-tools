import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { KB_RECORD_STATUSES } from "../kb-record.schema.js";
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

export const statusCommand = define({
  name: "status",
  tool: "kb_status",
  usage: "status <concept-id> <status> [--actor K:N]",
  description:
    "Move a record's status. Compare-and-swap: a concurrent change fails instead of being overwritten.",
  input: z.object({
    bundlePath,
    conceptId,
    status: z.enum(KB_RECORD_STATUSES),
    actor: ACTOR,
  }),
  fromArgv: (argv, path) => {
    const words = argvWithout(argv.slice(1), "--actor");
    return {
      bundlePath: path,
      conceptId: words[0],
      status: words[1],
      ...argvActor(argv),
    };
  },
  run: async (ctx, parsed) => {
    const { bundlePath: path, conceptId: id, status } = parsed;
    const actor = actorOf(ctx, parsed);
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await ctx.store.setStatus(path, id, status, actor);
    await emitKb("status", {
      bundle: path,
      actorClass: actorClassOf(actor),
      data: { conceptId: record.conceptId, status },
    });
    return { conceptId: record.conceptId, status };
  },
});

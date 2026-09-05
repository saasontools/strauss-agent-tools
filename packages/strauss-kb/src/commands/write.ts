import { z } from "zod";
import { composeInputSchema, composeRecord } from "../compose.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { KB_RECORD_TYPES, type KbRecordType } from "../kb-record.schema.js";
import { actorClassOf, emitKb } from "../telemetry/index.js";
import {
  ACTOR,
  actorOf,
  argvActor,
  argvPositional,
  bundlePath,
  define,
} from "./model.js";

export const writeCommand = define({
  name: "write",
  tool: "kb_write",
  usage: "write <type> [--actor K:N] < record.json",
  description:
    "Write one record. Search first — a duplicate concept id is rejected, not overwritten; kb_types lists each type's sections. An unsourced claim is an `assumption` with assumption: true, never a vague `fact`. Conflicting records get a `risk`, `open-question`, or superseding `decision`. Prefer a new short record over overloading one. Never delete; supersede.",
  input: z.object({
    bundlePath,
    type: z.enum(KB_RECORD_TYPES),
    input: composeInputSchema,
    actor: ACTOR,
  }),
  fromArgv: async (argv, path, stdin) => ({
    bundlePath: path,
    // The type is the first positional in either order, so `--actor` may
    // precede it.
    type: argvPositional(argv, "--actor"),
    input: JSON.parse(await stdin()) as unknown,
    ...argvActor(argv),
  }),
  run: async (ctx, parsed) => {
    const { bundlePath: path, type, input } = parsed;
    const { store, now } = ctx;
    const actor = actorOf(ctx, parsed);
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await store.write(
      path,
      composeRecord(type as KbRecordType, input, actor, now()),
      actor,
    );
    await emitKb("write", {
      bundle: path,
      actorClass: actorClassOf(actor),
      data: {
        type,
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

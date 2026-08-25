import { z } from "zod";
import { composeInputSchema, composeRecord } from "../compose.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { KB_RECORD_TYPES, type KbRecordType } from "../kb-record.schema.js";
import { bundlePath, define } from "./model.js";

export const writeCommand = define({
  name: "write",
  tool: "kb_write",
  usage: "write <type> < record.json",
  description: [
    "Write one record. Search first — the same knowledge filed twice under different slugs is how a base rots, and a duplicate concept id is rejected rather than overwritten. Call kb_types for the sections each type accepts.",
    "",
    "Judgment the tool cannot enforce for you:",
    "- An unsourced claim is an `assumption` record with assumption: true, never a `fact` with a vague source. The distinction is what lets a later reader separate what was established from what was guessed.",
    "- When two records conflict, say so in a `risk`, an `open-question`, or a superseding `decision`. Quietly picking a winner destroys the disagreement, which is usually the useful part.",
    "- Prefer a new record over overloading an existing one, and keep each short. A record nobody finishes reading is not durable memory.",
    "- Records are never deleted; supersede instead, so the earlier reasoning stays inspectable.",
  ].join("\n"),
  input: z.object({
    bundlePath,
    type: z.enum(KB_RECORD_TYPES),
    input: composeInputSchema,
  }),
  fromArgv: async (argv, path, stdin) => ({
    bundlePath: path,
    type: argv[1],
    input: JSON.parse(await stdin()) as unknown,
  }),
  run: async ({ store, actor, now }, { bundlePath: path, type, input }) => {
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await store.write(
      path,
      composeRecord(type as KbRecordType, input, actor, now()),
      actor,
    );
    return { conceptId: record.conceptId };
  },
});

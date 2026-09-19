import { z } from "zod";
import { composeInputSchema, composeRecord } from "../compose.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { KB_RECORD_TYPES, type KbRecordType } from "../kb-record.schema.js";
import { RETIRED_RECORD_TYPES } from "../record-types.js";
import { bundlePath, define } from "./model.js";

export const writeCommand = define({
  name: "write",
  tool: "kb_write",
  usage: "write <type> < record.json",
  description:
    "Write one record. Search first — a duplicate concept id is rejected, not overwritten; kb_types lists each type's sections. An unsourced claim is an `assumption` with assumption: true, never a vague `fact`. Conflicting records get a `risk`, `open-question`, or superseding `decision`. Prefer a new short record over overloading one. Never delete; supersede.",
  input: z.object({
    bundlePath,
    type: z.enum(KB_RECORD_TYPES, {
      error: (issue) => {
        const type = String(issue.input);
        return Object.hasOwn(RETIRED_RECORD_TYPES, type)
          ? RETIRED_RECORD_TYPES[type]
          : `type must be one of ${KB_RECORD_TYPES.join(", ")}`;
      },
    }),
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
    return {
      conceptId: record.conceptId,
      action: record.action,
      supersededIds: record.supersededIds,
    };
  },
});

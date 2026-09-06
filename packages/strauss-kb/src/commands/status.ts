import { z } from "zod";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { KB_RECORD_STATUSES } from "../kb-record.schema.js";
import { bundlePath, conceptId, define } from "./model.js";

export const statusCommand = define({
  name: "status",
  tool: "kb_status",
  usage: "status <concept-id> <status>",
  description:
    "Move a record's status. Compare-and-swap: a concurrent change fails instead of being overwritten.",
  input: z.object({
    bundlePath,
    conceptId,
    status: z.enum(KB_RECORD_STATUSES),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argv[1],
    status: argv[2],
  }),
  run: async (
    { store, actor },
    { bundlePath: path, conceptId: id, status },
  ) => {
    await assertBaseNotFrozen(process.cwd(), path);
    const record = await store.setStatus(path, id, status, actor);
    return { conceptId: record.conceptId, status };
  },
});

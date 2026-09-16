import { z } from "zod";
import { KbStatusReasonRequiredError } from "../kb-errors.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { KB_RECORD_STATUSES } from "../kb-record.schema.js";
import {
  argvFlag,
  argvWithout,
  bundlePath,
  conceptId,
  define,
} from "./model.js";

/** Closing one of these needs the evidence that closed it. */
const REASON_REQUIRED: readonly { type: string; status: string }[] = [
  { type: "risk", status: "resolved" },
];

export const statusCommand = define({
  name: "status",
  tool: "kb_status",
  usage: 'status <concept-id> <status> [--reason "<text>"]',
  description:
    "Move a record's status, with an optional reason stored on the log entry. Compare-and-swap: a concurrent change fails instead of being overwritten. Resolving a `risk` needs the reason.",
  input: z.object({
    bundlePath,
    conceptId,
    status: z.enum(KB_RECORD_STATUSES),
    reason: z
      .string()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        "What settled it, stored on the log entry. Required to resolve a `risk`.",
      ),
  }),
  fromArgv: (argv, path) => {
    const words = argvWithout(argv, "--reason");
    const reason = argvFlag(argv, "--reason");
    return {
      bundlePath: path,
      conceptId: words[1],
      status: words[2],
      ...(reason !== undefined ? { reason } : {}),
    };
  },
  run: async (
    { store, actor },
    { bundlePath: path, conceptId: id, status, reason },
  ) => {
    const type = id.slice(0, id.indexOf("."));
    const owed = REASON_REQUIRED.some(
      (rule) => rule.type === type && rule.status === status,
    );
    if (owed && !reason?.trim()) throw new KbStatusReasonRequiredError(id);

    await assertBaseNotFrozen(process.cwd(), path);
    const record = await store.setStatus(path, id, status, actor, reason);
    return {
      conceptId: record.conceptId,
      status,
      ...(reason ? { reason } : {}),
    };
  },
});

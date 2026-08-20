import { z } from "zod";
import { validateBundle } from "../validate.js";
import { bundlePath, define } from "./model.js";

export const validateCommand = define({
  name: "validate",
  tool: "kb_validate",
  usage: "validate",
  description:
    "Check pointers no single record can see: supersession links that disagree between the two records, and assumptions that cite sources. Per-record shape is enforced on every read, so a problem here means someone edited a file by hand.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: async ({ store }, { bundlePath: path }) =>
    validateBundle(await store.list(path)),
  failsWhen: (result) => Array.isArray(result) && result.length > 0,
});

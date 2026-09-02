import { z } from "zod";
import { validateBundle } from "../validate.js";
import { bundlePath, define } from "./model.js";

export const validateCommand = define({
  name: "validate",
  tool: "kb_validate",
  usage: "validate",
  description:
    "Cross-record checks: supersession pointers that disagree, assumptions that cite sources. Exits 1 on a finding. A finding here means a hand edit.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: async ({ store }, { bundlePath: path }) =>
    validateBundle(await store.list(path)),
  failsWhen: (result) => Array.isArray(result) && result.length > 0,
});

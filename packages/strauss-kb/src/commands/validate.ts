import { z } from "zod";
import { validateBundle, type KbValidationProblem } from "../validate.js";
import { bundlePath, define } from "./model.js";

export const validateCommand = define({
  name: "validate",
  tool: "kb_validate",
  usage: "validate",
  description:
    "Check pointers no single record can see: supersession links that disagree between the two records, typed causal links, and assumptions that cite sources. Per-record shape is enforced on every read, so a problem here means someone edited a file by hand. Each finding carries a severity — an unknown rel or malformed target is an `error`, a target absent from the bundle a `warning` — and only errors fail the check.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: async ({ store }, { bundlePath: path }) =>
    validateBundle(await store.list(path)),
  // Warnings are reported and do not fail: a base mid-write is full of links to
  // records not written yet.
  failsWhen: (result) =>
    Array.isArray(result) &&
    (result as KbValidationProblem[]).some(
      (problem) => problem.severity !== "warning",
    ),
});

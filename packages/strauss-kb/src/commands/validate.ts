import { z } from "zod";
import { validateBundle, type KbValidationProblem } from "../validate.js";
import { bundlePath, define } from "./model.js";

export const validateCommand = define({
  name: "validate",
  tool: "kb_validate",
  usage: "validate",
  description:
    "Check pointers no single record can see: supersession links that disagree between the two records, typed causal links whose rel is outside the closed vocabulary or whose target is not in the bundle, and assumptions that cite sources. Per-record shape is enforced on every read, so a problem here means someone edited a file by hand. Each finding carries a severity — an unknown rel is an `error`, because no walk can ever traverse it; a link to a record that does not exist yet is a `warning`, because writing a record before the one it points at is ordinary. Only errors fail the check.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: async ({ store }, { bundlePath: path }) =>
    validateBundle(await store.list(path)),
  // Warnings are reported and do not fail. A base mid-write is full of links to
  // records not written yet; failing on those would train callers to ignore the
  // exit code, which is the one signal a shell caller has.
  failsWhen: (result) =>
    Array.isArray(result) &&
    (result as KbValidationProblem[]).some(
      (problem) => problem.severity !== "warning",
    ),
});

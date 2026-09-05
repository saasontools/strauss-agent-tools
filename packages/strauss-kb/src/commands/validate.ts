import { z } from "zod";
import { countBy, emitKb } from "../telemetry/index.js";
import { validateBundle, type KbValidationProblem } from "../validate.js";
import { bundlePath, define } from "./model.js";

export const validateCommand = define({
  name: "validate",
  tool: "kb_validate",
  usage: "validate",
  description:
    "Check pointers no single record can see: supersession links that disagree between the two records, typed causal links, and assumptions that cite sources. Each finding carries a severity: errors fail the exit code, warnings do not.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: async ({ store }, { bundlePath: path }) => {
    const started = Date.now();
    const problems = validateBundle(await store.list(path));
    await emitKb("validate", {
      bundle: path,
      durationMs: Date.now() - started,
      data: {
        errors: countBy(
          problems.filter((problem) => problem.severity === "error"),
          (problem) => problem.check,
        ),
        findings: problems.length,
      },
    });
    return problems;
  },
  // Warnings never fail the exit code; every other severity does.
  failsWhen: (result) =>
    Array.isArray(result) &&
    (result as KbValidationProblem[]).some(
      (problem) => problem.severity !== "warning",
    ),
});

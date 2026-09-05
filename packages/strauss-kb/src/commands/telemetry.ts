import { z } from "zod";
import {
  renderSummary,
  telemetrySummary,
  type TelemetrySummary,
} from "../telemetry/index.js";
import { argvFlag, define } from "./model.js";

export const telemetryCommand = define({
  name: "telemetry",
  usage: "telemetry summary [--repo SLUG] [--since ISO]",
  description:
    "CLI-only: aggregate the local telemetry stream — validate and doctor failures by check, anchor drift, verifies by actor class, writes by type and tag. Reads `~/.strauss/telemetry`; touches no base.",
  input: z.object({
    action: z.literal("summary"),
    repo: z.string().min(1).optional(),
    since: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "since must be a date the stream can be cut at",
      })
      .optional(),
  }),
  fromArgv: (argv) => {
    const repo = argvFlag(argv, "--repo");
    const since = argvFlag(argv, "--since");
    return {
      action: argv[1],
      ...(repo !== undefined ? { repo } : {}),
      ...(since !== undefined ? { since } : {}),
    };
  },
  run: (_ctx, { repo, since }) =>
    telemetrySummary({
      ...(repo !== undefined ? { repo } : {}),
      ...(since !== undefined ? { since } : {}),
    }),
  render: (result) => renderSummary(result as TelemetrySummary),
});

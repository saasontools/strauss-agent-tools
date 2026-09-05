import { z } from "zod";
import { KbTelemetryEventError } from "../kb-errors.js";
import {
  emit,
  renderSummary,
  telemetryEventSchema,
  telemetryMode,
  telemetrySummary,
  type TelemetrySummary,
} from "../telemetry/index.js";
import { argvFlag, define } from "./model.js";

/**
 * What `emit` returns: the event it recorded, or that the sink was off and
 * there is nothing to look for.
 */
type TelemetryEmitted =
  | { emitted: true; component: string; event: string }
  | { emitted: false; mode: "off" };

export const telemetryCommand = define({
  name: "telemetry",
  usage:
    "telemetry summary [--repo SLUG] [--since ISO] | emit --component C --event E [--data JSON] [--pr N] [--sha S] [--duration-ms N] [--tokens N]",
  description:
    "CLI-only: aggregate the local telemetry stream — validate and doctor failures by check, anchor drift, verifies by actor class, writes by type and tag — or `emit` one event of your own into the same sink. Reads `~/.strauss/telemetry`; touches no base.",
  input: z.object({
    action: z.enum(["summary", "emit"]),
    repo: z.string().min(1).optional(),
    since: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "since must be a date the stream can be cut at",
      })
      .optional(),
    component: z.string().min(1).optional(),
    event: z.string().min(1).optional(),
    data: z
      .string()
      .optional()
      .describe("The event's own fields, as a JSON object. Facts, not bodies."),
    pr: z.number().int().positive().optional(),
    sha: z.string().min(1).optional(),
    durationMs: z.number().nonnegative().optional(),
    tokens: z.number().int().nonnegative().optional(),
  }),
  fromArgv: (argv) => {
    const numeric = (flag: string): number | undefined => {
      const value = argvFlag(argv, flag);
      return value === undefined ? undefined : Number(value);
    };
    return {
      action: argv[1],
      ...pick("repo", argvFlag(argv, "--repo")),
      ...pick("since", argvFlag(argv, "--since")),
      ...pick("component", argvFlag(argv, "--component")),
      ...pick("event", argvFlag(argv, "--event")),
      ...pick("data", argvFlag(argv, "--data")),
      ...pick("pr", numeric("--pr")),
      ...pick("sha", argvFlag(argv, "--sha")),
      ...pick("durationMs", numeric("--duration-ms")),
      ...pick("tokens", numeric("--tokens")),
    };
  },
  run: async (_ctx, input) => {
    if (input.action === "summary") {
      return telemetrySummary({
        ...pick("repo", input.repo),
        ...pick("since", input.since),
      });
    }
    return emitEvent(input);
  },
  render: (result) =>
    "emitted" in (result as object)
      ? ""
      : renderSummary(result as TelemetrySummary),
});

/**
 * One caller-supplied event, validated before it is sent.
 *
 * `emit` swallows a bad event with a warning, which is right for a command
 * doing its own work in the background and wrong here: a consumer that asked
 * to record something must be told it was refused, and the refusal names the
 * cap so the fix is to send an id rather than the code.
 */
async function emitEvent(input: {
  component?: string;
  event?: string;
  data?: string;
  pr?: number;
  sha?: string;
  durationMs?: number;
  tokens?: number;
}): Promise<TelemetryEmitted> {
  const { component, event } = input;
  if (!component || !event) {
    throw new KbTelemetryEventError("emit needs --component and --event");
  }

  let data: unknown = {};
  if (input.data !== undefined) {
    try {
      data = JSON.parse(input.data);
    } catch {
      throw new KbTelemetryEventError("--data is not JSON");
    }
  }

  const candidate = {
    ts: new Date().toISOString(),
    component,
    event,
    data,
    ...pick("pr", input.pr),
    ...pick("sha", input.sha),
    ...pick("durationMs", input.durationMs),
    ...pick("tokens", input.tokens),
  };
  const parsed = telemetryEventSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new KbTelemetryEventError(
      parsed.error.issues[0]?.message ?? "invalid event",
    );
  }

  const { ts: _ts, ...fields } = parsed.data;
  // `emit` drops the event when the sink is off, and a caller handed
  // `emitted: true` would go looking for a line that was never written.
  if (telemetryMode() === "off") return { emitted: false, mode: "off" };
  await emit(fields);
  return { emitted: true, component, event };
}

/** `{ key: value }` when the value is set, nothing when it is not. */
function pick<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

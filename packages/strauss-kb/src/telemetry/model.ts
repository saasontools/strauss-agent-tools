import { z } from "zod";

/** The component this package's own operations are recorded under. */
export const KB_COMPONENT = "strauss-kb";

export const TELEMETRY_ACTOR_CLASSES = [
  "human",
  "agent",
  "mcp",
  "cli",
  "unknown",
] as const;

export type TelemetryActorClass = (typeof TELEMETRY_ACTOR_CLASSES)[number];

/** What the CLI names a writer when `STRAUSS_KB_ACTOR` is unset. */
export const CLI_DEFAULT_ACTOR = "unknown";

/**
 * `data` carries ids, anchors, counts, statuses and SHAs — never code or a
 * record body. The cap makes that mechanical rather than a convention: no fact
 * of those kinds is this long, and a body always is.
 */
export const MAX_DATA_STRING = 512;

export type TelemetryJson =
  | string
  | number
  | boolean
  | null
  | TelemetryJson[]
  | { [key: string]: TelemetryJson };

const telemetryJson: z.ZodType<TelemetryJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(telemetryJson),
    z.record(z.string(), telemetryJson),
  ]),
);

/** Every string in `data`, key or value and at any depth, is within the cap. */
function carriesFacts(data: Record<string, TelemetryJson>): boolean {
  const stack: TelemetryJson[] = [data];
  while (stack.length) {
    const value = stack.pop() as TelemetryJson;
    if (typeof value === "string") {
      if (value.length > MAX_DATA_STRING) return false;
    } else if (Array.isArray(value)) {
      stack.push(...value);
    } else if (value !== null && typeof value === "object") {
      stack.push(...Object.keys(value), ...Object.values(value));
    }
  }
  return true;
}

/** The fields every component agrees on; `data` is where a component extends. */
const telemetryEventFields = z.object({
  ts: z.iso.datetime(),
  component: z.string().min(1),
  event: z.string().min(1),
  /** Repository slug, as the local sink's directory names it. */
  repo: z.string().min(1).optional(),
  pr: z.number().int().positive().optional(),
  sha: z.string().min(1).optional(),
  bundle: z.string().min(1).optional(),
  durationMs: z.number().nonnegative().optional(),
  tokens: z.number().int().nonnegative().optional(),
  actorClass: z.enum(TELEMETRY_ACTOR_CLASSES).optional(),
  /** The extension point: a component adds its own fields here, not above. */
  data: z.record(z.string(), telemetryJson).default({}),
});

// Open at the top level, so an event a later component widened still parses on
// the read side rather than vanishing from the summary.
export const telemetryEventSchema = telemetryEventFields
  .passthrough()
  .refine((event) => carriesFacts(event.data), {
    message: `data holds facts, not bodies: no string over ${MAX_DATA_STRING} characters`,
    path: ["data"],
  });

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

/** What a caller passes: `emit` stamps `ts`. */
export type TelemetryEventInput = Omit<
  z.input<typeof telemetryEventFields>,
  "ts"
>;

/**
 * The actor kind a `STRAUSS_KB_ACTOR` string names, from its `kind:` prefix.
 * Only the CLI's own unset default is `cli`; an actor whose prefix names no
 * known kind is `unknown`, so a typo never inflates a real bucket.
 */
export function actorClassOf(actor: string): TelemetryActorClass {
  if (actor === CLI_DEFAULT_ACTOR) return "cli";
  const colon = actor.indexOf(":");
  const kind = (colon === -1 ? actor : actor.slice(0, colon)).toLowerCase();
  return (TELEMETRY_ACTOR_CLASSES as readonly string[]).includes(kind)
    ? (kind as TelemetryActorClass)
    : "unknown";
}

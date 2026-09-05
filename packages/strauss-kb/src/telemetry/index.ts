/**
 * `model.ts` is the event schema, `sinks.ts` the three destinations, `emit.ts`
 * the one call a command makes, and `summary.ts` the read side.
 */
export {
  emit,
  emitKb,
  resetTelemetryWarnings,
  telemetryIdle,
  TELEMETRY_FLUSH_MS,
} from "./emit.js";
export { countBy } from "./count-by.js";
export {
  actorClassOf,
  telemetryEventSchema,
  CLI_DEFAULT_ACTOR,
  KB_COMPONENT,
  MAX_DATA_STRING,
  TELEMETRY_ACTOR_CLASSES,
  type TelemetryActorClass,
  type TelemetryEvent,
  type TelemetryEventInput,
  type TelemetryJson,
} from "./model.js";
export {
  appendLocal,
  postEvent,
  repoSlug,
  resetRepoSlugs,
  stepSummaryLine,
  telemetryMode,
  telemetryRoot,
  EVENTS_FILE,
  MAX_ROTATIONS,
  ROTATE_AT_BYTES,
  TELEMETRY_MODES,
  type TelemetryMode,
} from "./sinks.js";
export {
  readEvents,
  renderSummary,
  summarise,
  telemetrySummary,
  PENDING_METRICS,
  type ReadEvents,
  type SummaryOptions,
  type TelemetrySummary,
} from "./summary.js";

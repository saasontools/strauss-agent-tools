export {
  DEFAULT_LOAD_BUDGET,
  KB_DIR,
  KbStore,
  type KbLoadResult,
  type KbLogger,
  type KbSupersededStub,
  type KbWriteInput,
} from "./kb-store.js";
export {
  catalog,
  renderCatalogLine,
  type KbCatalogEntry,
  type KbCatalogResult,
} from "./catalog.js";
export {
  KbInvalidConceptIdError,
  KbMissingFlagValueError,
  KbPackBudgetExceededError,
  KbRecordAlreadyExistsError,
  KbRecordNotFoundError,
  KbSelfVerificationError,
  KbUnknownLinkRelError,
  KbWriteConflictError,
} from "./kb-errors.js";
export {
  kbAnchorSchema,
  kbAnchorSpanSchema,
  kbAnchorWriteSchema,
  kbActorStampSchema,
  kbConceptIdSchema,
  kbLinkSchema,
  kbRecordFrontmatterSchema,
  kbSourceSchema,
  kbVerifiedEventSchema,
  KB_CONCEPT_ID_PATTERN,
  KB_CONFIDENCES,
  KB_MATERIALITIES,
  KB_RECORD_STATUSES,
  KB_RECORD_TYPES,
  KB_SLUG_PATTERN,
  type KbActorStamp,
  type KbAnchor,
  type KbAnchorSpan,
  type KbLink,
  type KbRecord,
  type KbRecordFrontmatter,
  type KbRecordStatus,
  type KbRecordType,
  type KbSource,
  type KbVerifiedEvent,
} from "./kb-record.schema.js";
export {
  anchorFilePath,
  defaultAnchorResolvers,
  detectAnchorDrift,
  hashAnchorText,
  isCanonicalRepoUrl,
  prepareResolvers,
  regexResolver,
  resolveAnchor,
  resolveAnchorSpan,
  type AnchorResolution,
  type AnchorResolver,
  type AnchorResolverName,
  type KbAnchorDriftEntry,
  type RemoteAnchorState,
  type ResolvedSymbol,
  type ResolverAttempt,
} from "./anchor-resolver/index.js";
export {
  readRemoteAnchors,
  repoCacheDir,
  type RemoteOptions,
  type RemoteRead,
} from "./remote-repo/index.js";
export {
  TreeSitterResolver,
  languageForFile,
  treeSitterLanguages,
} from "./tree-sitter-resolver/index.js";
export {
  ensureGrammar,
  grammarHints,
  grammarManifest,
  grammarsCacheRoot,
  type Grammar,
  type GrammarManifest,
  type GrammarOptions,
} from "./grammars/index.js";
export {
  RECORD_TYPES,
  LINK_RELS,
  KB_CAUSAL_LINK_RELS,
  KB_LINK_RELS,
  isKbLinkRel,
  isKbRecordType,
  type KbLinkRel,
  type KbLinkRelSpec,
  type KbRecordTypeSpec,
} from "./record-types.js";
export {
  composeRecord,
  composeInputSchema,
  composeLinkSchema,
  type ComposeInput,
  type ComposeLink,
  type ComposedRecord,
} from "./compose.js";
export {
  INDEX_FILE,
  renderIndex,
  renderIndexLine,
  indexIsStale,
} from "./kb-index.js";
export {
  assertBaseNotFrozen,
  contextProfileBudgets,
  KbBaseFrozenError,
  KbPinsMalformedError,
  mergedContextBudgets,
  PIN_LAYERS,
  PINS_FILE,
  PINS_LOCAL_FILE,
  listPins,
  pinBase,
  readMergedPins,
  readPinsLayer,
  resolvePinPath,
  unpinBase,
  type KbContextBudgets,
  type KbMergedPin,
  type KbMergedPins,
  type KbPin,
  type KbPinLayer,
  type KbPinOptions,
  type KbPinResult,
  type KbPinStatus,
  type KbPinsManifest,
} from "./kb-pins/index.js";
export {
  CONTEXT_BEGIN,
  CONTEXT_END,
  CONTEXT_PROFILES,
  buildContext,
  syncInstructions,
  toHookJson,
  type KbContextOptions,
  type KbContextResult,
  type KbSyncResult,
} from "./kb-context.js";
export {
  LOG_FILE,
  parseLog,
  renderLogEntry,
  kbLogEntrySchema,
  type KbLogEntry,
  type KbLogReadResult,
} from "./kb-log.js";
export { matchesTags, type KbTagFilter } from "./kb-tags.js";
export { kbJsonSchemas } from "./json-schema.js";
export {
  anchorOnHunk,
  matchToDiff,
  symbolRangeIndex,
  type DiffFile,
  type DiffHunk,
  type DiffMatch,
  type MatchOptions,
  type SymbolRange,
  type SymbolRangeIndex,
} from "./match-diff.js";
export type { KbMatch, KbMatchRecord } from "./commands/match/index.js";
export {
  adjudicate,
  resolveHeads,
  type KbAdjudicated,
  type KbStanding,
  type KbWarning,
} from "./adjudicate.js";
export {
  trace,
  TRACE_EDGES,
  type KbTraceEdge,
  type KbTraceOptions,
  type KbTraceStep,
} from "./trace.js";
export {
  edgeNeighbours,
  neighbours,
  DEFAULT_TYPED_LINK_RELS,
  KB_EDGE_KINDS,
  type KbEdgeKind,
  type KbNeighbour,
} from "./kb-edges.js";
export {
  pack,
  DEFAULT_PACK_HOPS,
  DEFAULT_PACK_MAX_NODES,
  type KbPackOptions,
  type KbPackResult,
  type KbPackedRecord,
} from "./pack.js";
export {
  backlinks,
  impact,
  inboundIndex,
  type KbBacklink,
  type KbBacklinksResult,
  type KbImpactOptions,
  type KbImpactResult,
  type KbImpactedRecord,
  type KbInboundEdge,
  type KbLinkEdge,
} from "./kb-links/index.js";
export {
  validateBundle,
  type KbValidationProblem,
  type KbValidationSeverity,
} from "./validate.js";
export {
  doctor,
  DEFAULT_AGING_DAYS,
  DEFAULT_EXPIRING_DAYS,
  DEFAULT_UNVERIFIED_DAYS,
  KB_DOCTOR_CHECKS,
  type KbDoctorCheck,
  type KbDoctorFinding,
  type KbDoctorGroup,
  type KbDoctorOptions,
  type KbDoctorReport,
  type KbDoctorThresholds,
} from "./doctor.js";
export {
  composeDecisionRecord,
  composeNoDecisionRecord,
  isNoDecisionRecord,
  selectDecisions,
  decisionInputSchema,
  DECISION_TYPE,
  NO_DECISION_SLUG,
  type DecisionInput,
} from "./decision-record.js";
export {
  KB_COMMANDS,
  KB_COMMANDS_BY_NAME,
  type KbCommand,
  type KbCommandContext,
} from "./commands/index.js";
export {
  classifyDrift,
  reassessPacket,
  unifiedDiff,
  type ClassifiedAnchor,
  type KbReassessAnchor,
  type KbReassessDefault,
  type KbReassessDiff,
  type KbReassessPacket,
} from "./drift/index.js";
export {
  actorClassOf,
  emit,
  emitKb,
  renderSummary,
  telemetryEventSchema,
  telemetryRoot,
  telemetrySummary,
  KB_COMPONENT,
  MAX_DATA_STRING,
  PENDING_METRICS,
  ROTATE_AT_BYTES,
  TELEMETRY_ACTOR_CLASSES,
  TELEMETRY_MODES,
  type TelemetryActorClass,
  type TelemetryEvent,
  type TelemetryEventInput,
  type TelemetryJson,
  type TelemetryMode,
  type TelemetrySummary,
} from "./telemetry/index.js";
export { createKbMcpServer, runKbMcpServer } from "./mcp.js";
export { runKbCli } from "./cli.js";
export {
  loadQmd,
  resolveHits,
  searchBase,
  SEARCH_INDEX_FILE,
  type KbSearchLogger,
  type QmdModule,
  type SearchHit,
  type SearchOptions,
} from "./search-index.js";
export {
  parseMarkdownWithFrontmatter,
  splitMarkdownFrontmatter,
  stringifyMarkdownWithFrontmatter,
} from "./markdown.js";
export {
  BaseError,
  ErrorTypes,
  Fault,
  type ErrorDetails,
  type ErrorProps,
} from "./errors.js";

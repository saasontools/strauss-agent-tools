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
  KbInvalidConceptIdError,
  KbPackBudgetExceededError,
  KbRecordAlreadyExistsError,
  KbRecordNotFoundError,
  KbSelfVerificationError,
  KbWriteConflictError,
} from "./kb-errors.js";
export {
  kbAnchorSchema,
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
  type KbLink,
  type KbRecord,
  type KbRecordFrontmatter,
  type KbRecordStatus,
  type KbRecordType,
  type KbSource,
  type KbVerifiedEvent,
} from "./kb-record.schema.js";
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
export { kbJsonSchemas } from "./json-schema.js";
export {
  matchToDiff,
  type DiffFile,
  type DiffHunk,
  type DiffMatch,
  type MatchOptions,
  type SymbolRange,
} from "./match-diff.js";
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
} from "./kb-links/index.js";
export {
  validateBundle,
  type KbValidationProblem,
  type KbValidationSeverity,
} from "./validate.js";
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

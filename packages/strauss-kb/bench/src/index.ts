export {
  meanStability,
  questionScores,
  unstableQuestions,
  type QuestionScore,
} from "./aggregate.js";
export { ARMS, ARM_IDS, CAREFUL_INSTRUCTION, applyArm } from "./arms.js";
export type { ArmBundle, ArmRecord, ArmSpec } from "./arms.js";
export { DEFAULT_BUNDLE_DIR, loadBundle } from "./bundle.js";
export {
  NARRATION_PATTERNS,
  SUPERSESSION_CHAINS,
  type SupersessionPair,
} from "./chains.js";
export { CliUsageError, estimate, main, parseArgs } from "./cli.js";
export type { CliOptions, Projection } from "./cli.js";
export {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  DEFAULT_MODEL_IDS,
  MODELS,
  findModel,
  projectCost,
  usageCost,
  type BenchModel,
  type CellEstimate,
  type CostProjection,
} from "./models.js";
export {
  ANSWER_INSTRUCTIONS,
  ANSWER_TOOL_NAME,
  ANSWER_TOOL_SCHEMA,
  SYSTEM_PROMPT,
  buildPrompt,
  parseAnswer,
  renderBundle,
  renderRecord,
  type BenchPrompt,
} from "./prompt.js";
export { renderJson, renderReport } from "./report.js";
export { parseCount, scoreAnswer } from "./rubric.js";
export {
  pairedDifferences,
  runBench,
  summarize,
  type RunOptions,
} from "./runner.js";
export {
  DEFAULT_SEED,
  bootstrapCi,
  bootstrapPairedDiff,
  deriveSeed,
  mulberry32,
  type BootstrapOptions,
} from "./stats.js";
export { CORE_TASKS, TASKS, sampleTasks } from "./tasks.js";
export {
  EMPTY_USAGE,
  anthropicTransport,
  isRetryable,
  mockTransport,
  retryAfterMs,
  withRetry,
  type BenchRequest,
  type BenchResponse,
  type MockTransport,
  type RetryOptions,
  type Transport,
} from "./transport.js";
export {
  CALL_TIMEOUT_MS,
  ClaudePreflightError,
  DEFAULT_CLAUDE_CONCURRENCY,
  MAX_BUDGET_USD,
  NO_THINKING_ENV,
  claudeArgs,
  claudeCodeTransport,
  limitConcurrency,
  preflightClaude,
  readResult,
  type ClaudeTransportOptions,
  type ExecFile,
} from "./transport-claude.js";
export type {
  ArmDifference,
  ArmId,
  ArmSummary,
  BenchCell,
  BenchRecord,
  BenchRun,
  BenchTask,
  CellUsage,
  ConfidenceInterval,
  ModelAnswer,
  Rubric,
  ScoredAnswer,
  TaskFamily,
  TaskType,
  TransportId,
} from "./model.js";

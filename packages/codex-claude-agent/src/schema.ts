import { z } from "zod";

import { ErrorCodeSchema, WarningCodeSchema } from "./errors.js";

export const JsonSchemaSchema = z.record(z.string(), z.unknown());
export type JsonSchema = z.infer<typeof JsonSchemaSchema>;

export const AgentDefinitionSchema = z
  .object({
    description: z.string().min(1),
    prompt: z.string().min(1),
    tools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    model: z.string().optional(),
    skills: z.array(z.string()).optional(),
    initialPrompt: z.string().optional(),
    maxTurns: z.number().int().positive().optional(),
    background: z.boolean().optional(),
    effort: z
      .union([
        z.enum(["low", "medium", "high", "xhigh", "max"]),
        z.number().int(),
      ])
      .optional(),
    permissionMode: z
      .enum([
        "default",
        "acceptEdits",
        "bypassPermissions",
        "plan",
        "dontAsk",
        "auto",
      ])
      .optional(),
  })
  .strict();
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const WorktreeRequestSchema = z
  .object({
    mode: z.enum(["none", "existing", "create", "ephemeral"]).default("none"),
    path: z.string().min(1).optional(),
    ref: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    cleanup: z.boolean().optional(),
  })
  .strict();

const RetrySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10).optional(),
    baseDelayMs: z.number().int().min(0).max(30_000).optional(),
  })
  .strict();

export const RunRequestSchema = z
  .object({
    prompt: z.string().min(1, "prompt must not be empty"),
    cwd: z.string().min(1).optional(),
    worktree: WorktreeRequestSchema.optional(),
    additionalDirectories: z.array(z.string().min(1)).optional(),
    mode: z.enum(["read-only", "edit"]).default("read-only"),
    allowedTools: z.array(z.string().min(1)).optional(),
    model: z.string().min(1).optional(),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
    maxTurns: z.number().int().positive().max(10_000).default(40),
    maxBudgetUsd: z.number().positive().max(10_000).default(5),
    timeoutMs: z.number().int().positive().max(86_400_000).default(900_000),
    settingSources: z.array(z.enum(["user", "project", "local"])).default([]),
    loadClaudeMd: z.boolean().default(true),
    agents: z.record(z.string(), AgentDefinitionSchema).optional(),
    agentsFile: z.string().min(1).optional(),
    outputSchema: JsonSchemaSchema.optional(),
    resume: z.string().min(1).optional(),
    fork: z.boolean().default(false),
    background: z.boolean().default(false),
    tags: z.record(z.string(), z.string()).optional(),
    retry: RetrySchema.optional(),
    noGit: z.boolean().default(false),
    allowDetached: z.boolean().default(false),
    shareRoot: z.boolean().default(false),
    dangerouslyAllowAll: z.boolean().default(false),
  })
  .strict()
  .transform((request) => ({
    ...request,
    model: normalizeModel(request.model),
    worktree: request.worktree ?? { mode: "none" as const },
  }));

export type RunRequest = z.output<typeof RunRequestSchema>;
export type RunRequestInput = z.input<typeof RunRequestSchema>;

export function normalizeModel(model: string | undefined): string | undefined {
  if (model === undefined) return undefined;
  const trimmed = model.trim();
  const normalized = trimmed.toLowerCase();
  return ["fable", "opus", "sonnet", "haiku"].includes(normalized)
    ? normalized
    : trimmed;
}

export const WarningSchema = z.object({
  code: WarningCodeSchema,
  message: z.string(),
  hint: z.string().optional(),
});

export const RunResultSchema = z.object({
  ok: z.boolean(),
  jobId: z.string(),
  sessionId: z.string().optional(),
  cwd: z.string(),
  worktree: z
    .object({
      path: z.string(),
      branch: z.string().optional(),
      created: z.boolean(),
      removed: z.boolean(),
    })
    .optional(),
  result: z.string().optional(),
  structured: z.unknown().optional(),
  usage: z.object({
    turns: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().optional(),
    durationMs: z.number().nonnegative(),
    model: z.string().optional(),
  }),
  warnings: z.array(WarningSchema),
  error: z
    .object({
      code: ErrorCodeSchema,
      message: z.string(),
      hint: z.string(),
      retryable: z.boolean(),
      attempts: z.number().int().positive(),
      cause: z.string().optional(),
    })
    .optional(),
  artifacts: z
    .object({
      resultPath: z.string(),
      logPath: z.string(),
    })
    .optional(),
});
export type RunResult = z.infer<typeof RunResultSchema>;
export type Warning = z.infer<typeof WarningSchema>;

export const JobWorktreeSchema = z.object({
  path: z.string(),
  branch: z.string().optional(),
  created: z.boolean(),
  removed: z.boolean(),
});
export type JobWorktree = z.infer<typeof JobWorktreeSchema>;

export const JobRecordSchema = z.object({
  version: z.literal(1),
  jobId: z.string(),
  state: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  request: RunRequestSchema,
  repoRoot: z.string(),
  ownerSessionId: z.string().optional(),
  unread: z.boolean(),
  pid: z.number().int().positive().optional(),
  processIdentity: z.string().optional(),
  detachedProcessGroup: z.boolean().optional(),
  dedicatedProcess: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  notifiedAt: z.string().optional(),
  worktree: JobWorktreeSchema.optional(),
  result: RunResultSchema.optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;

export const DiagnosticsSchema = z.object({
  ok: z.boolean(),
  cached: z.boolean(),
  sdkVersion: z.string().optional(),
  claudeAuth: z.enum(["api-key", "login", "missing"]),
  gitVersion: z.string().optional(),
  freeDiskBytes: z.number().nonnegative().optional(),
  checks: z.array(
    z.object({
      name: z.string(),
      ok: z.boolean(),
      detail: z.string(),
      fix: z.string().optional(),
    }),
  ),
});
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;

export const StreamEventSchema = z.object({
  type: z.enum([
    "init",
    "tool_use",
    "tool_result",
    "text_delta",
    "retry",
    "warning",
    "result",
  ]),
  ts: z.string(),
  jobId: z.string(),
  seq: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type StreamEvent = z.infer<typeof StreamEventSchema>;

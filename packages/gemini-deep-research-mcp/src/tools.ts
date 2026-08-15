import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { AGENTS, COST_HINT, getDefaultDepth } from "./config.js";
import {
  latestThought,
  reportText,
  urlCitations,
  usageSummary,
} from "./extract.js";
import {
  GeminiError,
  cancelInteraction,
  replyResearch,
  startResearch,
} from "./gemini.js";
import { elapsed, refreshJob, type OnJobTerminal } from "./jobs.js";
import {
  listJobs,
  newJobId,
  readJob,
  readReport,
  saveJob,
  updateJob,
  type JobRecord,
} from "./jobstore.js";
import { log, redact } from "./logger.js";
import { isTerminal, mayHaveReport } from "./types.js";

export const PREVIEW_CHARS = 4_000;
const MAX_CITATIONS_SHOWN = 20;

function pollIntervalMs(): number {
  const raw = Number(process.env.GEMINI_DEEP_RESEARCH_POLL_MS);
  return Number.isFinite(raw) && raw >= 100 ? raw : 5_000;
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** User-facing failure: something the calling model can act on. Thrown
 * exceptions are reserved for genuine protocol bugs — a transport-level fault
 * is a much worse client experience than a structured error. */
function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function guarded<A extends unknown[]>(
  handler: (...args: A) => Promise<ToolResult>,
): (...args: A) => Promise<ToolResult> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof GeminiError) {
        return fail(err.message);
      }
      const message = err instanceof Error ? err.message : String(err);
      log.error("Tool handler failure", { error: message });
      return fail(`Unexpected failure: ${redact(message)}`);
    }
  };
}

function jobNotFound(jobId: string): ToolResult {
  return fail(
    `No job "${jobId}" found in local storage. Use deep_research_list to see known jobs.`,
  );
}

function jobLine(job: JobRecord): string {
  return JSON.stringify({
    job_id: job.jobId,
    status: job.status,
    depth: job.depth,
    created_at: job.createdAt,
    query: job.query.length > 120 ? `${job.query.slice(0, 120)}…` : job.query,
    report_ready: Boolean(job.reportPath),
  });
}

function statusPayload(
  job: JobRecord,
  thought?: string,
  plan?: string,
): string {
  const lines = [
    `job_id: ${job.jobId}`,
    `status: ${job.status}`,
    `elapsed: ${elapsed(job)}`,
    `report_ready: ${Boolean(job.reportPath)}`,
  ];
  if (job.error) lines.push(`error: ${job.error}`);
  if (thought) lines.push(`latest_progress: ${thought}`);
  if (job.status === "requires_action") {
    lines.push(
      "action_required: the agent proposed a research plan and is waiting. " +
        "Review the plan below and call deep_research_reply (which proceeds " +
        "to full research by default).",
    );
    if (plan) lines.push(`plan:\n${plan}`);
  }
  if (!isTerminal(job.status) && !job.reportPath) {
    lines.push(
      "note: deep research typically takes 5-20 minutes (60 max). Poll " +
        "deep_research_status; fetch with deep_research_fetch when ready.",
    );
  }
  return lines.join("\n");
}

async function fetchPayload(
  job: JobRecord,
  options: { inline: boolean; saveTo?: string },
): Promise<ToolResult> {
  if (!mayHaveReport(job.status)) {
    if (job.status === "failed") {
      return fail(
        `Job ${job.jobId} failed${job.error ? `: ${job.error}` : "."} No report was produced.`,
      );
    }
    if (job.status === "cancelled") {
      return fail(`Job ${job.jobId} was cancelled; no report was produced.`);
    }
    return fail(
      `Job ${job.jobId} is still ${job.status} (${elapsed(job)} elapsed) — no report yet. ` +
        `Poll deep_research_status until it completes.`,
    );
  }

  const report = readReport(job.jobId);
  if (!report) {
    return fail(
      `Job ${job.jobId} finished as ${job.status} but produced no report text.`,
    );
  }

  // Refresh for citations/usage costs one cheap GET; tolerate failure and
  // degrade to the persisted report alone.
  let citations: ReturnType<typeof urlCitations> = [];
  let usage: string | undefined;
  try {
    const refreshed = await refreshJob(job.jobId);
    if (refreshed?.interaction) {
      citations = urlCitations(refreshed.interaction);
      usage = usageSummary(refreshed.interaction);
    }
  } catch (err) {
    log.warn("Could not refresh interaction for fetch metadata", {
      error: String(err),
    });
  }

  const lines: string[] = [
    `job_id: ${job.jobId}`,
    `status: ${job.status}`,
    `report_path: ${job.reportPath}`,
    `report_chars: ${report.length}`,
  ];
  if (job.status === "incomplete" || job.status === "budget_exceeded") {
    lines.push(
      `warning: run ended ${job.status} — this report is PARTIAL output.`,
    );
  }
  if (usage) lines.push(`usage: ${usage}`);
  if (citations.length) {
    const shown = citations.slice(0, MAX_CITATIONS_SHOWN);
    lines.push(
      `sources (${citations.length}):`,
      ...shown.map((c) => `- ${c.title ? `${c.title} — ` : ""}${c.url}`),
    );
    if (citations.length > shown.length) {
      lines.push(`  …and ${citations.length - shown.length} more`);
    }
  }

  if (options.saveTo) {
    let target = options.saveTo.replace(/^~(?=$|\/)/, homedir());
    target = isAbsolute(target) ? target : resolve(target);
    writeFileSync(target, report, { mode: 0o600 });
    lines.push(`saved_to: ${target}`);
  }

  if (options.inline) {
    lines.push("", "--- full report ---", report);
  } else {
    const preview =
      report.length > PREVIEW_CHARS
        ? `${report.slice(0, PREVIEW_CHARS)}\n…[truncated — ${report.length} chars total; ` +
          `read the file at report_path or pass inline: true for the full text]`
        : report;
    lines.push("", "--- preview ---", preview);
  }
  return ok(lines.join("\n"));
}

const depthSchema = z
  .enum(["standard", "max"])
  .optional()
  .describe(
    `Research depth. "standard" = ${AGENTS.standard} (${COST_HINT.standard}); ` +
      `"max" = ${AGENTS.max} (${COST_HINT.max}). Default from ` +
      `GEMINI_DEEP_RESEARCH_AGENT, else "standard".`,
  );

export function registerTools(
  server: McpServer,
  onTerminal?: OnJobTerminal,
): void {
  server.registerTool(
    "deep_research_start",
    {
      title: "Start deep research",
      description:
        "Start an asynchronous Gemini Deep Research run and return a job handle " +
        "immediately. COSTS REAL MONEY per run (standard " +
        `${COST_HINT.standard}, max ${COST_HINT.max}) and takes 5-20 minutes ` +
        "(60 max) — do not fan out runs casually, and reuse existing jobs " +
        "(deep_research_list) before starting near-duplicate queries. Poll with " +
        "deep_research_status; fetch the report with deep_research_fetch.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("The research question or task, in natural language."),
        depth: depthSchema,
        thinking_summaries: z
          .boolean()
          .optional()
          .describe(
            "Include progress summaries readable via deep_research_status (default true).",
          ),
        visualization: z
          .boolean()
          .optional()
          .describe(
            "Allow charts/visualizations in the report (default false).",
          ),
        collaborative_planning: z
          .boolean()
          .optional()
          .describe(
            "If true, the agent first proposes a research plan and waits " +
              "(status requires_action) for deep_research_reply before " +
              "researching. Default false: research starts immediately.",
          ),
        previous_interaction_id: z
          .string()
          .optional()
          .describe(
            "Continue from an earlier interaction (multi-turn research).",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guarded(
      async (args: {
        query: string;
        depth?: "standard" | "max";
        thinking_summaries?: boolean;
        visualization?: boolean;
        collaborative_planning?: boolean;
        previous_interaction_id?: string;
      }) => {
        const depth = args.depth ?? getDefaultDepth();
        const interaction = await startResearch({
          query: args.query,
          depth,
          thinkingSummaries: args.thinking_summaries,
          visualization: args.visualization,
          collaborativePlanning: args.collaborative_planning,
          previousInteractionId: args.previous_interaction_id,
        });
        const now = new Date().toISOString();
        const job: JobRecord = {
          schemaVersion: 1,
          jobId: newJobId(),
          interactionId: interaction.id,
          query: args.query,
          depth,
          agent: AGENTS[depth],
          status: interaction.status || "queued",
          createdAt: now,
          updatedAt: now,
        };
        saveJob(job);
        return ok(
          JSON.stringify(
            {
              job_id: job.jobId,
              interaction_id: job.interactionId,
              status: job.status,
            },
            null,
            2,
          ),
        );
      },
    ),
  );

  server.registerTool(
    "deep_research_status",
    {
      title: "Check research status",
      description:
        "Check a research job: status, elapsed time, latest progress summary, " +
        "and whether the report is ready. Cheap and idempotent — poll freely " +
        "(every 30-60s is plenty; runs take minutes, not seconds).",
      inputSchema: {
        job_id: z.string().describe("Job id from deep_research_start."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    guarded(async (args: { job_id: string }) => {
      const result = await refreshJob(args.job_id, onTerminal);
      if (!result) return jobNotFound(args.job_id);
      const thought = result.interaction
        ? latestThought(result.interaction)
        : undefined;
      const plan =
        result.job.status === "requires_action" && result.interaction
          ? reportText(result.interaction)
          : undefined;
      return ok(statusPayload(result.job, thought, plan));
    }),
  );

  server.registerTool(
    "deep_research_reply",
    {
      title: "Reply to a research plan",
      description:
        "Respond to a job waiting in requires_action (collaborative planning). " +
        "By default this approves/adjusts the plan AND starts the full " +
        "research: it explicitly ends the planning phase (per the API, the " +
        "follow-up must set collaborative_planning to false — a bare " +
        '"go ahead" without it hangs the run in planning forever). Pass ' +
        "keep_planning: true only to iterate on the plan for another turn.",
      inputSchema: {
        job_id: z.string().describe("Job id currently in requires_action."),
        message: z
          .string()
          .min(1)
          .describe(
            'Your response to the plan, e.g. "Approved, proceed" or requested changes.',
          ),
        keep_planning: z
          .boolean()
          .optional()
          .describe(
            "Stay in planning for another turn instead of starting research (default false).",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    guarded(
      async (args: {
        job_id: string;
        message: string;
        keep_planning?: boolean;
      }) => {
        const result = await refreshJob(args.job_id, onTerminal);
        if (!result) return jobNotFound(args.job_id);
        if (result.job.status !== "requires_action") {
          return fail(
            `Job ${args.job_id} is ${result.job.status}, not requires_action — nothing to reply to.`,
          );
        }
        const interaction = await replyResearch({
          previousInteractionId: result.job.interactionId,
          message: args.message,
          depth: result.job.depth,
          keepPlanning: args.keep_planning,
        });
        const updated = updateJob(args.job_id, {
          interactionId: interaction.id,
          status: interaction.status || "in_progress",
        });
        return ok(
          JSON.stringify(
            {
              job_id: args.job_id,
              interaction_id: interaction.id,
              status: updated?.status ?? interaction.status,
              planning_continues: args.keep_planning === true,
            },
            null,
            2,
          ),
        );
      },
    ),
  );

  server.registerTool(
    "deep_research_fetch",
    {
      title: "Fetch research report",
      description:
        "Fetch a finished report. Returns the report file path plus a " +
        `~${PREVIEW_CHARS}-char preview, citations, and token usage — reports ` +
        "run 10k-40k tokens, so the full text is returned only with " +
        "inline: true (prefer reading the file at report_path instead). Also " +
        "works for incomplete/budget_exceeded runs that produced partial " +
        "output. Optionally saves a copy with save_to.",
      inputSchema: {
        job_id: z.string().describe("Job id from deep_research_start."),
        inline: z
          .boolean()
          .optional()
          .describe(
            "Return the FULL report text inline (10k-40k tokens — wrecks small contexts). Default false.",
          ),
        save_to: z
          .string()
          .optional()
          .describe("Also save the report to this file path (~ expands)."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    guarded(
      async (args: { job_id: string; inline?: boolean; save_to?: string }) => {
        const result = await refreshJob(args.job_id, onTerminal);
        if (!result) return jobNotFound(args.job_id);
        return fetchPayload(result.job, {
          inline: args.inline === true,
          saveTo: args.save_to,
        });
      },
    ),
  );

  server.registerTool(
    "deep_research_list",
    {
      title: "List research jobs",
      description:
        "List known research jobs, newest first, from local storage (no " +
        "network; statuses may be stale — deep_research_status refreshes one). " +
        "Check here before starting a new run on a similar query.",
      inputSchema: {
        status: z
          .enum([
            "queued",
            "in_progress",
            "requires_action",
            "completed",
            "failed",
            "cancelled",
            "incomplete",
            "budget_exceeded",
          ])
          .optional()
          .describe("Only jobs with this status."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max jobs to return (default 20)."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    guarded(async (args: { status?: string; limit?: number }) => {
      const jobs = listJobs()
        .filter((job) => !args.status || job.status === args.status)
        .slice(0, args.limit ?? 20);
      if (!jobs.length) {
        return ok(
          args.status
            ? `No jobs with status ${args.status}.`
            : "No research jobs yet. Start one with deep_research_start.",
        );
      }
      return ok(jobs.map(jobLine).join("\n"));
    }),
  );

  server.registerTool(
    "deep_research_cancel",
    {
      title: "Cancel research job",
      description:
        "Cancel an in-flight research job. Work already performed is still " +
        "billed — cancelling does not refund the run. No-op guidance is " +
        "returned for jobs that already finished.",
      inputSchema: {
        job_id: z.string().describe("Job id to cancel."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guarded(async (args: { job_id: string }) => {
      const job = readJob(args.job_id);
      if (!job) return jobNotFound(args.job_id);
      if (isTerminal(job.status)) {
        return fail(
          `Job ${args.job_id} is already ${job.status}; nothing to cancel.`,
        );
      }
      const interaction = await cancelInteraction(job.interactionId);
      const updated = updateJob(args.job_id, {
        status: interaction.status || "cancelled",
      });
      if (updated && isTerminal(updated.status)) onTerminal?.(updated);
      return ok(
        `Job ${args.job_id} is now ${updated?.status ?? "cancelled"}. ` +
          "Note: work already performed before cancellation is still billed.",
      );
    }),
  );

  server.registerTool(
    "deep_research",
    {
      title: "Run deep research (blocking)",
      description:
        "Convenience wrapper: start a research run and wait for it, polling " +
        "in-process. COSTS REAL MONEY (standard " +
        `${COST_HINT.standard}, max ${COST_HINT.max}). Runs take 5-20+ ` +
        "minutes but many clients cap tool calls at ~60s, so this waits at " +
        "most wait_seconds and then RETURNS THE JOB ID with current status " +
        "(never an error) — continue with deep_research_status / " +
        "deep_research_fetch. Prefer deep_research_start + polling unless you " +
        "know your client tolerates long calls.",
      inputSchema: {
        query: z.string().min(1).describe("The research question or task."),
        depth: depthSchema,
        wait_seconds: z
          .number()
          .int()
          .min(5)
          .max(3_000)
          .optional()
          .describe(
            "Max seconds to wait before degrading to a job handle (default 50 — " +
              "just under common 60s client tool timeouts).",
          ),
        visualization: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guarded(
      async (
        args: {
          query: string;
          depth?: "standard" | "max";
          wait_seconds?: number;
          visualization?: boolean;
        },
        extra: {
          signal?: AbortSignal;
          _meta?: { progressToken?: string | number };
          sendNotification?: (notification: {
            method: "notifications/progress";
            params: {
              progressToken: string | number;
              progress: number;
              message?: string;
            };
          }) => Promise<void>;
        },
      ) => {
        const depth = args.depth ?? getDefaultDepth();
        const interaction = await startResearch({
          query: args.query,
          depth,
          visualization: args.visualization,
          thinkingSummaries: true,
          collaborativePlanning: false,
        });
        const now = new Date().toISOString();
        const job: JobRecord = {
          schemaVersion: 1,
          jobId: newJobId(),
          interactionId: interaction.id,
          query: args.query,
          depth,
          agent: AGENTS[depth],
          status: interaction.status || "queued",
          createdAt: now,
          updatedAt: now,
        };
        saveJob(job);

        const deadline = Date.now() + (args.wait_seconds ?? 50) * 1_000;
        const progressToken = extra._meta?.progressToken;
        let tick = 0;

        while (Date.now() < deadline && !extra.signal?.aborted) {
          await new Promise((r) => setTimeout(r, pollIntervalMs()));
          const result = await refreshJob(job.jobId, onTerminal);
          if (!result) break;
          tick += 1;

          // Progress notifications only when the client asked for them.
          if (progressToken !== undefined && extra.sendNotification) {
            const thought = result.interaction
              ? latestThought(result.interaction)
              : undefined;
            await extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: tick,
                message: `${result.job.status} (${elapsed(result.job)})${thought ? `: ${thought}` : ""}`,
              },
            });
          }

          if (result.job.status === "requires_action") {
            const plan = result.interaction
              ? reportText(result.interaction)
              : undefined;
            return ok(statusPayload(result.job, undefined, plan));
          }
          if (isTerminal(result.job.status)) {
            return fetchPayload(result.job, { inline: false });
          }
        }

        const current = readJob(job.jobId) ?? job;
        const reason = extra.signal?.aborted
          ? "cancelled by the client"
          : "hit its wait ceiling";
        return ok(
          `Wait ${reason} after ${elapsed(current)}; the research continues on ` +
            `Google's servers.\njob_id: ${current.jobId}\nstatus: ${current.status}\n` +
            `Continue with deep_research_status("${current.jobId}") and ` +
            `deep_research_fetch("${current.jobId}") once ready.`,
        );
      },
    ),
  );
}

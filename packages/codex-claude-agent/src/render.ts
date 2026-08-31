import type { RunResult, Warning } from "./schema.js";

export type OutputFormat = "json" | "markdown" | "text";

function warningLine(warning: Warning): string {
  return `- ${warning.code} — ${warning.message}${warning.hint ? ` (${warning.hint})` : ""}`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(1)}s`;
}

export function renderMarkdown(result: RunResult): string {
  const lines: string[] = [];
  if (result.ok) {
    lines.push("## Result", "");
    if (result.structured !== undefined) {
      lines.push("```json", JSON.stringify(result.structured, null, 2), "```");
    } else {
      lines.push(result.result ?? "");
    }
  } else {
    lines.push("## Error", "");
    lines.push(`- Code: ${result.error?.code ?? "E_UNKNOWN"}`);
    lines.push(`- Message: ${result.error?.message ?? "Unknown failure"}`);
    lines.push(`- Hint: ${result.error?.hint ?? "Inspect the job log."}`);
    lines.push(`- Attempts: ${result.error?.attempts ?? 1}`);
    if (result.error?.cause) lines.push(`- Cause: ${result.error.cause}`);
  }
  if (result.warnings.length > 0) {
    lines.push("", "## Warnings", "", ...result.warnings.map(warningLine));
  }
  lines.push("", "## Run", "", `- Job: ${result.jobId}`);
  if (result.sessionId) {
    lines.push(`- Session: ${result.sessionId}`);
    lines.push(`- Resume: \`claude --resume ${result.sessionId}\``);
  }
  lines.push(`- Cwd: ${result.cwd}`);
  if (result.worktree) {
    lines.push(`- Worktree: ${result.worktree.path}`);
    if (result.worktree.branch)
      lines.push(`- Branch: ${result.worktree.branch}`);
  }
  lines.push(`- Turns: ${result.usage.turns}`);
  if (result.usage.costUsd !== undefined)
    lines.push(`- Cost: $${result.usage.costUsd.toFixed(4)}`);
  lines.push(`- Duration: ${formatDuration(result.usage.durationMs)}`);
  if (result.usage.model) lines.push(`- Model: ${result.usage.model}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderOutput(
  result: RunResult,
  format: OutputFormat,
): { stdout: string; stderr: string } {
  if (format === "json")
    return { stdout: `${JSON.stringify(result)}\n`, stderr: "" };
  if (format === "markdown")
    return { stdout: renderMarkdown(result), stderr: "" };
  if (result.ok) {
    return {
      stdout: `${result.result ?? (result.structured === undefined ? "" : JSON.stringify(result.structured))}\n`,
      stderr:
        result.warnings.map(warningLine).join("\n") +
        (result.warnings.length > 0 ? "\n" : ""),
    };
  }
  const message = `${result.error?.code ?? "E_UNKNOWN"} — ${result.error?.message ?? "Unknown failure"} (${result.error?.hint ?? "Inspect the log."})\n`;
  return {
    stdout: "",
    stderr: `${result.warnings.map(warningLine).join("\n")}${result.warnings.length ? "\n" : ""}${message}`,
  };
}

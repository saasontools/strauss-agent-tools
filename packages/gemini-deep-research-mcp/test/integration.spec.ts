import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ResourceListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  completedInteraction,
  runningInteraction,
  MockGemini,
} from "./mock-gemini.js";

/**
 * End-to-end lifecycle tests through a real MCP client against a mock Gemini
 * HTTP server — no API key, no network. By default the MCP server runs
 * in-process; set INTEGRATION_ENTRY (e.g. bundle/server/index.js) to spawn a
 * built entry point over stdio instead — bundling is where working servers
 * break.
 */
const ENTRY = process.env.INTEGRATION_ENTRY;

let mock: MockGemini;
let home: string;
let client: Client;
let cleanup: () => Promise<void>;

async function connect(): Promise<Client> {
  const env = {
    GEMINI_API_KEY: "test-key-not-real",
    GEMINI_DEEP_RESEARCH_HOME: home,
    GEMINI_DEEP_RESEARCH_BASE_URL: mock.url,
    GEMINI_DEEP_RESEARCH_POLL_MS: "100",
    GEMINI_DEEP_RESEARCH_RETRY_ATTEMPTS: "1",
  };
  const c = new Client({ name: "integration-test", version: "0.0.0" });
  if (ENTRY) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(ENTRY)],
      env: { ...process.env, ...env },
    });
    await c.connect(transport);
    cleanup = async () => c.close();
  } else {
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    const { resetClient } = await import("../src/gemini.js");
    const { createServer } = await import("../src/server.js");
    resetClient();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createServer();
    await Promise.all([
      server.connect(serverTransport),
      c.connect(clientTransport),
    ]);
    cleanup = async () => {
      await c.close();
      resetClient();
      for (const key of Object.keys(env)) delete process.env[key];
    };
  }
  return c;
}

function text(result: unknown): string {
  return (
    (result as { content: unknown }).content as Array<{ text: string }>
  )[0]!.text;
}

async function call(
  name: string,
  args: Record<string, unknown>,
  options?: { onprogress?: (p: unknown) => void },
): Promise<{ isError?: boolean; content?: unknown; text: string }> {
  const result = await client.callTool({ name, arguments: args }, undefined, {
    ...(options?.onprogress ? { onprogress: options.onprogress } : {}),
    timeout: 60_000,
  });
  return { ...result, text: text(result) };
}

async function startJob(): Promise<string> {
  const started = await call("deep_research_start", {
    query: "why is the sky blue?",
  });
  expect(started.isError).toBeFalsy();
  return (JSON.parse(started.text) as { job_id: string }).job_id;
}

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "gdr-int-"));
  mock = new MockGemini();
  await mock.start();
  client = await connect();
});

afterEach(async () => {
  await cleanup();
  await mock.stop();
  rmSync(home, { recursive: true, force: true });
});

describe("happy path", () => {
  it("start → in_progress → completed → fetch with citations, usage, and file", async () => {
    mock.createQueue = [runningInteraction("v1_a")];
    mock.setTimeline("v1_a", [
      runningInteraction("v1_a", "Searching the web"),
      completedInteraction("v1_a"),
    ]);

    const jobId = await startJob();
    const body = mock.createBodies()[0] as {
      background: boolean;
      store: boolean;
      agent: string;
      agent_config: { type: string; collaborative_planning: boolean };
    };
    expect(body.background).toBe(true);
    expect(body.store).toBe(true);
    expect(body.agent).toBe("deep-research-preview-04-2026");
    expect(body.agent_config.type).toBe("deep-research");
    expect(body.agent_config.collaborative_planning).toBe(false);

    const polling = await call("deep_research_status", { job_id: jobId });
    expect(polling.text).toContain("status: in_progress");
    expect(polling.text).toContain("latest_progress: Searching the web");

    const done = await call("deep_research_status", { job_id: jobId });
    expect(done.text).toContain("status: completed");
    expect(done.text).toContain("report_ready: true");

    const fetched = await call("deep_research_fetch", { job_id: jobId });
    expect(fetched.isError).toBeFalsy();
    expect(fetched.text).toContain("The answer is 42");
    expect(fetched.text).toContain("Source A — https://example.com/a");
    expect(fetched.text).toContain("output tokens: 20000");

    const reportPath = /report_path: (.*)/.exec(fetched.text)![1]!;
    expect(existsSync(reportPath)).toBe(true);
    if (process.platform !== "win32") {
      // POSIX-only: Windows has no file-mode semantics.
      expect(statSync(reportPath).mode & 0o777).toBe(0o600);
    }
  });

  it("truncates long reports to a preview and inlines on request", async () => {
    const long = "A".repeat(9_000);
    mock.createQueue = [runningInteraction("v1_long")];
    mock.setTimeline("v1_long", [
      completedInteraction("v1_long", { output_text: long }),
    ]);

    const jobId = await startJob();
    await call("deep_research_status", { job_id: jobId });

    const preview = await call("deep_research_fetch", { job_id: jobId });
    expect(preview.text).toContain("report_chars: 9000");
    expect(preview.text).toContain("truncated");
    expect(preview.text.length).toBeLessThan(6_000);

    const inline = await call("deep_research_fetch", {
      job_id: jobId,
      inline: true,
    });
    expect(inline.text).toContain(long);

    const saveTo = join(home, "copy.md");
    const saved = await call("deep_research_fetch", {
      job_id: jobId,
      save_to: saveTo,
    });
    expect(saved.text).toContain(`saved_to: ${saveTo}`);
    expect(readFileSync(saveTo, "utf8")).toBe(long);
  });
});

describe("format parameter", () => {
  it("appends format instructions to the research prompt on start", async () => {
    mock.createQueue = [runningInteraction("v1_fmt")];
    mock.setTimeline("v1_fmt", [runningInteraction("v1_fmt")]);

    const started = await call("deep_research_start", {
      query: "compare auth providers",
      format: "A markdown table with columns: provider, pricing, SSO support.",
    });
    expect(started.isError).toBeFalsy();

    const body = mock.createBodies()[0] as { input: string };
    expect(body.input).toContain("compare auth providers");
    expect(body.input).toContain("Output format requirements:");
    expect(body.input).toContain("columns: provider, pricing, SSO support");
    // The stored job keeps the original query, not the combined prompt.
    const list = await call("deep_research_list", {});
    expect(list.text).toContain("compare auth providers");
    expect(list.text).not.toContain("Output format requirements");
  });

  it("appends format instructions on reply and the blocking wrapper", async () => {
    mock.createQueue = [
      { id: "v1_fplan", status: "requires_action", output_text: "PLAN" },
    ];
    mock.setTimeline("v1_fplan", [
      { id: "v1_fplan", status: "requires_action", output_text: "PLAN" },
    ]);
    const started = await call("deep_research_start", {
      query: "q",
      collaborative_planning: true,
    });
    const jobId = (JSON.parse(started.text) as { job_id: string }).job_id;
    mock.createQueue.push(runningInteraction("v1_frun"));
    mock.setTimeline("v1_frun", [runningInteraction("v1_frun")]);
    await call("deep_research_reply", {
      job_id: jobId,
      message: "Approved",
      format: "Bullet points only.",
    });
    const replyBody = mock.createBodies()[1] as { input: string };
    expect(replyBody.input).toContain("Approved");
    expect(replyBody.input).toContain("Bullet points only.");

    mock.createQueue.push(runningInteraction("v1_fblock"));
    mock.setTimeline("v1_fblock", [completedInteraction("v1_fblock")]);
    await call("deep_research", {
      query: "quick",
      format: "One paragraph.",
      wait_seconds: 30,
    });
    const blockBody = mock.createBodies()[2] as { input: string };
    expect(blockBody.input).toContain("quick");
    expect(blockBody.input).toContain("One paragraph.");
  });
});

describe("failure paths", () => {
  it("surfaces failed runs with their errors", async () => {
    mock.createQueue = [runningInteraction("v1_fail")];
    mock.setTimeline("v1_fail", [
      {
        id: "v1_fail",
        status: "failed",
        errors: [{ code: "internal", message: "model exploded" }],
      },
    ]);

    const jobId = await startJob();
    const status = await call("deep_research_status", { job_id: jobId });
    expect(status.text).toContain("status: failed");
    expect(status.text).toContain("model exploded");

    const fetched = await call("deep_research_fetch", { job_id: jobId });
    expect(fetched.isError).toBe(true);
    expect(fetched.text).toContain("failed");
  });

  it("serves partial output for budget_exceeded runs with a warning", async () => {
    mock.createQueue = [runningInteraction("v1_budget")];
    mock.setTimeline("v1_budget", [
      completedInteraction("v1_budget", {
        status: "budget_exceeded",
        output_text: "partial findings before budget ran out",
      }),
    ]);

    const jobId = await startJob();
    await call("deep_research_status", { job_id: jobId });
    const fetched = await call("deep_research_fetch", { job_id: jobId });
    expect(fetched.isError).toBeFalsy();
    expect(fetched.text).toContain("PARTIAL");
    expect(fetched.text).toContain("partial findings");
  });

  it("maps 429 to an actionable rate-limit error with a not-started note", async () => {
    mock.createQueue = [{ httpStatus: 429, message: "quota, retry after 30s" }];
    const result = await call("deep_research_start", { query: "q" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Rate limited");
    expect(result.text).toContain("NOT started");
  });

  it("maps 401 to the auth help message", async () => {
    mock.createQueue = [{ httpStatus: 401, message: "invalid key" }];
    const result = await call("deep_research_start", { query: "q" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("GEMINI_API_KEY");
    expect(result.text).toContain("aistudio.google.com");
  });
});

describe("cancel", () => {
  it("cancels an in-flight job and refuses to cancel it twice", async () => {
    mock.createQueue = [runningInteraction("v1_c")];
    mock.setTimeline("v1_c", [runningInteraction("v1_c")]);

    const jobId = await startJob();
    const cancelled = await call("deep_research_cancel", { job_id: jobId });
    expect(cancelled.isError).toBeFalsy();
    expect(cancelled.text).toContain("cancelled");
    expect(cancelled.text).toContain("billed");

    const again = await call("deep_research_cancel", { job_id: jobId });
    expect(again.isError).toBe(true);

    const fetched = await call("deep_research_fetch", { job_id: jobId });
    expect(fetched.isError).toBe(true);
  });
});

describe("collaborative planning", () => {
  it("requires_action → reply ends planning explicitly → completed", async () => {
    mock.createQueue = [
      {
        id: "v1_plan",
        status: "requires_action",
        output_text: "PLAN: 1) search 2) synthesize",
      },
    ];
    mock.setTimeline("v1_plan", [
      {
        id: "v1_plan",
        status: "requires_action",
        output_text: "PLAN: 1) search 2) synthesize",
      },
    ]);

    const started = await call("deep_research_start", {
      query: "plan first",
      collaborative_planning: true,
    });
    const jobId = (JSON.parse(started.text) as { job_id: string }).job_id;

    const status = await call("deep_research_status", { job_id: jobId });
    expect(status.text).toContain("action_required");
    expect(status.text).toContain("PLAN: 1) search 2) synthesize");

    mock.createQueue.push(runningInteraction("v1_run2"));
    mock.setTimeline("v1_run2", [completedInteraction("v1_run2")]);

    const replied = await call("deep_research_reply", {
      job_id: jobId,
      message: "Approved, proceed",
    });
    expect(replied.isError).toBeFalsy();

    const replyBody = mock.createBodies()[1] as {
      input: string;
      previous_interaction_id: string;
      agent_config: { collaborative_planning: boolean };
    };
    expect(replyBody.input).toBe("Approved, proceed");
    expect(replyBody.previous_interaction_id).toBe("v1_plan");
    // The single most common way to hang a run forever is omitting this.
    expect(replyBody.agent_config.collaborative_planning).toBe(false);

    const done = await call("deep_research_status", { job_id: jobId });
    expect(done.text).toContain("status: completed");
  });
});

describe("blocking wrapper", () => {
  it("returns the report when the run completes within the wait", async () => {
    mock.createQueue = [runningInteraction("v1_fast")];
    mock.setTimeline("v1_fast", [
      runningInteraction("v1_fast"),
      completedInteraction("v1_fast"),
    ]);

    const result = await call("deep_research", {
      query: "quick one",
      wait_seconds: 30,
    });
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("The answer is 42");
  });

  it("degrades to a job id at the wait ceiling — never an error", async () => {
    mock.createQueue = [runningInteraction("v1_slow")];
    mock.setTimeline("v1_slow", [runningInteraction("v1_slow")]);

    const result = await call("deep_research", {
      query: "slow one",
      wait_seconds: 5,
    });
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("wait ceiling");
    expect(result.text).toMatch(/job_id: job_[0-9a-f]{12}/);
    expect(result.text).toContain("deep_research_status");
  }, 15_000);

  it("emits progress notifications when a progressToken is present", async () => {
    mock.createQueue = [runningInteraction("v1_prog")];
    mock.setTimeline("v1_prog", [
      runningInteraction("v1_prog", "Reading papers"),
      completedInteraction("v1_prog"),
    ]);

    const progress: unknown[] = [];
    const result = await call(
      "deep_research",
      { query: "with progress", wait_seconds: 30 },
      { onprogress: (p) => progress.push(p) },
    );
    expect(result.isError).toBeFalsy();
    expect(progress.length).toBeGreaterThan(0);
    expect(JSON.stringify(progress)).toContain("Reading papers");
  });
});

describe("resources", () => {
  it("lists jobs, serves reports, and notifies on completion", async () => {
    const changed: unknown[] = [];
    client.setNotificationHandler(
      ResourceListChangedNotificationSchema,
      async (n) => {
        changed.push(n);
      },
    );

    mock.createQueue = [runningInteraction("v1_res")];
    mock.setTimeline("v1_res", [completedInteraction("v1_res")]);

    const jobId = await startJob();
    await call("deep_research_status", { job_id: jobId });

    const jobs = await client.readResource({ uri: "research://jobs" });
    const listing = JSON.parse(
      (jobs.contents[0] as { text: string }).text,
    ) as Array<{
      job_id: string;
      report_uri: string;
    }>;
    expect(listing.map((j) => j.job_id)).toContain(jobId);

    const report = await client.readResource({
      uri: `research://job/${jobId}`,
    });
    expect((report.contents[0] as { text: string }).text).toContain(
      "The answer is 42",
    );

    // list_changed fired when the job hit terminal state during this session.
    await new Promise((r) => setTimeout(r, 50));
    expect(changed.length).toBeGreaterThan(0);
  });
});

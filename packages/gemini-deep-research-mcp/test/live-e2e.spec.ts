import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// ⚠️ COSTS REAL MONEY (~$1-3 per run) and takes 5-20 minutes.
// Skipped by default and excluded from CI; run deliberately with:
//   RUN_LIVE_E2E=1 GEMINI_API_KEY=... pnpm vitest run test/live-e2e.spec.ts
const enabled =
  process.env.RUN_LIVE_E2E === "1" &&
  Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);

describe.skipIf(!enabled)("live end-to-end (real Gemini API)", () => {
  it(
    "runs one real deep-research job through start → status → fetch",
    async () => {
      const home = mkdtempSync(join(tmpdir(), "gdr-live-"));
      process.env.GEMINI_DEEP_RESEARCH_HOME = home;
      try {
        const { createServer } = await import("../src/server.js");
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        const server = createServer();
        const client = new Client({ name: "live-e2e", version: "0.0.0" });
        await Promise.all([
          server.connect(serverTransport),
          client.connect(clientTransport),
        ]);

        const started = await client.callTool({
          name: "deep_research_start",
          arguments: {
            query:
              "In two paragraphs: what is the Model Context Protocol and who maintains it?",
            depth: "standard",
          },
        });
        expect(started.isError).toBeFalsy();
        const { job_id } = JSON.parse(
          (started.content as Array<{ text: string }>)[0]!.text,
        ) as { job_id: string };

        const deadline = Date.now() + 55 * 60 * 1_000;
        let status = "";
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 30_000));
          const result = await client.callTool({
            name: "deep_research_status",
            arguments: { job_id },
          });
          status = /status: (\S+)/.exec(
            (result.content as Array<{ text: string }>)[0]!.text,
          )![1]!;
          if (
            [
              "completed",
              "failed",
              "cancelled",
              "incomplete",
              "budget_exceeded",
            ].includes(status)
          ) {
            break;
          }
        }
        expect(["completed", "incomplete", "budget_exceeded"]).toContain(
          status,
        );

        const fetched = await client.callTool({
          name: "deep_research_fetch",
          arguments: { job_id },
        });
        expect(fetched.isError).toBeFalsy();
        const text = (fetched.content as Array<{ text: string }>)[0]!.text;
        expect(text).toContain("report_path:");
        await client.close();
      } finally {
        delete process.env.GEMINI_DEEP_RESEARCH_HOME;
        rmSync(home, { recursive: true, force: true });
      }
    },
    60 * 60 * 1_000,
  );
});

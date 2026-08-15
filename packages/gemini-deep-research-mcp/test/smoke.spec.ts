import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Ajv } from "ajv";

// Spawns the *built* server binary and completes a real MCP handshake over
// stdio. This catches shebang, ESM-resolution, and malformed-schema failures
// that in-process unit tests cannot. Point SMOKE_ENTRY at the MCPB bundle to
// exercise the fully-inlined build:
//   SMOKE_ENTRY=bundle/server/index.js pnpm test
const entry = resolve(process.env.SMOKE_ENTRY ?? "dist/index.js");

const EXPECTED_TOOLS = [
  "deep_research",
  "deep_research_cancel",
  "deep_research_fetch",
  "deep_research_list",
  "deep_research_reply",
  "deep_research_start",
  "deep_research_status",
];

describe("MCP handshake smoke test", () => {
  let client: Client;
  let home: string;

  beforeAll(async () => {
    if (!existsSync(entry)) {
      throw new Error(
        `Server entry not found at ${entry} — run \`pnpm build\` first.`,
      );
    }
    home = mkdtempSync(join(tmpdir(), "gdr-smoke-"));
    client = new Client({ name: "smoke-test", version: "0.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      // No API key on purpose: startup and tools/list must work without one.
      env: {
        ...process.env,
        GEMINI_API_KEY: "",
        GOOGLE_API_KEY: "",
        GEMINI_DEEP_RESEARCH_HOME: home,
      },
    });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    rmSync(home, { recursive: true, force: true });
  });

  it("completes initialize and lists all seven tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  it("publishes valid JSON Schema for every tool input", async () => {
    const { tools } = await client.listTools();
    const ajv = new Ajv({ strict: false });
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(() => ajv.compile(tool.inputSchema)).not.toThrow();
    }
  });

  it("advertises resources and resource templates", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("research://jobs");
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toContain(
      "research://job/{job_id}",
    );
  });

  it("lists jobs and returns a structured auth error without a key", async () => {
    const list = await client.callTool({
      name: "deep_research_list",
      arguments: {},
    });
    expect(list.isError).toBeFalsy();

    const start = await client.callTool({
      name: "deep_research_start",
      arguments: { query: "smoke" },
    });
    expect(start.isError).toBe(true);
    const text = (start.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain("GEMINI_API_KEY");
  });
});

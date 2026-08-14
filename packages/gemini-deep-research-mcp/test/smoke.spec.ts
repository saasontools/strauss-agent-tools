import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Ajv } from "ajv";

// Spawns the *built* server binary and completes a real MCP handshake over
// stdio. This catches shebang, ESM-resolution, and malformed-schema failures
// that in-process unit tests cannot. Point SMOKE_ENTRY at the MCPB bundle to
// exercise the fully-inlined build:
//   SMOKE_ENTRY=bundle/server/index.js pnpm test
const entry = resolve(process.env.SMOKE_ENTRY ?? "dist/index.js");

describe("MCP handshake smoke test", () => {
  let client: Client;

  beforeAll(async () => {
    if (!existsSync(entry)) {
      throw new Error(
        `Server entry not found at ${entry} — run \`pnpm build\` first.`,
      );
    }
    client = new Client({ name: "smoke-test", version: "0.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
    });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
  });

  it("completes initialize and lists the expected tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["ping"]);
  });

  it("publishes valid JSON Schema for every tool input", async () => {
    const { tools } = await client.listTools();
    const ajv = new Ajv({ strict: false });
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(() => ajv.compile(tool.inputSchema)).not.toThrow();
    }
  });

  it("calls ping over stdio", async () => {
    const result = await client.callTool({ name: "ping", arguments: {} });
    expect(result.content).toEqual([{ type: "text", text: "pong" }]);
  });
});

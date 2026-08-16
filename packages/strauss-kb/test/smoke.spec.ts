import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Ajv } from "ajv";
import { KB_COMMANDS } from "../src/index.js";

// Spawns the *built* server binary and completes a real MCP handshake over
// stdio. This catches shebang, ESM-resolution, and malformed-schema failures
// that in-process unit tests cannot.
const entry = resolve(process.env.SMOKE_ENTRY ?? "dist/mcp-main.js");

const EXPECTED_TOOLS = KB_COMMANDS.map((command) => command.tool).sort();

describe("MCP handshake smoke test", () => {
  let client: Client;
  let bundle: string;

  beforeAll(async () => {
    if (!existsSync(entry)) {
      throw new Error(
        `Server entry not found at ${entry} — run \`pnpm build\` first.`,
      );
    }
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-smoke-"));
    client = new Client({ name: "smoke-test", version: "0.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      // No configuration at all: this server takes no API key and no required
      // environment, and startup must not invent one.
      env: { ...process.env, STRAUSS_KB_ACTOR: "smoke" },
    });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    rmSync(bundle, { recursive: true, force: true });
  });

  it("completes initialize and lists every command as a tool", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  it("publishes valid JSON Schema for every tool input", async () => {
    const { tools } = await client.listTools();
    const ajv = new Ajv({ strict: false });
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(() => ajv.compile(tool.inputSchema)).not.toThrow();
    }
  });

  it("writes and reads back a record through the tools", async () => {
    const written = await client.callTool({
      name: "kb_write",
      arguments: {
        bundlePath: bundle,
        type: "decision",
        input: {
          slug: "one-command-table",
          title: "The CLI and the MCP server project one command table",
          why: "Two hand-maintained surfaces drift, and the drift is invisible.",
        },
      },
    });
    expect(written.isError).toBeFalsy();

    const queried = await client.callTool({
      name: "kb_query",
      arguments: { bundlePath: bundle, text: "command table" },
    });
    expect(queried.isError).toBeFalsy();
    const text = (queried.content as { text: string }[])[0]!.text;
    expect(JSON.parse(text)).toMatchObject([
      { conceptId: "decision.one-command-table", standing: "current" },
    ]);
  });

  // The format tools answer without a base, so a client can read the contract
  // before it has anything to read it against.
  it("describes the record types with no base in sight", async () => {
    const result = await client.callTool({
      name: "kb_types",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const types = JSON.parse(
      (result.content as { text: string }[])[0]!.text,
    ) as Record<string, { sections: string[] }>;
    expect(Object.keys(types)).toHaveLength(12);
    expect(types.decision?.sections).toEqual([
      "Decision",
      "Rationale",
      "Rejected",
      "Impact",
    ]);
  });
});

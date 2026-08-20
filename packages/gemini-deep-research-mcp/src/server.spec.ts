import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

export const EXPECTED_TOOLS = [
  "deep_research",
  "deep_research_cancel",
  "deep_research_fetch",
  "deep_research_list",
  "deep_research_reply",
  "deep_research_start",
  "deep_research_status",
];

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "gdr-server-"));
  process.env.GEMINI_DEEP_RESEARCH_HOME = home;
});

afterEach(() => {
  delete process.env.GEMINI_DEEP_RESEARCH_HOME;
  rmSync(home, { recursive: true, force: true });
});

async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: "unit-test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe(SERVER_NAME, () => {
  it("declares the package.json version in the MCP handshake", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it("lists all seven research tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  it("annotates read-only vs destructive tools correctly", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get("deep_research_status")?.annotations?.readOnlyHint).toBe(
      true,
    );
    expect(byName.get("deep_research_list")?.annotations?.readOnlyHint).toBe(
      true,
    );
    expect(
      byName.get("deep_research_cancel")?.annotations?.destructiveHint,
    ).toBe(true);
    expect(byName.get("deep_research_start")?.annotations?.readOnlyHint).toBe(
      false,
    );
  });

  it("mentions cost in the start and blocking tool descriptions", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const name of ["deep_research_start", "deep_research"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.description, name).toMatch(/\$/);
    }
  });

  it("advertises the jobs resource and report resource template", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("research://jobs");
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toContain(
      "research://job/{job_id}",
    );
  });

  it("serves an empty jobs list without an API key", async () => {
    const client = await connect();
    const result = await client.readResource({ uri: "research://jobs" });
    const first = result.contents[0] as { text: string };
    expect(JSON.parse(first.text)).toEqual([]);
  });

  it("returns isError (not a throw) for auth-less tool invocation", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    const client = await connect();
    const result = await client.callTool({
      name: "deep_research_start",
      arguments: { query: "anything" },
    });
    expect(result.isError).toBe(true);
    expect(String(result.content)).toContain("");
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain("GEMINI_API_KEY");
    expect(text).toContain("aistudio.google.com");
  });
});

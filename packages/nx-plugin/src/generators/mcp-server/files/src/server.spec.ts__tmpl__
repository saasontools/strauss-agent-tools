import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, SERVER_NAME } from "./server.js";

describe(SERVER_NAME, () => {
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

  it("lists the ping tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("ping");
  });

  it("responds to ping", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "ping", arguments: {} });
    expect(result.content).toEqual([{ type: "text", text: "pong" }]);
  });

  it("echoes a message", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "ping",
      arguments: { message: "hi" },
    });
    expect(result.content).toEqual([{ type: "text", text: "pong: hi" }]);
  });
});

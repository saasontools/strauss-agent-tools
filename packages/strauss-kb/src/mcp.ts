import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KB_COMMANDS } from "./commands/index.js";
import { KbStore } from "./kb-store.js";
import { VERSION } from "./version.js";

/**
 * A knowledge base's own MCP server, over stdio.
 *
 * Standalone because a base is self-contained: a directory of markdown that
 * needs no database, no HTTP surface, and no running service to read. Folding
 * these tools into a larger server would make every consumer start that server
 * to open files it could open itself.
 *
 * Every tool is a projection of `KB_COMMANDS`, which the CLI also projects, so
 * the two cannot drift.
 */
export function createKbMcpServer(): McpServer {
  const server = new McpServer({ name: "strauss-kb", version: VERSION });
  const store = new KbStore({
    warn: (entry) => process.stderr.write(`${JSON.stringify(entry)}\n`),
  });
  const ctx = {
    store,
    actor: process.env.STRAUSS_KB_ACTOR ?? "mcp",
    now: () => new Date().toISOString(),
  };

  for (const command of KB_COMMANDS) {
    // CLI-only plumbing (sync-instructions) edits files for hooks and
    // instruction blocks; the agent capability it serves is kb_context.
    if (!command.tool) continue;
    server.registerTool(
      command.tool,
      { description: command.description, inputSchema: command.input.shape },
      async (args: unknown) => {
        const result = await command.run(ctx, command.input.parse(args));
        return {
          content: [
            {
              type: "text" as const,
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );
  }

  return server;
}

export async function runKbMcpServer(): Promise<void> {
  await createKbMcpServer().connect(new StdioServerTransport());
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json" with { type: "json" };
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";
import { log } from "./logger.js";

export const SERVER_NAME = "gemini-deep-research-mcp";
// The handshake logs this, and a stale value sends debugging down the wrong
// version's source. tsup inlines package.json at build, so the published
// bundle always carries the version it was packed as.
export const SERVER_VERSION: string = pkg.version;

/**
 * Builds the MCP server with all tools and resources registered. Kept
 * separate from the stdio entry point so tests can connect over an in-memory
 * transport.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server, () => {
    // A job finishing means a new report resource exists.
    try {
      server.sendResourceListChanged();
    } catch (err) {
      log.debug("Could not send resources/list_changed", {
        error: String(err),
      });
    }
  });
  registerResources(server);

  return server;
}

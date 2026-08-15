import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

export const SERVER_NAME = "gemini-deep-research-mcp";

// Phase-1 bundle proof: reference the SDK so the bundler cannot tree-shake it
// away. Replaced by the real client layer in a later phase.
export const GENAI_SDK = GoogleGenAI;
export const SERVER_VERSION = "1.0.0";

/**
 * Builds the MCP server with all tools registered. Kept separate from the
 * stdio entry point so tests can connect over an in-memory transport.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "ping",
    {
      description: "Health check that returns a fixed response.",
      inputSchema: {
        message: z.string().optional().describe("Optional text to echo back"),
      },
    },
    async ({ message }) => ({
      content: [
        { type: "text" as const, text: message ? `pong: ${message}` : "pong" },
      ],
    }),
  );

  return server;
}

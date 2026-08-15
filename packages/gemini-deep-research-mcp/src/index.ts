import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// GEMINI_API_KEY is read lazily by the tools that need it. Startup must not
// fail when it is missing: clients probe tools/list before the user has
// configured anything.

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);

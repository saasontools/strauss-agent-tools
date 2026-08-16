#!/usr/bin/env node
import { runKbMcpServer } from "./mcp.js";

runKbMcpServer().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

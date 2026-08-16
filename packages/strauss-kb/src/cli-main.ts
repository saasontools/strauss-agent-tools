#!/usr/bin/env node
import { runKbCli } from "./cli.js";

runKbCli(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `strauss-kb: error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

#!/usr/bin/env node
import { runKbCli } from "./cli.js";
import { TELEMETRY_FLUSH_MS, telemetryIdle } from "./telemetry/index.js";

// A command sets `process.exitCode` rather than exiting, so an in-flight
// telemetry POST would otherwise hold the process open to its own timeout.
runKbCli(process.argv.slice(2))
  .then(() => telemetryIdle(TELEMETRY_FLUSH_MS))
  .catch((error: unknown) => {
    process.stderr.write(
      `strauss-kb: error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });

#!/usr/bin/env node
// @ts-check
/** Entry point: `pnpm grammars <pin|add|upgrade|check>`. */
import { run } from "./grammars/cli.mjs";

try {
  await run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}

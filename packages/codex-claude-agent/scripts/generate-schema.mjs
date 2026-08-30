#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { RunResultSchema } from "../dist/index.js";

// The written file is handed to Prettier by the `schema` npm script: the
// repository formats every checked-in JSON, and a generator whose output
// needed reformatting would flip the file back and forth on each run.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = z.toJSONSchema(RunResultSchema, { target: "draft-2020-12" });
await mkdir(path.join(root, "schemas"), { recursive: true });
await writeFile(
  path.join(root, "schemas", "run-result.schema.json"),
  `${JSON.stringify({ $id: "https://saasontools.github.io/strauss-agent-tools/schemas/codex-claude-agent/run-result.schema.json", ...schema }, null, 2)}\n`,
);

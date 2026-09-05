#!/usr/bin/env node
// Regenerates src/protocol/generated/index.ts from src/protocol/protocol.json.
// The `review:generated` fact in the companion base names this script as its
// verify command, so it has to really run.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src/protocol/protocol.json");
const target = join(root, "src/protocol/generated/index.ts");

const raw = readFileSync(source, "utf8");
const protocol = JSON.parse(raw);
const inputSha = createHash("sha256").update(raw).digest("hex");

const lines = [
  "// GENERATED FILE — do not edit.",
  "// generator: scripts/gen-protocol.mjs",
  "// input: src/protocol/protocol.json",
  `// input-sha256: ${inputSha}`,
  "",
  `export const PROTOCOL_VERSION = ${protocol.version};`,
  "",
];

for (const message of protocol.messages) {
  const fields = Object.entries(message.fields)
    .map(([name, type]) => `  ${name}: ${type};`)
    .join("\n");
  lines.push(`export type ${pascal(message.name)}Message = {`, fields, "};", "");
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, lines.join("\n"));

function pascal(name) {
  return name.replace(/(?:^|-)([a-z])/g, (_, char) => char.toUpperCase());
}

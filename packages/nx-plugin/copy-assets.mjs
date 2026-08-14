// Copies non-TS generator assets (EJS templates, schema.json) into dist/.
// Cross-platform on purpose: CI builds on Windows as well as POSIX.
import { cpSync } from "node:fs";

for (const generator of ["mcp-server", "agent-plugin"]) {
  cpSync(
    `src/generators/${generator}/files`,
    `dist/generators/${generator}/files`,
    { recursive: true },
  );
  cpSync(
    `src/generators/${generator}/schema.json`,
    `dist/generators/${generator}/schema.json`,
  );
}

import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { startGrammarsServer } from "./grammars-server.js";

/**
 * Grammars download on first use, and the suite must pass unplugged: every
 * test file gets a local server over the fixtures and a shared cache, so the
 * six grammars are fetched once per machine rather than once per run.
 *
 * A test that cares about requests or about a cold cache points `cacheRoot`
 * at a directory of its own instead.
 */
const server = await startGrammarsServer();
process.env["STRAUSS_KB_GRAMMARS_URL"] = server.url;
process.env["STRAUSS_KB_GRAMMARS_DIR"] = join(
  tmpdir(),
  "strauss-kb-test-grammars",
);

afterAll(() => server.close());

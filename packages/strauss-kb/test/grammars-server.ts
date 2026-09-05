import { createReadStream, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grammarManifest } from "../src/grammars/index.js";

/**
 * The six grammars, git-tracked but never published, so the suite exercises
 * the download path without reaching the CDN. `tags/` holds their query parts,
 * named by hash the way the runtime cache names them — a part two packs share
 * is one file.
 */
export const GRAMMAR_FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "grammars",
);

export type GrammarsServer = {
  /** Base URL, in the shape `STRAUSS_KB_GRAMMARS_URL` takes. */
  url: string;
  /** One entry per request path, so a test can assert the cache was used. */
  requests: string[];
  close(): Promise<void>;
};

/**
 * Serves the fixtures at the paths the manifest's own URLs carry — the base
 * override replaces scheme and host and nothing else, so the path is whatever
 * the pack was pinned from. `status` forces a response code, `corrupt` serves
 * bytes that will not hash as the manifest says, and `failFirst` fails that
 * many requests before serving normally.
 */
export async function startGrammarsServer(
  options: {
    status?: number;
    corrupt?: boolean;
    hang?: boolean;
    failFirst?: number;
    /** Extra bodies to serve, by path — what a lock of a test's own points at. */
    serve?: Record<string, string>;
  } = {},
): Promise<GrammarsServer> {
  const files = new Map<string, string>();
  for (const [language, pack] of Object.entries(grammarManifest().packs)) {
    const wasm = join(GRAMMAR_FIXTURES, `tree-sitter-${language}.wasm`);
    if (!existsSync(wasm)) continue;
    files.set(new URL(pack.wasm.url).pathname, wasm);
    for (const part of pack.tags)
      files.set(
        new URL(part.url).pathname,
        join(GRAMMAR_FIXTURES, "tags", `${part.sha256.slice(0, 12)}.scm`),
      );
  }
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = request.url ?? "";
    requests.push(path);
    if (options.hang) return;
    if (requests.length <= (options.failFirst ?? 0)) {
      response.writeHead(503).end("try again");
      return;
    }
    if (options.status) {
      response.writeHead(options.status).end("nope");
      return;
    }
    if (options.corrupt) {
      response.writeHead(200).end("not a wasm module");
      return;
    }
    const extra = options.serve?.[path];
    if (extra !== undefined) {
      response.writeHead(200).end(extra);
      return;
    }
    const file = files.get(path);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    createReadStream(file).pipe(response.writeHead(200));
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

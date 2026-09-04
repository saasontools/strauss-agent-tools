import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grammarManifest } from "../src/grammars/index.js";

/**
 * The six grammars, git-tracked but never published, so the suite exercises
 * the download path without reaching the CDN.
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
 * Serves the fixtures at the CDN's own path shape. `status` forces a response
 * code, `corrupt` serves bytes that will not hash as the manifest says, and
 * `failFirst` fails that many requests before serving normally.
 */
export async function startGrammarsServer(
  options: {
    status?: number;
    corrupt?: boolean;
    hang?: boolean;
    failFirst?: number;
  } = {},
): Promise<GrammarsServer> {
  const prefix = `/${grammarManifest().package}@${grammarManifest().version}/out/`;
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
    if (!path.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const file = join(GRAMMAR_FIXTURES, path.slice(prefix.length));
    stat(file).then(
      () => createReadStream(file).pipe(response.writeHead(200)),
      () => response.writeHead(404).end(),
    );
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

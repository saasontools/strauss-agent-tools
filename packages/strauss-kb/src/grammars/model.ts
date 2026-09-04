import { z } from "zod";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * The WASM half of a pack as the lock records it: the URL it was pinned from
 * and what it hashed to. `bytes` is checked before the hash so a truncated
 * response is rejected without hashing megabytes.
 */
export const grammarWasmSchema = z.object({
  url: z.string().min(1),
  sha256,
  bytes: z.number().int().positive(),
});

/**
 * A language pack: a grammar and the definitions query that runs over it,
 * pinned together at one `package@version`. `tags` is empty where upstream
 * ships no query — that language parses but resolves nothing.
 */
export const grammarPackSchema = z.object({
  package: z.string().min(1),
  wasm: grammarWasmSchema,
  tags: z.array(z.object({ url: z.string().min(1), sha256 })),
  license: z.string().min(1),
  extensions: z.array(z.string().min(1)),
});

export const grammarManifestSchema = z.object({
  /** The runtime the packs were proved against. */
  webTreeSitter: z.string().min(1),
  linguist: z.object({ tag: z.string().min(1), commit: z.string().min(1) }),
  packs: z.record(z.string().min(1), grammarPackSchema),
});

export type GrammarWasm = z.infer<typeof grammarWasmSchema>;
export type GrammarPack = z.infer<typeof grammarPackSchema>;
export type GrammarManifest = z.infer<typeof grammarManifestSchema>;

/** Where a grammar comes from and whether it may be fetched at all. */
export type GrammarOptions = {
  /** Cache root; defaults to `STRAUSS_KB_GRAMMARS_DIR` then `~/.strauss/grammars`. */
  cacheRoot?: string;
  /** Replaces the scheme and host of every manifest URL. For tests and mirrors. */
  baseUrl?: string;
  /** Cache only, never the network — what `--offline` passes down. */
  offline?: boolean;
  fetchTimeoutMs?: number;
  /** Where the download lines go. Defaults to stderr, never stdout. */
  log?: (line: string) => void;
};

import { z } from "zod";

/**
 * What the shipped manifest says about one grammar. `bytes` is checked before
 * the hash so a truncated response is rejected without hashing megabytes.
 */
export const grammarEntrySchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
});

export const grammarManifestSchema = z.object({
  package: z.string().min(1),
  version: z.string().min(1),
  grammars: z.record(z.string().min(1), grammarEntrySchema),
});

export type GrammarEntry = z.infer<typeof grammarEntrySchema>;
export type GrammarManifest = z.infer<typeof grammarManifestSchema>;

/** Where a grammar comes from and whether it may be fetched at all. */
export type GrammarOptions = {
  /** Cache root; defaults to `STRAUSS_KB_GRAMMARS_DIR` then `~/.strauss/grammars`. */
  cacheRoot?: string;
  /** Base a `tree-sitter-wasms@<version>/out/<file>` path is appended to. */
  baseUrl?: string;
  /** Cache only, never the network — what `--offline` passes down. */
  offline?: boolean;
  fetchTimeoutMs?: number;
  /** Where the download lines go. Defaults to stderr, never stdout. */
  log?: (line: string) => void;
};

export const DEFAULT_GRAMMARS_BASE_URL = "https://cdn.jsdelivr.net/npm";

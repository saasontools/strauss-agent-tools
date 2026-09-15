import {
  changedSymbols,
  type ChangedSymbol,
  type DiffFile,
} from "@saasontools/code-diff";
import { anchorFileReader, readAnchorFiles } from "./anchor-resolver/index.js";
import { TreeSitterResolver } from "./tree-sitter-resolver/index.js";

/**
 * The declaration each post-change hunk sits in, from the pinned grammars'
 * parse of the file at `repoRoot`; git's function context names a hunk in a
 * file with no grammar. The containment rule is code-diff's.
 */
export async function changedSymbolsIn(
  repoRoot: string,
  files: readonly DiffFile[],
  options: { offline?: boolean } = {},
): Promise<ChangedSymbol[]> {
  const paths = files.map((file) => file.filePath);
  const resolver = new TreeSitterResolver({
    offline: options.offline === true,
  });
  const [sources] = await Promise.all([
    readAnchorFiles(paths, anchorFileReader(repoRoot)),
    resolver.prepare(paths),
  ]);
  return files.flatMap((file) => {
    const read = sources.get(file.filePath);
    const declarations = read?.ok
      ? resolver.declarations(read.source, file.filePath)
      : undefined;
    return changedSymbols(file, declarations);
  });
}

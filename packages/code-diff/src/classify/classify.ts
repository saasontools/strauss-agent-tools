import type {
  ClassifiedFile,
  ClassifyFile,
  ClassifyOptions,
  Verdict,
} from "./model.js";
import { generatedMarker, HEADER_LINES, pathRule } from "./rules.js";

const SOURCE: Verdict = { class: "source", reason: "default" };

/**
 * What kind of change each file carries. Precedence: the caller's declaration,
 * a `.gitattributes` entry at the base, a generator's banner, the default path
 * table where the repository declares no class, then `source`.
 */
export function classifyDiff(
  files: readonly ClassifyFile[],
  options: ClassifyOptions = {},
): ClassifiedFile[] {
  return files.map((file) => classifyFile(file, options));
}

function classifyFile(
  file: ClassifyFile,
  { declared, attributes, repoDeclares = false }: ClassifyOptions,
): ClassifiedFile {
  const whole = declared?.file(file.filePath);
  const verdict =
    whole ??
    attributes?.get(file.filePath) ??
    banner(file) ??
    (repoDeclares ? undefined : pathRule(file.filePath)) ??
    SOURCE;

  const hunks = file.hunks.map((hunk) => ({
    startLine: hunk.startLine,
    endLine: hunk.endLine,
    ...(whole ?? declared?.hunk(file.filePath, hunk) ?? verdict),
  }));

  return {
    filePath: file.filePath,
    ...verdict,
    ...(file.renamedFrom ? { renamedFrom: file.renamedFrom } : {}),
    ...(hunks.some((hunk) => hunk.class !== verdict.class) ? { hunks } : {}),
  };
}

function banner(file: ClassifyFile): Verdict | undefined {
  const marker = generatedMarker(file.header ?? headOfDiff(file));
  return marker
    ? { class: "generated", reason: `generated-header ${marker}` }
    : undefined;
}

/**
 * The head of the file as the diff shows it — every added line numbered inside
 * the banner window. `--unified=0` numbering: a patch carrying context lines
 * numbers its hunk from the context, so a banner can be misattributed.
 */
function headOfDiff(file: ClassifyFile): string[] {
  return file.hunks.flatMap((hunk) =>
    (hunk.side ?? "new") === "new" && hunk.startLine <= HEADER_LINES
      ? (hunk.lines ?? []).slice(0, HEADER_LINES - hunk.startLine + 1)
      : [],
  );
}

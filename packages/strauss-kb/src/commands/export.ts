import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { adjudicate, type KbAdjudicated } from "../adjudicate.js";
import { selectDecisions } from "../decision-record.js";
import type { KbRecord } from "../kb-record.schema.js";
import { LINK_RELS } from "../record-types.js";
import { argvFlag, bundlePath, define } from "./model.js";

export type KbExportedDecision = {
  conceptId: string;
  /** File name within the target directory, `NNNN-<slug>.md`. */
  file: string;
  /** The ADR's Status line, as adjudication settled it. */
  status: string;
};

/** A file this exporter did not write, holding the name a decision needs. */
export type KbExportForeignFile = {
  conceptId: string;
  file: string;
};

export type KbExportResult = {
  to: string;
  format: "madr";
  exported: KbExportedDecision[];
  /** Decisions left unwritten because a foreign file already holds their name. */
  foreign: KbExportForeignFile[];
};

/** `NNNN-<slug>.md` — an ADR file already in the target directory. */
const NUMBERED = /^(\d{4})-(.+)\.md$/;

/** Last line of every file this exporter writes, and how it recognises its own. */
const MARKER = "<!-- strauss-kb export: ";

export const exportCommand = define({
  name: "export",
  tool: "kb_export",
  usage: "export --format madr --to <dir>",
  description:
    "Write the base's decisions out as numbered MADR files, one per decision, for a repository that keeps ADRs of its own. Numbering is by slug, so a re-run rewrites its own files in place. A superseded decision is exported with what replaced it.",
  input: z.object({
    bundlePath,
    format: z
      .enum(["madr"])
      .describe("Output layout. `madr` is the only one so far."),
    to: z.string().min(1).describe("Directory the ADR files are written into."),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    format: argvFlag(argv, "--format"),
    to: argvFlag(argv, "--to"),
  }),
  run: async ({ store }, { bundlePath: path, to }): Promise<KbExportResult> => {
    const bundle = await store.list(path);
    const decisions = selectDecisions(bundle).sort((left, right) =>
      left.conceptId.localeCompare(right.conceptId),
    );
    const adjudicated = new Map(
      adjudicate(decisions, bundle).map((hit) => [hit.record.conceptId, hit]),
    );

    // Written outside any base, so this is the one path that does not go
    // through KbStore: the target is a repository's own ADR directory.
    await mkdir(to, { recursive: true });
    const taken = await existingFiles(to);
    let next = Math.max(0, ...[...taken.values()].map((row) => row.number)) + 1;

    const exported: KbExportedDecision[] = [];
    const foreign: KbExportForeignFile[] = [];
    for (const record of decisions) {
      const slug = record.conceptId.slice(record.conceptId.indexOf(".") + 1);
      const held = taken.get(slug);
      if (held && !held.ours) {
        foreign.push({ conceptId: record.conceptId, file: held.file });
        continue;
      }
      const number = held?.number ?? next++;
      const file = `${String(number).padStart(4, "0")}-${slug}.md`;
      const status = statusLine(adjudicated.get(record.conceptId));
      await publish(join(to, file), renderMadr(record, status));
      exported.push({ conceptId: record.conceptId, file, status });
    }

    return { to, format: "madr", exported, foreign };
  },
  render: (result) => {
    const { exported, foreign, to } = result as KbExportResult;
    return [
      `Wrote ${exported.length} MADR file${exported.length === 1 ? "" : "s"} to ${to}.`,
      ...exported.map(
        (entry) => `- ${entry.file}  ${entry.conceptId} [${entry.status}]`,
      ),
      ...foreign.map(
        (entry) =>
          `- skipped ${entry.conceptId}: ${entry.file} was not written by export`,
      ),
    ].join("\n");
  },
});

/** Staged and renamed, so a reader never sees half an ADR. */
async function publish(target: string, contents: string): Promise<void> {
  const staging = `${target}.${process.pid}.tmp`;
  await writeFile(staging, contents, "utf8");
  try {
    await rename(staging, target);
  } catch (error) {
    await unlink(staging).catch(() => undefined);
    throw error;
  }
}

/**
 * Names already taken, keyed by slug, and whether this exporter wrote each one.
 * A decision keeps the number it was first exported under: an ADR is cited by
 * number, so renumbering rewrites history elsewhere.
 */
async function existingFiles(
  to: string,
): Promise<Map<string, { file: string; number: number; ours: boolean }>> {
  const names = await readdir(to).catch(() => [] as string[]);
  const taken = new Map<
    string,
    { file: string; number: number; ours: boolean }
  >();
  for (const name of names.sort()) {
    const [, number, slug] = NUMBERED.exec(name) ?? [];
    if (!number || !slug) continue;
    const text = await readFile(join(to, name), "utf8").catch(() => "");
    taken.set(slug, {
      file: name,
      number: Number(number),
      ours: text.includes(MARKER),
    });
  }
  return taken;
}

function statusLine(hit: KbAdjudicated | undefined): string {
  const status = hit?.record.frontmatter.strauss_status ?? "draft";
  if (status !== "superseded") return status;
  const by = (hit?.heads ?? []).map((head) => head.conceptId);
  return by.length ? `superseded by ${by.join(", ")}` : "superseded";
}

function renderMadr(record: KbRecord, status: string): string {
  const sections = bodySections(record.body);
  const blocks = [
    `# ${record.frontmatter.title ?? record.conceptId}`,
    "## Status",
    status,
  ];
  // A heading with nothing under it reads as a question that was asked and left
  // unanswered, so an absent field is an absent heading — as in the record.
  push(blocks, "Context and Problem Statement", record.frontmatter.description);
  push(blocks, "Considered Options", sections.get("Rejected"));
  push(blocks, "Decision Outcome", sections.get("Decision"));
  push(blocks, "Consequences", sections.get("Impact"));
  blocks.push(`${MARKER}${record.conceptId} -->`);
  return `${blocks.join("\n\n")}\n`;
}

function push(blocks: string[], heading: string, text?: string): void {
  if (text?.trim()) blocks.push(`## ${heading}`, text.trim());
}

/**
 * The body's `## Heading` blocks, without the sentences `compose.ts` renders
 * after them — those state edges and sources, which an ADR carries nowhere.
 */
function bodySections(body: string): Map<string, string> {
  const generated = new RegExp(
    `^(?:(?:${Object.values(LINK_RELS)
      .map((spec) => spec.phrase)
      .join("|")}) \\[[^\\]]+\\]\\([^)]+\\.md\\)\\.|\\[\\^[^\\]]+\\]: .*)$`,
  );

  const sections = new Map<string, string>();
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (heading) sections.set(heading, lines.join("\n").trim());
  };

  for (const line of body.split("\n")) {
    const match = /^## (.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[1] ?? null;
      lines = [];
    } else if (heading && !generated.test(line)) {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

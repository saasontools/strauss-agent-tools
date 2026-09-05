import { resolve } from "node:path";
import {
  KbInvalidConceptIdError,
  KbPromoteCollisionError,
  KbPromoteSelfError,
  KbPromoteStandingError,
  KbPromoteStoppedError,
  KbRecordNotFoundError,
} from "../../kb-errors.js";
import { assertBaseNotFrozen } from "../../kb-pins/index.js";
import { KB_SLUG_PATTERN } from "../../kb-record.schema.js";
import { argvFlag, define } from "../model.js";
import { carry } from "./carry.js";
import { promoteCandidates } from "./candidates.js";
import {
  promoteInputSchema,
  type KbPromoteResult,
  type KbPromotedRecord,
} from "./model.js";
import { isWithdrawn, standings } from "./standing.js";

export const promoteCommand = define({
  name: "promote",
  tool: "kb_promote",
  usage:
    "promote <concept-id...> --to <bundle> [--source <url>] [--force] | --list",
  description:
    "Copy records into another base at the same slug, with the review tags dropped and a source naming where the promotion came from. Use at merge, to lift what a review base settled into the base that outlives it. `list` names the candidates instead. The originals stay put.",
  input: promoteInputSchema,
  fromArgv: (argv, path) => {
    const to = argvFlag(argv, "--to");
    const source = argvFlag(argv, "--source");
    // Flag values sit in argv where the concept ids do, so a run that did not
    // strip them would try to promote a record named after a URL.
    const words = argv.slice(1);
    for (const flag of ["--to", "--source"]) {
      const at = words.indexOf(flag);
      if (at !== -1) words.splice(at, 2);
    }
    const conceptIds = words.filter((word) => !word.startsWith("--"));

    return {
      bundlePath: path,
      ...(conceptIds.length ? { conceptIds } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(argv.includes("--force") ? { force: true } : {}),
      ...(argv.includes("--list") ? { list: true } : {}),
    };
  },
  run: async (
    { store, actor },
    { bundlePath: path, conceptIds, to, source, force, list },
  ): Promise<KbPromoteResult> => {
    // Both bases are logged and compared, so both are resolved before either is
    // written to or named in a log line.
    const from = resolve(path);
    const bundle = await store.list(from);
    if (list) {
      return { mode: "list", candidates: promoteCandidates(bundle) };
    }

    // Narrowed here rather than in the signature: the schema already refuses
    // the absent case, and the two modes share one input object.
    const target = resolve(to as string);
    if (target === from) throw new KbPromoteSelfError(target);

    // Every refusal happens here, before the first write: a run that stopped at
    // its own pre-flight would leave the target holding part of a change.
    const named = (conceptIds ?? []).map(namedRecord);
    const wanted = named.map(({ conceptId, type, slug }) => {
      const record = bundle.find((entry) => entry.conceptId === conceptId);
      if (!record) throw new KbRecordNotFoundError(conceptId);
      return { record, type, slug };
    });

    // The source takes `promote-out` lines and possibly a `.gitattributes`, so
    // a frozen source base refuses the run as surely as a frozen target.
    await assertBaseNotFrozen(process.cwd(), from);
    await assertBaseNotFrozen(process.cwd(), target);

    const standing = standings(bundle);
    for (const { record } of wanted) {
      const where = standing.get(record.conceptId);
      if (isWithdrawn(where)) {
        throw new KbPromoteStandingError(record.conceptId, where as string);
      }
      if (!force && (await store.read(target, record.conceptId))) {
        throw new KbPromoteCollisionError(record.conceptId, target);
      }
    }

    const promotedIds = new Set(wanted.map(({ record }) => record.conceptId));
    const promoted: KbPromotedRecord[] = [];
    for (const { record, type, slug } of wanted) {
      const { frontmatter, body, droppedLinks } = carry(
        record,
        promotedIds,
        source,
      );
      try {
        await store.write(
          target,
          { type, slug, frontmatter, body, overwrite: force === true },
          actor,
        );
      } catch (error) {
        throw new KbPromoteStoppedError(
          record.conceptId,
          promoted.map((entry) => entry.conceptId),
          error instanceof Error ? error.message : "unknown",
        );
      }
      // Both bases, because neither can answer on its own: the source keeps no
      // trace of a copy, and the target keeps no trace of where it came from.
      await store.note(target, {
        by: actor,
        operation: "promote-in",
        conceptId: record.conceptId,
        target: from,
      });
      await store.note(from, {
        by: actor,
        operation: "promote-out",
        conceptId: record.conceptId,
        target,
      });
      promoted.push({ conceptId: record.conceptId, droppedLinks });
    }

    return { mode: "promote", to: target, promoted };
  },
  render: (result) => renderPromote(result as KbPromoteResult),
});

/**
 * The `<type>.<slug>` split `KbStore.write` will accept, checked here so a
 * malformed id in the list fails the run before the earlier ids are written.
 */
function namedRecord(conceptId: string): {
  conceptId: string;
  type: string;
  slug: string;
} {
  const at = conceptId.indexOf(".");
  const type = at === -1 ? conceptId : conceptId.slice(0, at);
  const slug = at === -1 ? "" : conceptId.slice(at + 1);
  if (!KB_SLUG_PATTERN.test(type) || !KB_SLUG_PATTERN.test(slug)) {
    throw new KbInvalidConceptIdError(
      "concept id must be <type>.<slug>, both kebab-case",
      { conceptId },
    );
  }
  return { conceptId, type, slug };
}

export function renderPromote(result: KbPromoteResult): string {
  if (result.mode === "list") {
    if (!result.candidates.length) return "No promotion candidates.";
    return result.candidates
      .flatMap((candidate) => [
        `${candidate.conceptId} [${candidate.type}]${
          candidate.title ? ` — ${candidate.title}` : ""
        }`,
        `  ${candidate.why}`,
      ])
      .join("\n");
  }

  const lines = [
    `Promoted ${result.promoted.length} record${
      result.promoted.length === 1 ? "" : "s"
    } into ${result.to}.`,
  ];
  for (const entry of result.promoted) {
    lines.push(`- ${entry.conceptId}`);
    for (const link of entry.droppedLinks) {
      lines.push(
        `  dropped ${link.rel} → ${link.target} (not promoted in this run)`,
      );
    }
  }
  return lines.join("\n");
}

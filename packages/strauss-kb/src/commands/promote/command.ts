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
import { argvFlag, argvWithout, define } from "../model.js";
import { carry } from "./carry.js";
import {
  CARRIED_FIELDS,
  promoteInputSchema,
  type KbCarriedField,
  type KbConflictPolicy,
  type KbPromoteResult,
  type KbPromotedRecord,
  type KbSkippedRecord,
} from "./model.js";
import { humanSettled } from "./settled.js";
import { isWithdrawn, standings } from "./standing.js";

export const promoteCommand = define({
  name: "promote",
  tool: "kb_promote",
  usage:
    "promote <concept-id...> --to <bundle> [--source <url>] [--carry <fields>] [--on-conflict <policy>]",
  description:
    "Copy records into another base at the same slug, with a source naming where the promotion came from. Use to lift what one base settled into the base that outlives it. The originals stay put.",
  input: promoteInputSchema,
  fromArgv: (argv, path) => {
    const to = argvFlag(argv, "--to");
    const source = argvFlag(argv, "--source");
    const fields = argvFlag(argv, "--carry");
    const onConflict = argvFlag(argv, "--on-conflict");
    // Flag values sit in argv where the concept ids do, so a run that did not
    // strip them would try to promote a record named after a URL.
    const conceptIds = argvWithout(
      argv.slice(1),
      "--to",
      "--source",
      "--carry",
      "--on-conflict",
    ).filter((word) => !word.startsWith("--"));

    return {
      bundlePath: path,
      ...(conceptIds.length ? { conceptIds } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(fields !== undefined ? { carry: carriedFields(fields) } : {}),
      ...(onConflict !== undefined ? { onConflict } : {}),
      ...(argv.includes("--force") ? { force: true } : {}),
    };
  },
  run: async (
    { store, actor },
    {
      bundlePath: path,
      conceptIds,
      to,
      source,
      carry: fields,
      onConflict,
      force,
    },
  ): Promise<KbPromoteResult> => {
    // Both bases are logged and compared, so both are resolved before either is
    // written to or named in a log line.
    const from = resolve(path);
    const target = resolve(to);
    if (target === from) throw new KbPromoteSelfError(target);

    const policy: KbConflictPolicy =
      onConflict ?? (force === true ? "force" : "refuse");
    const keep = new Set<KbCarriedField>(fields ?? []);
    const bundle = await store.list(from);

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
    const settled =
      policy === "skip-human-settled"
        ? await humanSettled(store, target)
        : new Map<string, string>();

    const skipped: KbSkippedRecord[] = [];
    const writing: { record: (typeof wanted)[number]; overwrite: boolean }[] =
      [];
    for (const entry of wanted) {
      const id = entry.record.conceptId;
      const where = standing.get(id);
      if (isWithdrawn(where)) {
        throw new KbPromoteStandingError(id, where as string);
      }
      const held = Boolean(await store.read(target, id));
      if (!held) {
        writing.push({ record: entry, overwrite: false });
        continue;
      }
      if (policy === "refuse") throw new KbPromoteCollisionError(id, target);
      const by = settled.get(id);
      if (by) skipped.push({ conceptId: id, settledBy: by });
      else writing.push({ record: entry, overwrite: true });
    }

    // Links are kept when their target travels in the same run, and a skipped
    // record did not travel — but the target base already holds it, so the edge
    // still resolves there.
    const promotedIds = new Set(wanted.map(({ record }) => record.conceptId));
    const promoted: KbPromotedRecord[] = [];
    for (const {
      record: { record, type, slug },
      overwrite,
    } of writing) {
      const { frontmatter, body, droppedLinks } = carry(record, promotedIds, {
        ...(source !== undefined ? { source } : {}),
        keep,
      });
      try {
        await store.write(
          target,
          { type, slug, frontmatter, body, overwrite },
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

    return { to: target, promoted, skipped };
  },
  render: (result) => renderPromote(result as KbPromoteResult),
});

/** `--carry status,verified` → the field set, with an unknown name refused. */
function carriedFields(raw: string): string[] {
  const fields = raw
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  const unknown = fields.filter(
    (field) => !(CARRIED_FIELDS as readonly string[]).includes(field),
  );
  if (unknown.length) {
    throw new KbInvalidConceptIdError(
      `--carry takes ${CARRIED_FIELDS.join(", ")}`,
      { field: unknown[0] as string },
    );
  }
  return fields;
}

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
  for (const entry of result.skipped) {
    lines.push(
      `- ${entry.conceptId} left alone (settled by ${entry.settledBy})`,
    );
  }
  return lines.join("\n");
}

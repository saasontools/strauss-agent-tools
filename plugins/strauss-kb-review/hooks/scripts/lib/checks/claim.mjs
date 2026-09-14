// @ts-check
/** claim — the record asserts what the code does not show. */
import { checkUrl, isProbeable } from "../urls.mjs";
import { finding, overlap, section, tokens } from "../util.mjs";

export const GROUP = "claim";

const STRAWMAN =
  /\b(do nothing|doing nothing|no alternative|none considered|not applicable|n\/?a|the obvious alternative|status quo)\b/i;

/** @param {import("../context.mjs").Ctx} ctx */
export function check(ctx) {
  return [
    ...noRejection(ctx),
    ...mitigationAbsent(ctx),
    ...noMitigation(ctx),
    ...deadSource(ctx),
    ...unsourced(ctx),
    ...selfVerified(ctx),
  ];
}

/** claim.no-rejection — a decision with nothing rejected, or a rejection about nothing.
 * @param {import("../context.mjs").Ctx} ctx */
function* noRejection(ctx) {
  const diff = tokens(addedText(ctx));
  for (const record of ctx.touched) {
    if (record.type !== "decision" || record.conceptId === "decision.none")
      continue;
    const rejected = section(record.body, "Rejected");
    if (!rejected) {
      yield finding(
        "claim.no-rejection",
        GROUP,
        "block",
        "semantic",
        `${record.conceptId} rejects no alternative; a decision without one is a description.`,
        { recordId: record.conceptId },
      );
      continue;
    }
    if (STRAWMAN.test(rejected) && overlap(tokens(rejected), diff) === 0) {
      yield finding(
        "claim.no-rejection",
        GROUP,
        "block",
        "semantic",
        `${record.conceptId} rejects a strawman naming nothing from the diff.`,
        { recordId: record.conceptId },
      );
    }
  }
}

/** claim.mitigation-absent — the mitigation names code nobody can find.
 * @param {import("../context.mjs").Ctx} ctx */
function* mitigationAbsent(ctx) {
  for (const record of ctx.touched) {
    if (record.type !== "risk") continue;
    const mitigation = section(record.body, "Mitigation");
    const named =
      mitigation.match(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]+)+\b/g) ?? [];
    for (const name of new Set(named)) {
      const leaf = name.split(".").pop() ?? name;
      if (leaf.length < 4 || ctx.repoHas(leaf)) continue;
      yield finding(
        "claim.mitigation-absent",
        GROUP,
        "block",
        "mechanical",
        `${record.conceptId} mitigates with ${name}, which is nowhere in the repository.`,
        { recordId: record.conceptId },
      );
    }
  }
}

/** claim.no-mitigation — a risk with no mitigation at all.
 * @param {import("../context.mjs").Ctx} ctx */
function* noMitigation(ctx) {
  for (const record of ctx.touched) {
    if (record.type !== "risk") continue;
    if (section(record.body, "Mitigation").trim()) continue;
    yield finding(
      "claim.no-mitigation",
      GROUP,
      "block",
      "semantic",
      `${record.conceptId} has no mitigation.`,
      { recordId: record.conceptId },
    );
  }
}

/**
 * claim.dead-source — a cited tracker or repository page that is not there.
 * The only check that leaves the machine, so it runs under `--report` and
 * never on the Stop path, over the allowlist `urls.mjs` owns.
 * @param {import("../context.mjs").Ctx} ctx
 */
function* deadSource(ctx) {
  if (ctx.offline || !ctx.report) return;
  for (const record of ctx.touched) {
    for (const source of record.sources) {
      const url = String(/** @type {any} */ (source)?.resource ?? "");
      if (!isProbeable(url)) continue;
      if (checkUrl(url) === "missing") {
        yield finding(
          "claim.dead-source",
          GROUP,
          "warn",
          "mechanical",
          `${record.conceptId} cites ${url}, which returns 404.`,
          { recordId: record.conceptId },
        );
      }
    }
  }
}

/** claim.unsourced — a claim with no source and no honest assumption flag.
 * @param {import("../context.mjs").Ctx} ctx */
function* unsourced(ctx) {
  for (const record of ctx.touched) {
    if (!["requirement", "fact"].includes(record.type)) continue;
    if (record.sources.length > 0 || record.assumption) continue;
    // `verify` is a source a reader can run, and a footnote is a citation the
    // frontmatter never carried; neither is silence.
    if (record.verify.length > 0 || /\[\^[^\]]+\]:/.test(record.body)) continue;
    yield finding(
      "claim.unsourced",
      GROUP,
      "block",
      "mechanical",
      `${record.conceptId} cites nothing and does not admit to being an assumption.`,
      { recordId: record.conceptId },
    );
  }
}

/** claim.self-verified — the store refused a self-verification during this change.
 * @param {import("../context.mjs").Ctx} ctx */
function* selfVerified(ctx) {
  const refused = ctx.logAdded.filter((entry) =>
    /refus/i.test(String(entry?.operation ?? entry?.note ?? "")),
  );
  if (refused.length > 0) {
    yield finding(
      "claim.self-verified",
      GROUP,
      "warn",
      "mechanical",
      `${refused.length} verification(s) were refused this session; a record is verifying itself.`,
    );
  }
}

/** @param {import("../context.mjs").Ctx} ctx */
function addedText(ctx) {
  return ctx.hunks
    .filter((hunk) => !hunk.file.startsWith(".strauss/"))
    .flatMap((hunk) => hunk.added)
    .join("\n");
}

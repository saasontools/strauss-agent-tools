// @ts-check
/** E — hygiene: what the store itself already knows is wrong. */
import { asString, finding } from "./util.mjs";

const EXPIRY = new Set(["expired", "expiring"]);

/** @param {import("./context.mjs").Ctx} ctx */
export function check(ctx) {
  return [...e1(ctx), ...e2(ctx), ...e3(ctx)];
}

/** E1 — `strauss-kb validate` found a pointer no record can see. Warnings are
 * the store saying it can live with something; only an error blocks.
 * @param {import("./context.mjs").Ctx} ctx */
function* e1(ctx) {
  for (const problem of ctx.validate) {
    if (asString(problem?.severity) !== "error") continue;
    const note = asString(problem?.note) || JSON.stringify(problem);
    yield finding("E1", "E", "block", "mechanical", `kb_validate: ${note}`, {
      recordId: asString(problem?.conceptId) || undefined,
    });
  }
}

/** E2 — `doctor --strict` says a record is past or nearing its date. @param {import("./context.mjs").Ctx} ctx */
function* e2(ctx) {
  for (const group of ctx.doctor?.groups ?? []) {
    if (!EXPIRY.has(asString(group?.check))) continue;
    for (const item of group.findings ?? []) {
      yield finding(
        "E2",
        "E",
        "warn",
        "mechanical",
        `${asString(item?.conceptId)} is ${asString(group?.check)}: ${asString(group?.headline)}.`,
        { recordId: asString(item?.conceptId) || undefined },
      );
    }
  }
}

/** E3 — a typed link, or a body link, whose target is not in the base. @param {import("./context.mjs").Ctx} ctx */
function* e3(ctx) {
  for (const record of ctx.records) {
    if (record.standing !== "current") continue;
    const targets = new Set(record.links.map((link) => link.target));
    for (const match of record.body.matchAll(/\]\(([A-Za-z0-9._-]+)\.md\)/g)) {
      if (match[1]) targets.add(match[1]);
    }
    for (const target of targets) {
      if (ctx.byId.has(target)) continue;
      yield finding(
        "E3",
        "E",
        "block",
        "mechanical",
        `${record.conceptId} links to ${target}, which is not in the base.`,
        { recordId: record.conceptId },
      );
    }
  }
}

// @ts-check
/** C — fabrication: a record that reads like one and says nothing. */
import { checkUrl, isProbeable } from "./urls.mjs";
import { finding, overlap, section, similarity, tokens } from "./util.mjs";

const STRAWMAN =
  /\b(do nothing|doing nothing|no alternative|none considered|not applicable|n\/?a|the obvious alternative|status quo)\b/i;

/** @param {import("./context.mjs").Ctx} ctx */
export function check(ctx) {
  return [
    ...c1(ctx),
    ...c2(ctx),
    ...c3(ctx),
    ...c4(ctx),
    ...c5(ctx),
    ...c6(ctx),
    ...c7(ctx),
    ...c8(ctx),
    ...c9(ctx),
  ];
}

/** C1 — a decision with nothing rejected, or a rejection about nothing. @param {import("./context.mjs").Ctx} ctx */
function* c1(ctx) {
  const diff = tokens(addedText(ctx));
  for (const record of ctx.touched) {
    if (record.type !== "decision" || record.conceptId === "decision.none")
      continue;
    const rejected = section(record.body, "Rejected");
    if (!rejected) {
      yield finding(
        "C1",
        "C",
        "block",
        "semantic",
        `${record.conceptId} rejects no alternative; a decision without one is a description.`,
        { recordId: record.conceptId },
      );
      continue;
    }
    if (STRAWMAN.test(rejected) && overlap(tokens(rejected), diff) === 0) {
      yield finding(
        "C1",
        "C",
        "block",
        "semantic",
        `${record.conceptId} rejects a strawman naming nothing from the diff.`,
        { recordId: record.conceptId },
      );
    }
  }
}

/** C2 — the body is the diff, retyped. @param {import("./context.mjs").Ctx} ctx */
function* c2(ctx) {
  const added = tokens(addedText(ctx));
  if (added.size === 0) return;
  for (const record of ctx.touched) {
    const body = tokens(record.body);
    const share = overlap(body, added);
    if (body.size >= 10 && share > ctx.thresholds.maxAddedOverlap) {
      yield finding(
        "C2",
        "C",
        "warn",
        "semantic",
        `${record.conceptId} is ${Math.round(share * 100)}% added-line vocabulary; it restates the diff.`,
        { recordId: record.conceptId },
      );
    }
  }
}

/** C3 — the mitigation names code nobody can find. @param {import("./context.mjs").Ctx} ctx */
function* c3(ctx) {
  for (const record of ctx.touched) {
    if (record.type !== "risk") continue;
    const mitigation = section(record.body, "Mitigation");
    const named =
      mitigation.match(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]+)+\b/g) ?? [];
    for (const name of new Set(named)) {
      const leaf = name.split(".").pop() ?? name;
      if (leaf.length < 4 || ctx.repoHas(leaf)) continue;
      yield finding(
        "C3",
        "C",
        "block",
        "mechanical",
        `${record.conceptId} mitigates with ${name}, which is nowhere in the repository.`,
        { recordId: record.conceptId },
      );
    }
  }
}

/** C4 — no mitigation at all. How short a stated one may be is A4's question.
 * @param {import("./context.mjs").Ctx} ctx */
function* c4(ctx) {
  for (const record of ctx.touched) {
    if (record.type !== "risk") continue;
    if (section(record.body, "Mitigation").trim()) continue;
    yield finding(
      "C4",
      "C",
      "block",
      "semantic",
      `${record.conceptId} has no mitigation.`,
      { recordId: record.conceptId },
    );
  }
}

/**
 * C5 — a cited tracker or repository page that is not there. The only check
 * that leaves the machine, so it runs under `--report` and never on the Stop
 * path, over the allowlist `urls.mjs` owns.
 * @param {import("./context.mjs").Ctx} ctx
 */
function* c5(ctx) {
  if (ctx.offline || !ctx.report) return;
  for (const record of ctx.touched) {
    for (const source of record.sources) {
      const url = String(/** @type {any} */ (source)?.resource ?? "");
      if (!isProbeable(url)) continue;
      if (checkUrl(url) === "missing") {
        yield finding(
          "C5",
          "C",
          "warn",
          "mechanical",
          `${record.conceptId} cites ${url}, which returns 404.`,
          { recordId: record.conceptId },
        );
      }
    }
  }
}

/** C6 — a claim with no source and no honest assumption flag. @param {import("./context.mjs").Ctx} ctx */
function* c6(ctx) {
  for (const record of ctx.touched) {
    if (!["requirement", "fact"].includes(record.type)) continue;
    if (record.sources.length > 0 || record.assumption) continue;
    // `verify` is a source a reader can run, and a footnote is a citation the
    // frontmatter never carried; neither is silence.
    if (record.verify.length > 0 || /\[\^[^\]]+\]:/.test(record.body)) continue;
    yield finding(
      "C6",
      "C",
      "block",
      "mechanical",
      `${record.conceptId} cites nothing and does not admit to being an assumption.`,
      { recordId: record.conceptId },
    );
  }
}

/** C7 — two records saying the same thing. @param {import("./context.mjs").Ctx} ctx */
function* c7(ctx) {
  const bodies = ctx.touched.map((record) => ({
    record,
    set: tokens(record.body),
  }));
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const left = bodies[i];
      const right = bodies[j];
      if (!left || !right || left.set.size < 8) continue;
      if (similarity(left.set, right.set) > ctx.thresholds.maxSimilarity) {
        yield finding(
          "C7",
          "C",
          "warn",
          "semantic",
          `${left.record.conceptId} and ${right.record.conceptId} say the same thing.`,
          { recordId: left.record.conceptId },
        );
      }
    }
  }
}

/** C8 — a base with no gradient: nothing blocks, or everything is certain. @param {import("./context.mjs").Ctx} ctx */
function* c8(ctx) {
  const written = ctx.touched;
  if (written.length < ctx.thresholds.uniformMinRecords) return;
  const risks = written.filter((record) => record.type === "risk");
  if (
    risks.length >= 2 &&
    risks.every((record) => record.materiality === "non-blocking")
  ) {
    yield finding(
      "C8",
      "C",
      "warn",
      "semantic",
      `all ${risks.length} risks are non-blocking; the attention budget says nothing.`,
    );
  }
  if (written.every((record) => record.confidence === "high")) {
    yield finding(
      "C8",
      "C",
      "warn",
      "semantic",
      `all ${written.length} records claim high confidence.`,
    );
  }
}

/** C9 — the store refused a self-verification during this change. @param {import("./context.mjs").Ctx} ctx */
function* c9(ctx) {
  const refused = ctx.logAdded.filter((entry) =>
    /refus/i.test(String(entry?.operation ?? entry?.note ?? "")),
  );
  if (refused.length > 0) {
    yield finding(
      "C9",
      "C",
      "warn",
      "mechanical",
      `${refused.length} verification(s) were refused this session; a record is verifying itself.`,
    );
  }
}

/** @param {import("./context.mjs").Ctx} ctx */
function addedText(ctx) {
  return ctx.hunks
    .filter((hunk) => !hunk.file.startsWith(".strauss/"))
    .flatMap((hunk) => hunk.added)
    .join("\n");
}

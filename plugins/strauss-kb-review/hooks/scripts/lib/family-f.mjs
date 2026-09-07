// @ts-check
/**
 * F — holes given the work. Each signal names the record type the work owes
 * at that anchor; the finding fires when neither that type nor an
 * `open-question` sits there.
 */
import { SKIPPED } from "./classify.mjs";
import { basenameOf, finding } from "./util.mjs";

/**
 * @typedef {{ id: string, file: string, symbol?: string, want: string[],
 *   severity: "block"|"warn", message: string }} Signal
 */

/** @param {import("./context.mjs").Ctx} ctx */
export function check(ctx) {
  return signals(ctx).flatMap((signal) => {
    if (answered(ctx, signal)) return [];
    return [
      finding(
        signal.id,
        "F",
        signal.severity,
        "semantic",
        `${signal.message} — no ${signal.want.join(" or ")} anchored there.`,
        { file: signal.file, symbol: signal.symbol },
      ),
    ];
  });
}

/** A record of a wanted type, or an open question, sitting on the anchor.
 * @param {import("./context.mjs").Ctx} ctx @param {Signal} signal */
function answered(ctx, signal) {
  return ctx.touched.some(
    (record) =>
      record.standing === "current" &&
      (signal.want.includes(record.type) || record.type === "open-question") &&
      record.anchors.some((anchor) => anchor.file === signal.file) &&
      (signal.id !== "F8" || record.tags.includes("review:security")),
  );
}

/** Every signal the diff carries, whether or not a record answers it.
 * @param {import("./context.mjs").Ctx} ctx @returns {Signal[]} */
export function signals(ctx) {
  const off = new Set(ctx.thresholds.off);
  return [
    ...f1(ctx),
    ...f2(ctx),
    ...f3(ctx),
    ...f4(ctx),
    ...f5(ctx),
    ...f6(ctx),
    ...f8(ctx),
    ...f9(ctx),
    ...f10(ctx),
    ...f11(ctx),
    ...f12(ctx),
  ].filter((signal) => !off.has(signal.id));
}

const DEPENDENCY_BLOCKS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * F1 — a dependency arrived: a name the file now declares under one of the four
 * dependency blocks, which the removed lines do not also carry. A version bump
 * removes and re-adds the same name, and no other added `"key": "value"` is a
 * dependency at all.
 * @param {import("./context.mjs").Ctx} ctx
 */
function* f1(ctx) {
  for (const file of ctx.files) {
    if (basenameOf(file.path) !== "package.json") continue;
    const hunks = ctx.hunks.filter((hunk) => hunk.file === file.path);
    const declared = declaredDependencies(ctx.fileAtHead(file.path));
    const removed = new Set(named(hunks.flatMap((hunk) => hunk.removed)));
    const arrived = [...new Set(named(hunks.flatMap((hunk) => hunk.added)))]
      .filter((name) => declared.has(name) && !removed.has(name))
      .sort();
    if (arrived.length === 0) continue;
    yield sig(
      "F1",
      file.path,
      ["decision"],
      "block",
      `${arrived.join(", ")} added to dependencies`,
    );
  }
}

/** @param {string[]} lines @returns {string[]} */
function named(lines) {
  return lines.flatMap((line) => {
    const key = /^\s*"([^"]+)"\s*:\s*"[^"]*"/.exec(line);
    return key?.[1] ? [key[1]] : [];
  });
}

/** The names under the four dependency blocks of the file as it now stands.
 * @param {string} text @returns {Set<string>} */
function declaredDependencies(text) {
  try {
    const parsed = JSON.parse(text);
    return new Set(
      DEPENDENCY_BLOCKS.flatMap((block) => Object.keys(parsed?.[block] ?? {})),
    );
  } catch {
    return new Set();
  }
}

/** F2 — a file or a function big enough that a reviewer will ask. @param {import("./context.mjs").Ctx} ctx */
function* f2(ctx) {
  const { newFileLines, functionLines } = ctx.thresholds;
  for (const file of ctx.codeFiles) {
    const hunks = ctx.hunks.filter((hunk) => hunk.file === file.path);
    const added = hunks.reduce((sum, hunk) => sum + hunk.added.length, 0);
    if (file.status === "A" && added > newFileLines) {
      yield sig(
        "F2",
        file.path,
        ["decision"],
        "warn",
        `new file of ${added} lines`,
      );
      continue;
    }
    const widest = Math.max(0, ...hunks.map((hunk) => hunk.newLines));
    if (widest > functionLines) {
      yield sig(
        "F2",
        file.path,
        ["decision"],
        "warn",
        `a ${widest}-line block landed in one hunk`,
      );
    }
  }
}

/** F3 — a test left, was silenced, or stopped asserting. @param {import("./context.mjs").Ctx} ctx */
function* f3(ctx) {
  for (const file of ctx.files) {
    const isTest = (ctx.classes.get(file.path) ?? "") === "test";
    if (!isTest) continue;
    if (file.status === "D") {
      yield sig(
        "F3",
        file.path,
        ["risk", "decision"],
        "block",
        "a test file was deleted",
      );
      continue;
    }
    const hunks = ctx.hunks.filter((hunk) => hunk.file === file.path);
    const added = hunks.flatMap((hunk) => hunk.added);
    const removed = hunks.flatMap((hunk) => hunk.removed);
    if (
      added.some((line) =>
        /\b(\.skip|\.only|xit|xdescribe|it\.todo)\b/.test(line),
      )
    ) {
      yield sig(
        "F3",
        file.path,
        ["risk", "decision"],
        "block",
        "a test was skipped or focused",
      );
      continue;
    }
    if (asserts(removed) > asserts(added)) {
      yield sig(
        "F3",
        file.path,
        ["risk", "decision"],
        "block",
        "the assertion count dropped",
      );
    }
  }
}

/** @param {string[]} lines */
function asserts(lines) {
  return lines.filter((line) => /\b(assert|expect|should)\b/.test(line)).length;
}

/** F4 — a suppression, an escape hatch, or a note left for later. @param {import("./context.mjs").Ctx} ctx */
function* f4(ctx) {
  const patterns = [
    [/eslint-disable/, "an eslint rule was disabled"],
    [/@ts-(ignore|expect-error|nocheck)/, "a type error was suppressed"],
    [/(:|as|<)\s*any\b/, "`any` entered the types"],
    [/\b(TODO|FIXME|HACK|XXX)\b/, "a TODO, FIXME or HACK was left"],
    [/catch\s*(\([^)]*\))?\s*\{\s*\}/, "an empty catch swallows an error"],
  ];
  for (const file of ctx.codeFiles) {
    const added = ctx.hunks
      .filter((hunk) => hunk.file === file.path)
      .flatMap((hunk) => hunk.added);
    for (const [pattern, message] of patterns) {
      if (added.some((line) => /** @type {RegExp} */ (pattern).test(line))) {
        yield sig("F4", file.path, ["decision"], "block", String(message));
        break;
      }
    }
  }
}

const INFRA =
  /(^|\/)(\.github|ci|deploy|infra|k8s|helm|terraform)\/|(^|\/)(Dockerfile|docker-compose)|\.(tf|tfvars)$|(^|\/)\.env(\.|$)|\.config\.[cm]?[jt]s$|(^|\/)(tsconfig[^/]*\.json|nx\.json|pnpm-workspace\.yaml|\.npmrc)$/;

/** F5 — how the thing is built, deployed or configured moved. @param {import("./context.mjs").Ctx} ctx */
function* f5(ctx) {
  for (const file of ctx.files) {
    if (file.path.startsWith(".strauss/") || !INFRA.test(file.path)) continue;
    yield sig(
      "F5",
      file.path,
      ["risk", "decision"],
      "block",
      "CI, infra or environment config changed",
    );
  }
}

const CONTRACT =
  /(^|\/)migrations?\/|\.(sql|prisma|graphql|gql|proto|avsc)$|(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$|schema[^/]*\.(ya?ml|json|ts)$|\.d\.ts$/i;

/**
 * F6 — a contract artefact changed. The "exported signature" half needs a
 * public API boundary; without codegraph the gate cannot tell an exported
 * symbol from a package's exported symbol, so it stays with F7.
 * @param {import("./context.mjs").Ctx} ctx
 */
function* f6(ctx) {
  for (const file of ctx.files) {
    if (SKIPPED.has(ctx.classes.get(file.path) ?? "")) continue;
    if (!CONTRACT.test(file.path)) continue;
    yield sig(
      "F6",
      file.path,
      ["contract"],
      "block",
      "a schema, migration or wire contract changed",
    );
  }
}

const SECURITY =
  /\b(auth(n|z|entic[a-z]*|oriz[a-z]*)?|token|secret|password|passwd|credential|crypto|encrypt|decrypt|hmac|signature|permission|acl|rbac|jwt|apiKey|api_key|privateKey)\b/i;
const ACCESS = /\b(permission|authoriz|authentic|scope|isolat|acl|rbac|role)/i;

/** F8 — the diff touches who may do what. @param {import("./context.mjs").Ctx} ctx */
function* f8(ctx) {
  for (const file of ctx.codeFiles) {
    const added = ctx.hunks
      .filter((hunk) => hunk.file === file.path)
      .flatMap((hunk) => hunk.added);
    const hit = added.find(
      (line) =>
        SECURITY.test(line) || (/\btenant/i.test(line) && ACCESS.test(line)),
    );
    if (hit) {
      yield sig(
        "F8",
        file.path,
        ["risk"],
        "block",
        "added lines name auth, secrets or permissions",
      );
    }
  }
}

const CONCURRENCY =
  /\b(retry|retries|timeout|deadline|lock|mutex|semaphore|Promise\.all|Promise\.race|queue|cache|batch|debounce|throttle)\b/i;

/** F9 — timing, ordering or state that a reader cannot check by eye. @param {import("./context.mjs").Ctx} ctx */
function* f9(ctx) {
  for (const file of ctx.codeFiles) {
    const added = ctx.hunks
      .filter((hunk) => hunk.file === file.path)
      .flatMap((hunk) => hunk.added);
    if (added.some((line) => CONCURRENCY.test(line))) {
      yield sig(
        "F9",
        file.path,
        ["risk", "decision"],
        "warn",
        "retry, cache, lock or fan-out logic changed",
      );
    }
  }
}

/** F10 — a sourced requirement nothing claims to satisfy. @param {import("./context.mjs").Ctx} ctx */
function* f10(ctx) {
  for (const record of ctx.touched) {
    if (record.type !== "requirement" || record.sources.length === 0) continue;
    const backlinks = ctx.backlinks(record.conceptId)?.backlinks ?? [];
    const satisfied = backlinks.some(
      (/** @type {any} */ link) => link?.rel === "satisfies",
    );
    if (!satisfied) {
      const anchor = record.anchors[0]?.file ?? record.path;
      yield sig(
        "F10",
        anchor,
        ["flow", "decision"],
        "block",
        `${record.conceptId} has no satisfies backlink`,
      );
    }
  }
}

/** F11— an open risk that matters, with nothing pinning it. @param {import("./context.mjs").Ctx} ctx */
function* f11(ctx) {
  const terminal = new Set(["resolved", "rejected", "superseded", "answered"]);
  for (const record of ctx.touched) {
    if (record.type !== "risk" || terminal.has(record.status)) continue;
    if (!["blocking", "important"].includes(record.materiality ?? "")) continue;
    if (record.links.some((link) => link.rel === "verified_by")) continue;
    const anchors = record.anchors.map((anchor) => anchor.file);
    const specNear = ctx.files.some(
      (file) =>
        (ctx.classes.get(file.path) ?? "") === "test" &&
        anchors.some((anchor) => sameArea(anchor, file.path)),
    );
    if (!specNear) {
      yield sig(
        "F11",
        anchors[0] ?? record.path,
        ["test-obligation"],
        "block",
        `${record.conceptId} is ${record.materiality} and nothing verifies it`,
      );
    }
  }
}

/** @param {string} a @param {string} b */
function sameArea(a, b) {
  return (
    a.split("/").slice(0, -1).join("/") === b.split("/").slice(0, -1).join("/")
  );
}

/** F12 — a wide production change carried by a `fact` alone. @param {import("./context.mjs").Ctx} ctx */
function* f12(ctx) {
  for (const changed of ctx.changedSymbols) {
    const lines = changed.hunks.reduce(
      (sum, hunk) => sum + hunk.added.length + hunk.removed.length,
      0,
    );
    if (lines <= ctx.thresholds.factOnlyLines) continue;
    const covering = ctx.touched.filter(
      (record) =>
        record.standing === "current" &&
        record.anchors.some((anchor) => anchor.file === changed.file),
    );
    if (
      covering.length > 0 &&
      covering.every((record) => record.type === "fact")
    ) {
      yield sig(
        "F12",
        changed.file,
        ["decision"],
        "block",
        `${lines} lines changed under ${changed.symbol ?? basenameOf(changed.file)}, covered only by a fact`,
      );
    }
  }
}

/**
 * @param {string} id @param {string} file @param {string[]} want
 * @param {"block"|"warn"} severity @param {string} message @returns {Signal}
 */
function sig(id, file, want, severity, message) {
  return { id, file, want, severity, message: `${file}: ${message}` };
}

// @ts-check
/**
 * One test per row of the route table, plus the enforce contract. Inputs are
 * hand-built here; `gather` is exercised against an injected `run` at the
 * bottom, and against the fixture in merge-policy.integration.spec.mjs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_CLASSES, DEFAULT_FLOORS } from "./lib/policy.mjs";
import { decide, RULES } from "./lib/rules.mjs";
import { enforce } from "./lib/enforce.mjs";
import { gather } from "./lib/inputs.mjs";

const HEAD_SHA = "a".repeat(40);

/** @param {Partial<any>} [over] @returns {any} */
function input(over = {}) {
  return {
    base: "main",
    head: "topic",
    headSha: HEAD_SHA,
    policy: {
      present: true,
      path: ".strauss/merge-policy.json",
      version: 1,
      hash: "sha256:0",
      format: "json",
      layers: ["repo"],
      data: {
        enabled: "true",
        owners: ["dana"],
        floors: { ...DEFAULT_FLOORS },
        autoClasses: [...AUTO_CLASSES],
        autoPaths: [],
        include: [],
        exclude: [],
        crossing: "human",
        types: {},
        tags: {},
        verifiers: [],
      },
      notChecked: [],
      errors: [],
    },
    policyChanged: false,
    files: [
      {
        path: "docs/README.md",
        class: "docs",
        excluded: false,
        crosses: false,
      },
    ],
    records: [],
    unreadable: [],
    deleted: [],
    unearned: [],
    gate: { blocks: [], warns: [], answered: true },
    reviewer: { present: false, sha: null, verdicts: {}, risksWritten: [] },
    approvals: [],
    log: [],
    ...over,
  };
}

/** @param {Partial<any>} over @returns {any} */
function record(over) {
  return {
    id: "risk.x",
    type: "risk",
    materiality: null,
    effective: "non-blocking",
    status: "open",
    tags: ["review"],
    assumption: false,
    verify: [],
    writtenBy: "agent:impl",
    verifiedFrontmatter: [],
    verifiedBy: [],
    touched: true,
    onDiff: true,
    ...over,
  };
}

test("the table is ordered, and every row has a distinct id", () => {
  const ids = RULES.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.at(-1), "default-human");
});

test("no-policy — a range with no policy at the base routes human", () => {
  const answer = decide(
    input({ policy: { ...input().policy, present: false, path: null } }),
  );
  assert.deepEqual([answer.route, answer.rule], ["human", "no-policy"]);
});

test("policy-disabled — enabled:false, and a policy that did not parse", () => {
  const off = input();
  off.policy.data.enabled = "false";
  assert.equal(decide(off).rule, "policy-disabled");

  const broken = input();
  broken.policy.errors = ["policy is not JSON"];
  assert.equal(decide(broken).rule, "policy-disabled");
});

test("policy-changed — the policy row is above everything that says auto", () => {
  const answer = decide(input({ policyChanged: true }));
  assert.deepEqual([answer.route, answer.rule], ["human", "policy-changed"]);
});

test("unearned-resolution — the author's own status move does not close a record", () => {
  const answer = decide(input({ unearned: ["risk.retry-storm"] }));
  assert.deepEqual(
    [answer.route, answer.rule],
    ["human", "unearned-resolution"],
  );
});

test("open-obligation — blocking, an open question, an assumption, an open obligation", () => {
  for (const over of [
    { effective: "blocking", status: "resolved" },
    { type: "open-question", status: "open" },
    { type: "test-obligation", status: "open" },
    { type: "requirement", status: "accepted", assumption: true },
    { type: "constraint", status: "accepted", assumption: true },
  ]) {
    const answer = decide(input({ records: [record(over)] }));
    assert.deepEqual(
      [answer.route, answer.rule],
      ["human", "open-obligation"],
      JSON.stringify(over),
    );
  }
});

test("open-obligation — a settled question and a settled obligation do not fire", () => {
  const answer = decide(
    input({
      records: [
        record({ type: "open-question", status: "resolved" }),
        record({
          id: "test-obligation.x",
          type: "test-obligation",
          status: "resolved",
        }),
      ],
    }),
  );
  assert.notEqual(answer.rule, "open-obligation");
});

test("open-obligation — a record off the diff is not this range's obligation", () => {
  const answer = decide(
    input({ records: [record({ effective: "blocking", onDiff: false })] }),
  );
  assert.notEqual(answer.rule, "open-obligation");
});

test("unverified-important — a floor raises a routine record into the row", () => {
  const raised = record({
    id: "fact.tokens",
    type: "fact",
    status: "accepted",
    tags: ["review:security"],
    effective: "important",
  });
  const answer = decide(input({ records: [raised] }));
  assert.deepEqual(
    [answer.route, answer.rule],
    ["human", "unverified-important"],
  );

  const verified = decide(
    input({ records: [{ ...raised, verifiedBy: ["human:dana"] }] }),
  );
  assert.notEqual(verified.rule, "unverified-important");
});

test("reviewer-dissent — a risk the author did not write, or a verdict against", () => {
  const wrote = decide(
    input({
      reviewer: {
        present: true,
        sha: HEAD_SHA,
        verdicts: {},
        risksWritten: ["risk.reviewer-found-this"],
      },
    }),
  );
  assert.deepEqual([wrote.route, wrote.rule], ["human", "reviewer-dissent"]);

  for (const verdict of ["lies", "disputed"]) {
    const answer = decide(
      input({
        reviewer: {
          present: true,
          sha: HEAD_SHA,
          verdicts: { "decision.x": verdict },
          risksWritten: [],
        },
      }),
    );
    assert.equal(answer.rule, "reviewer-dissent", verdict);
  }
});

test("record-deleted — gone from the tree with nothing settling it", () => {
  const answer = decide(input({ deleted: ["risk.checkout-refund-partial"] }));
  assert.deepEqual([answer.route, answer.rule], ["human", "record-deleted"]);
});

test("uncovered-change — a family A block on a path review still covers", () => {
  const answer = decide(
    input({
      files: [
        { path: "src/a.ts", class: "source", excluded: false, crosses: false },
      ],
      gate: {
        blocks: [{ id: "A1", family: "A", file: "src/a.ts" }],
        warns: [],
      },
    }),
  );
  assert.deepEqual([answer.route, answer.rule], ["human", "uncovered-change"]);
});

test("uncovered-change — an exclusion that holds silences the row, a crossing one does not", () => {
  const excluded = decide(
    input({
      files: [
        {
          path: "legacy/a.ts",
          class: "source",
          excluded: true,
          crosses: false,
        },
      ],
      gate: {
        blocks: [{ id: "A1", family: "A", file: "legacy/a.ts" }],
        warns: [],
      },
    }),
  );
  assert.equal(excluded.rule, "gate-block");

  const crossing = decide(
    input({
      files: [
        { path: "legacy/a.ts", class: "source", excluded: true, crosses: true },
      ],
      gate: {
        blocks: [{ id: "A1", family: "A", file: "legacy/a.ts" }],
        warns: [],
      },
    }),
  );
  assert.equal(crossing.rule, "uncovered-change");
});

test("gate-block — any other block routes human, a warn does not", () => {
  const blocked = decide(
    input({
      gate: { blocks: [{ id: "C1", family: "C", file: null }], warns: [] },
    }),
  );
  assert.deepEqual([blocked.route, blocked.rule], ["human", "gate-block"]);

  const warned = decide(
    input({
      gate: { blocks: [], warns: [{ id: "E2", family: "E", file: null }] },
    }),
  );
  assert.equal(warned.route, "auto");
});

test("unreadable-record — a record that would not read routes human", () => {
  const answer = decide(input({ unreadable: ["risk.x"] }));
  assert.deepEqual([answer.route, answer.rule], ["human", "unreadable-record"]);
});

test("gate-unavailable — a gate that did not answer is not a clean gate", () => {
  const answer = decide(
    input({ gate: { blocks: [], warns: [], answered: false } }),
  );
  assert.deepEqual([answer.route, answer.rule], ["human", "gate-unavailable"]);
});

test("policy-human — a type or a tag the policy names routes human", () => {
  const byType = input({
    records: [record({ id: "decision.x", type: "decision", tags: [] })],
  });
  byType.policy.data.types = { decision: "human" };
  assert.deepEqual(
    [decide(byType).route, decide(byType).rule],
    ["human", "policy-human"],
  );

  const byTag = input({
    records: [record({ id: "fact.x", type: "fact", tags: ["review:pricing"] })],
  });
  byTag.policy.data.tags = { "review:pricing": "human" };
  assert.equal(decide(byTag).rule, "policy-human");

  // Neither map names this record, so the row is silent.
  const quiet = input({
    records: [record({ id: "fact.x", type: "fact", tags: ["review"] })],
  });
  quiet.policy.data.types = { decision: "human" };
  quiet.policy.data.tags = { "review:pricing": "human" };
  assert.notEqual(decide(quiet).rule, "policy-human");
});

test("policy-human — off is the unlisted behaviour, and auto never routes it", () => {
  for (const disposition of ["off", "auto"]) {
    const answer = input({
      records: [record({ id: "decision.x", type: "decision", tags: [] })],
    });
    answer.policy.data.types = { decision: disposition };
    assert.notEqual(decide(answer).rule, "policy-human", disposition);
  }

  // `human` on either map wins over `auto` on the other.
  const split = input({
    records: [
      record({ id: "fact.x", type: "fact", tags: ["review:generated"] }),
    ],
  });
  split.policy.data.types = { fact: "human" };
  split.policy.data.tags = { "review:generated": "auto" };
  assert.equal(decide(split).rule, "policy-human");
});

test("auto-mechanical — an allowlist, default deny: no class named, nothing auto", () => {
  const denied = input();
  denied.policy.data.autoClasses = [];
  assert.equal(decide(denied).route, "human");
  assert.equal(decide(denied).rule, "default-human");
});

test("auto-mechanical — auto.paths clears a file its class did not", () => {
  const loud = input({
    files: [
      {
        path: "vendor/bundle.js",
        class: "source",
        excluded: false,
        crosses: false,
      },
    ],
  });
  assert.notEqual(decide(loud).route, "auto");

  const listed = input({
    files: [
      {
        path: "vendor/bundle.js",
        class: "source",
        excluded: false,
        crosses: false,
      },
    ],
  });
  listed.policy.data.autoPaths = ["vendor/**"];
  assert.deepEqual(
    [decide(listed).route, decide(listed).rule],
    ["auto", "auto-mechanical"],
  );
});

test("auto-mechanical — a tag the policy marks auto makes a record quiet, a floor takes it back", () => {
  const marked = input({
    records: [
      record({
        id: "fact.protocol",
        type: "fact",
        status: "accepted",
        tags: ["review:generated"],
        verify: [],
      }),
    ],
  });
  marked.policy.data.tags = { "review:generated": "auto" };
  assert.equal(decide(marked).route, "auto");

  // `auto` is eligibility, not a waiver: the floor still decides.
  const raised = input({
    records: [
      record({
        id: "fact.protocol",
        type: "fact",
        status: "accepted",
        tags: ["review:generated", "review:security"],
        effective: "important",
        verify: [],
      }),
    ],
  });
  raised.policy.data.tags = { "review:generated": "auto" };
  assert.equal(decide(raised).rule, "unverified-important");
});

test("auto-mechanical — mechanical classes and a silent base", () => {
  const answer = decide(input());
  assert.deepEqual([answer.route, answer.rule], ["auto", "auto-mechanical"]);
});

test("auto-mechanical — one source file is enough to lose the row", () => {
  const answer = decide(
    input({
      files: [
        { path: "src/a.ts", class: "source", excluded: false, crosses: false },
      ],
    }),
  );
  assert.notEqual(answer.route, "auto");
});

test("auto-mechanical — the base may say decision.none, or something re-runnable", () => {
  const none = decide(
    input({
      records: [
        record({ id: "decision.none", type: "decision", status: "accepted" }),
      ],
    }),
  );
  assert.equal(none.route, "auto");

  const rerunnable = decide(
    input({
      records: [
        record({
          id: "fact.generated",
          type: "fact",
          status: "accepted",
          tags: ["review:generated"],
          verify: ["pnpm gen && git diff --exit-code"],
        }),
      ],
    }),
  );
  assert.equal(rerunnable.route, "auto");

  const opinion = decide(
    input({
      records: [
        record({ id: "decision.x", type: "decision", status: "accepted" }),
      ],
    }),
  );
  assert.equal(opinion.route, "human");
  assert.equal(opinion.rule, "default-human");
});

test("reviewer-clean — every record on the diff verified, nothing above the floors", () => {
  const answer = decide(
    input({
      files: [
        { path: "src/a.ts", class: "source", excluded: false, crosses: false },
      ],
      records: [
        record({ id: "decision.x", type: "decision", status: "accepted" }),
      ],
      reviewer: {
        present: true,
        sha: HEAD_SHA,
        verdicts: { "decision.x": "verified" },
        risksWritten: [],
      },
    }),
  );
  assert.deepEqual(
    [answer.route, answer.rule],
    ["agent-review-then-auto", "reviewer-clean"],
  );
});

test("reviewer-clean — one unverified record on the diff drops it to human", () => {
  const answer = decide(
    input({
      files: [
        { path: "src/a.ts", class: "source", excluded: false, crosses: false },
      ],
      records: [
        record({ id: "decision.x", type: "decision", status: "accepted" }),
        record({ id: "fact.y", type: "fact", status: "accepted" }),
      ],
      reviewer: {
        present: true,
        sha: HEAD_SHA,
        verdicts: { "decision.x": "verified" },
        risksWritten: [],
      },
    }),
  );
  assert.deepEqual([answer.route, answer.rule], ["human", "default-human"]);
});

test("every route an input can reach is human, auto or agent-review-then-auto, and no row removes human", () => {
  // Escalation only: adding any escalating input to the auto case can change
  // the route away from `auto`, never towards it.
  const base = decide(input());
  assert.equal(base.route, "auto");

  const absent = input();
  absent.policy.present = false;
  const off = input();
  off.policy.data.enabled = "false";
  const garbled = input();
  garbled.policy.errors = ["policy names none of version, enabled, owners"];
  const named = input({
    records: [record({ id: "decision.x", type: "decision", tags: [] })],
  });
  named.policy.data.types = { decision: "human" };

  for (const [label, escalated] of /** @type {[string, any][]} */ ([
    ["no policy", absent],
    ["enabled:false", off],
    ["a policy that did not parse", garbled],
    ["the policy changed", input({ policyChanged: true })],
    ["an unearned resolution", input({ unearned: ["risk.x"] })],
    ["a deleted record", input({ deleted: ["risk.x"] })],
    ["an unreadable record", input({ unreadable: ["risk.x"] })],
    ["a type the policy sends to a human", named],
    [
      "a reviewer risk",
      input({
        reviewer: {
          present: true,
          sha: HEAD_SHA,
          verdicts: {},
          risksWritten: ["risk.x"],
        },
      }),
    ],
    [
      "a family A block on a covered path",
      input({
        gate: {
          blocks: [{ id: "A1", family: "A", file: "docs/README.md" }],
          warns: [],
          answered: true,
        },
      }),
    ],
    [
      "any other gate block",
      input({
        gate: {
          blocks: [{ id: "C1", family: "C", file: null }],
          warns: [],
          answered: true,
        },
      }),
    ],
    [
      "a gate that did not answer",
      input({ gate: { blocks: [], warns: [], answered: false } }),
    ],
    [
      "a blocking record",
      input({ records: [record({ effective: "blocking" })] }),
    ],
  ])) {
    assert.equal(decide(escalated).route, "human", label);
  }
});

test("enforce — auto exits 0, and dry-run exits 0 whatever the route", () => {
  assert.equal(enforce({ route: "auto" }, input()).exit, 0);
  const dry = input();
  dry.policy.data.enabled = "dry-run";
  assert.equal(enforce({ route: "human" }, dry).exit, 0);
});

test("enforce — agent-review-then-auto needs the reviewer's run on the head sha", () => {
  const stale = input({
    reviewer: {
      present: true,
      sha: "b".repeat(40),
      verdicts: {},
      risksWritten: [],
    },
  });
  assert.equal(enforce({ route: "agent-review-then-auto" }, stale).exit, 1);

  const fresh = input({
    reviewer: { present: true, sha: HEAD_SHA, verdicts: {}, risksWritten: [] },
  });
  assert.equal(enforce({ route: "agent-review-then-auto" }, fresh).exit, 0);

  assert.equal(enforce({ route: "agent-review-then-auto" }, input()).exit, 1);
});

test("enforce — an owner's login is matched whatever its case", () => {
  const approved = input({
    approvals: [{ user: "Dana", state: "APPROVED", commit_id: HEAD_SHA }],
  });
  assert.equal(enforce({ route: "human" }, approved).exit, 0);
  assert.deepEqual(enforce({ route: "human" }, approved).approvedBy, ["Dana"]);
});

test("enforce — human needs an owner's APPROVED review on the head sha", () => {
  const approved = input({
    approvals: [{ user: "dana", state: "APPROVED", commit_id: HEAD_SHA }],
  });
  assert.equal(enforce({ route: "human" }, approved).exit, 0);

  const stale = input({
    approvals: [{ user: "dana", state: "APPROVED", commit_id: "b".repeat(40) }],
  });
  assert.equal(enforce({ route: "human" }, stale).exit, 1);

  const stranger = input({
    approvals: [{ user: "mallory", state: "APPROVED", commit_id: HEAD_SHA }],
  });
  assert.equal(enforce({ route: "human" }, stranger).exit, 1);

  const commented = input({
    approvals: [{ user: "dana", state: "COMMENTED", commit_id: HEAD_SHA }],
  });
  assert.equal(enforce({ route: "human" }, commented).exit, 1);
});

test("enforce — a `human:` verify in the log is never an approval", () => {
  const audited = input({
    log: [
      { operation: "verify", by: "human:dana", conceptId: "decision.x" },
      { operation: "verify", by: "human:dana", conceptId: "decision.y" },
    ],
    records: [record({ id: "decision.x", verifiedBy: ["human:dana"] })],
  });
  assert.equal(enforce({ route: "human" }, audited).exit, 1);
  assert.deepEqual(enforce({ route: "human" }, audited).approvedBy, []);
});

test("gather — the injected run is the only thing it reads", () => {
  const weakened = JSON.stringify({ version: 2, owners: ["the-author"] });
  const strict = JSON.stringify({ version: 1, owners: ["dana"] });
  /** @type {import("./lib/inputs.mjs").Run} */
  const run = {
    show: (args) =>
      args[0] === "main:.strauss/merge-policy.json"
        ? strict
        : args[0] === "topic:.strauss/merge-policy.json"
          ? weakened
          : null,
    git: (args) =>
      args.includes("--name-status") && args.includes("diff")
        ? "M\tsrc/a.ts\nA\t.strauss/kb/risk.x.md\n"
        : "",
    kb: (args) =>
      args[0] === "log"
        ? {
            entries: [
              { operation: "write", by: "agent:impl", conceptId: "risk.x" },
              {
                operation: "status:resolved",
                by: "agent:impl",
                conceptId: "risk.x",
              },
            ],
          }
        : args[0] === "classify"
          ? { files: [{ filePath: "src/a.ts", class: "source" }] }
          : [],
    gate: () => ({ findings: [] }),
    bundleFiles: () => [{ name: "risk.x.md", path: ".strauss/kb/risk.x.md" }],
    readBundle: () =>
      [
        "---",
        "type: risk",
        "tags:",
        "  - review",
        "strauss_status: resolved",
        "strauss_materiality: blocking",
        "generated:",
        "  by: 'agent:impl'",
        "---",
        "",
      ].join("\n"),
  };
  const answer = gather(
    {
      base: "main",
      head: "topic",
      headSha: HEAD_SHA,
      repoRoot: "/nowhere",
      bundleDir: ".strauss/kb",
      policyPath: null,
      reviewer: null,
      approvals: [],
    },
    run,
  );
  // The base rev's policy, not the branch's.
  assert.deepEqual(answer.policy.data.owners, ["dana"]);
  assert.equal(answer.policy.version, 1);
  assert.deepEqual(answer.unearned, ["risk.x"]);
  assert.equal(decide(answer).rule, "unearned-resolution");
});

/** A `gather` run over a hand-written repository. @param {Partial<any>} over */
function gatherWith(over) {
  /** @type {import("./lib/inputs.mjs").Run} */
  const run = {
    show: (args) =>
      args[0] === "main:.strauss/merge-policy.json"
        ? JSON.stringify({ version: 1, owners: ["dana"] })
        : null,
    git: (args) =>
      args[0] === "ls-tree"
        ? (over.atBase ?? "")
        : args.includes("--name-status")
          ? (over.changed ?? "M\tsrc/a.ts\n")
          : "",
    kb: (args) =>
      args[0] === "log" ? { entries: over.log ?? [] } : { files: [] },
    gate: () => over.gate ?? { findings: [] },
    bundleFiles: () => over.bundleFiles ?? [],
    readBundle: () => over.bundle ?? null,
    ...over.run,
  };
  return gather(
    {
      base: "main",
      head: "topic",
      headSha: HEAD_SHA,
      repoRoot: "/nowhere",
      bundleDir: ".strauss/kb",
      policyPath: null,
      reviewer: null,
      approvals: [],
      defaults: over.defaults
        ? { path: "/org/defaults.json", text: JSON.stringify(over.defaults) }
        : null,
    },
    run,
  );
}

test("record-deleted — only a record the base tree held counts as deleted", () => {
  // Written and removed inside the range, and never in the base listing.
  const inRange = gatherWith({
    atBase: "",
    log: [
      { operation: "write", by: "agent:impl", conceptId: "risk.transient" },
    ],
  });
  assert.deepEqual(inRange.deleted, []);

  const inherited = gatherWith({ atBase: ".strauss/kb/risk.inherited.md\n" });
  assert.deepEqual(inherited.deleted, ["risk.inherited"]);
});

test("record-deleted — a supersedes entry settles its target, not its subject", () => {
  const settled = gatherWith({
    atBase: ".strauss/kb/risk.old.md\n",
    log: [
      {
        operation: "supersedes",
        by: "agent:impl",
        conceptId: "risk.new",
        target: "risk.old",
      },
    ],
  });
  assert.deepEqual(settled.deleted, []);

  // The same entry must not settle `risk.new` itself, which is gone too.
  const subject = gatherWith({
    atBase: ".strauss/kb/risk.new.md\n",
    log: [
      {
        operation: "supersedes",
        by: "agent:impl",
        conceptId: "risk.new",
        target: "risk.old",
      },
    ],
  });
  assert.deepEqual(subject.deleted, ["risk.new"]);
});

test("unreadable-record — a record the bundle would not read routes human", () => {
  const answer = gatherWith({
    bundleFiles: [{ name: "risk.x.md", path: ".strauss/kb/risk.x.md" }],
    bundle: null,
  });
  assert.deepEqual(answer.unreadable, ["risk.x"]);
  assert.deepEqual(answer.records, []);
  assert.equal(decide(answer).rule, "unreadable-record");
});

test("the gate is not spawned when a row above it decided the range", () => {
  let spawned = 0;
  const answer = gatherWith({
    // Row 3 answers, and rows 9 and 10 are the first to read the gate.
    changed: "M\t.strauss/merge-policy.json\n",
    run: {
      gate: () => {
        spawned += 1;
        return { findings: [] };
      },
    },
  });
  assert.equal(decide(answer).rule, "policy-changed");
  assert.equal(spawned, 0);
  assert.equal(answer.gate.pending, true);
  assert.equal(answer.gate.blocks.length, 0);
  assert.equal(spawned, 1);
});

test("gate-unavailable — a gate that returned nothing did not answer", () => {
  const answer = gatherWith({ run: { gate: () => null } });
  assert.equal(answer.gate.answered, false);
  assert.equal(decide(answer).rule, "gate-unavailable");
});

/** A bundle record, as frontmatter. @param {Record<string, string[]|string>} over */
function frontmatter(over) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(over)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${item}`);
    } else lines.push(`${key}: ${value}`);
  }
  return [...lines, "---", ""].join("\n");
}

/** A `show` that answers one policy and one other path. @param {any} tree */
function showing(tree) {
  return (/** @type {string[]} */ args) => tree[args[0] ?? ""] ?? null;
}

test("verifiers — a listed verifier still may not verify its own record", () => {
  /** @param {{ trusted: string[], by: string }} over */
  const answer = ({ trusted, by }) =>
    gatherWith({
      run: {
        show: showing({
          "main:.strauss/merge-policy.json": JSON.stringify({
            version: 1,
            verifiers: trusted,
            floors: { "review:security": "important" },
          }),
        }),
      },
      bundleFiles: [{ name: "fact.x.md", path: ".strauss/kb/fact.x.md" }],
      bundle: frontmatter({
        type: "fact",
        tags: ["review:security"],
        strauss_status: "accepted",
      }),
      changed: "M\t.strauss/kb/fact.x.md\n",
      log: [
        { operation: "write", by: "agent:reviewer", conceptId: "fact.x" },
        { operation: "verify", by, conceptId: "fact.x" },
      ],
    });

  // The reviewer wrote it, so its own verify is the author's word — listed or
  // not — and the floor leaves the record unverified.
  for (const trusted of [[], ["agent:reviewer"]]) {
    const own = answer({ trusted, by: "agent:reviewer" });
    assert.deepEqual(own.records[0]?.verifiedBy, []);
    assert.equal(decide(own).rule, "unverified-important");
  }

  const other = answer({
    trusted: ["agent:reviewer", "agent:second"],
    by: "agent:second",
  });
  assert.deepEqual(other.records[0]?.verifiedBy, ["agent:second"]);
  assert.notEqual(decide(other).rule, "unverified-important");
});

test("verifiers — named it is an allowlist, unnamed any non-author verify counts", () => {
  /** @param {{ repo?: object, org?: object, by: string, writtenBy?: string }} over */
  const answer = ({ repo, org, by, writtenBy = "agent:impl" }) =>
    gatherWith({
      run: {
        show: showing({
          "main:.strauss/merge-policy.json": JSON.stringify({
            version: 1,
            floors: { "review:security": "important" },
            ...repo,
          }),
        }),
      },
      defaults: org,
      bundleFiles: [{ name: "fact.x.md", path: ".strauss/kb/fact.x.md" }],
      bundle: frontmatter({
        type: "fact",
        tags: ["review:security"],
        strauss_status: "accepted",
      }),
      changed: "M\t.strauss/kb/fact.x.md\n",
      log: [
        { operation: "write", by: writtenBy, conceptId: "fact.x" },
        { operation: "verify", by, conceptId: "fact.x" },
      ],
    });
  /** @param {any} over */
  const counted = (over) => answer(over).records[0]?.verifiedBy;

  // No list: any actor that did not write the record counts.
  const open = answer({ by: "agent:reviewer" });
  assert.deepEqual(open.records[0]?.verifiedBy, ["agent:reviewer"]);
  assert.notEqual(decide(open).rule, "unverified-important");

  // Named: an actor off the list is not a verifier, and the floor still bites.
  const named = { repo: { verifiers: ["human:sec"] } };
  const off = answer({ ...named, by: "agent:reviewer" });
  assert.deepEqual(off.records[0]?.verifiedBy, []);
  assert.equal(decide(off).rule, "unverified-important");

  const listed = answer({ ...named, by: "human:sec" });
  assert.deepEqual(listed.records[0]?.verifiedBy, ["human:sec"]);
  assert.notEqual(decide(listed).rule, "unverified-important");

  // Listed and the writer: still the author's own word.
  assert.deepEqual(
    counted({ ...named, by: "human:sec", writtenBy: "human:sec" }),
    [],
  );

  // The layers intersect, so the repo file shrinks the org list.
  const both = {
    org: { verifiers: ["human:sec", "human:ops"] },
    repo: { verifiers: ["human:sec"] },
  };
  assert.deepEqual(counted({ ...both, by: "human:ops" }), []);
  assert.deepEqual(counted({ ...both, by: "human:sec" }), ["human:sec"]);

  // An org layer that named none is silence, not a licence: the repo list runs.
  const repoOnly = { org: { owners: ["org-lead"] }, ...named };
  assert.deepEqual(counted({ ...repoOnly, by: "agent:reviewer" }), []);
  assert.deepEqual(counted({ ...repoOnly, by: "human:sec" }), ["human:sec"]);
});

test("crossing — off makes an exclusion final and says so, human reads the edges", () => {
  /** @param {"off" | "human"} crossing */
  const answer = (crossing) =>
    gatherWith({
      run: {
        show: showing({
          "main:.strauss/merge-policy.json": JSON.stringify({
            version: 1,
            review: { exclude: ["legacy/**"], crossing },
          }),
          "topic:legacy/report.ts": 'import { Charge } from "../src/pay";\n',
        }),
      },
      changed: "M\tlegacy/report.ts\n",
    });

  const read = answer("human");
  assert.equal(read.files[0]?.crosses, true);
  assert.match(read.policy.notChecked.join(" | "), /inbound edges not checked/);

  const final = answer("off");
  assert.equal(final.files[0]?.crosses, false);
  assert.match(final.policy.notChecked.join(" | "), /review\.crossing is off/);
});

test("crossing — an import edge that could not be read is named, not called clean", () => {
  const answer = gatherWith({
    run: {
      show: showing({
        "main:.strauss/merge-policy.json": JSON.stringify({
          version: 1,
          review: { exclude: ["legacy/**"] },
        }),
      }),
    },
    changed: "D\tlegacy/report.ts\n",
  });
  assert.equal(answer.files[0]?.crosses, false);
  assert.match(
    answer.policy.notChecked.join(" | "),
    /import edges unreadable at head: legacy\/report\.ts/,
  );
});

test("CODEOWNERS — a base file with no owner on the policy warns, and routes nothing", () => {
  /** @param {string} owners */
  const answer = (owners) =>
    gatherWith({
      run: {
        show: showing({
          "main:.strauss/merge-policy.json": JSON.stringify({
            version: 1,
            auto: { classes: ["docs"] },
          }),
          "main:CODEOWNERS": owners,
        }),
      },
      changed: "M\tdocs/README.md\n",
    });

  const bare = answer("/src/ @acme/engineering\n");
  assert.match(bare.policy.notChecked.join(" | "), /no owner on/);
  // A warning only: the range still routes on its own inputs.
  assert.equal(decide(bare).route, "auto");

  const covered = answer("# owners\n/.strauss/ @acme/platform\n");
  assert.doesNotMatch(covered.policy.notChecked.join(" | "), /no owner on/);
});

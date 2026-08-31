/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import { composeRecord } from "./compose.js";
import {
  doctor,
  KB_DOCTOR_CHECKS,
  type KbDoctorCheck,
  type KbDoctorReport,
} from "./doctor.js";
import { KbStore } from "./kb-store.js";
import type { KbRecord } from "./kb-record.schema.js";

interface Ctx {
  bundle: string;
  store: KbStore;
}

const test = baseTest.extend<Ctx>({
  bundle: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "strauss-kb-doctor-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  store: async ({}, use) => {
    await use(new KbStore());
  },
});

const NOW = new Date("2026-09-01T00:00:00Z");
/** Seven days before NOW — inside every age threshold. */
const RECENT = "2026-08-25T00:00:00Z";
/** 239 days before NOW — past every age threshold. */
const LONG_AGO = "2026-01-05T00:00:00Z";
const WRITER = "agent:seed";

/**
 * One base carrying every check's case at once.
 *
 * Deliberately not seven fixtures: the checks overlap in reality — an old open
 * question is also unverified, a dangling supersession is also an island — and
 * a per-check base would let a change that merges two groups pass every test.
 */
async function seed(store: KbStore, bundle: string): Promise<void> {
  const write = (
    type: Parameters<typeof composeRecord>[0],
    input: Parameters<typeof composeRecord>[1],
    at = RECENT,
  ) => store.write(bundle, composeRecord(type, input, WRITER, at));

  // Cites everything, so nothing below is an island by accident — and cites
  // one record that gets superseded underneath it.
  await write("decision", {
    slug: "root",
    title: "How the cache is keyed",
    why: "The rest of the base hangs off this one.",
    sections: { Decision: "Key by account and region." },
    relatedConceptIds: [
      "fact.pricing-tier",
      "fact.quota-limit",
      "fact.old-note",
      "fact.checked",
      "open-question.retry-scope",
      "requirement.dormant-proposal",
      "decision.old-way",
    ],
  });

  await write("fact", {
    slug: "pricing-tier",
    title: "The free tier caps at 1000 calls",
    why: "A wrong cap prices the plan wrong.",
    sections: { Claim: "1000 calls a month." },
    stale_after: "2026-06-01",
  });
  await write("fact", {
    slug: "quota-limit",
    title: "The quota resets monthly",
    why: "Reset timing decides when retries help.",
    sections: { Claim: "Resets on the first." },
    stale_after: "2026-09-15",
  });
  await write(
    "fact",
    {
      slug: "old-note",
      title: "The retry budget is three attempts",
      why: "A fourth attempt doubles the tail latency.",
      sections: { Claim: "Three attempts." },
      relatedConceptIds: ["decision.root"],
    },
    LONG_AGO,
  );
  await write(
    "fact",
    {
      slug: "checked",
      title: "The region prefix is two letters",
      why: "A longer prefix breaks the key length assumption.",
      sections: { Claim: "Two letters." },
    },
    LONG_AGO,
  );
  await write(
    "open-question",
    {
      slug: "retry-scope",
      title: "Which failures should the client retry?",
      why: "Scope decides how much of the client needs a backoff.",
    },
    LONG_AGO,
  );
  await write(
    "requirement",
    {
      slug: "dormant-proposal",
      title: "Every write is idempotent",
      why: "A retried write must not double-charge.",
      sections: { Claim: "Writes carry an idempotency key." },
    },
    LONG_AGO,
  );

  // Nothing points at it, and it points at nothing.
  await write("fact", {
    slug: "island",
    title: "The build runs on Node 22",
    why: "An older runtime lacks the APIs the store uses.",
    sections: { Claim: "Node 22." },
  });

  // A resolved supersession — its replacement exists, so only the citation
  // from decision.root is a finding.
  await write("decision", {
    slug: "old-way",
    title: "Key by region alone",
    why: "The direction new-way replaced.",
    sections: { Decision: "Key by region." },
  });
  await write("decision", {
    slug: "new-way",
    title: "Key by account and region",
    why: "A region-only key serves one account another's data.",
    sections: { Decision: "Key by account and region." },
  });
  await store.supersede(bundle, "decision.old-way", "decision.new-way", WRITER);

  // Marked superseded with nothing put in its place.
  await write("constraint", {
    slug: "dangling",
    title: "One charge per order",
    why: "A second charge is a refund and an apology.",
    sections: { Claim: "At most one charge." },
  });
  await store.setStatus(bundle, "constraint.dangling", "superseded", WRITER);

  // Old enough for the unverified check, but somebody checked it.
  await store.verify(
    bundle,
    "fact.checked",
    "Re-read the key builder; still two letters.",
    "human:reviewer",
    RECENT,
  );
}

function ids(report: KbDoctorReport, check: KbDoctorCheck): string[] {
  const group = report.groups.find((entry) => entry.check === check);
  return (group?.findings ?? []).map((found) => found.conceptId).sort();
}

function note(
  report: KbDoctorReport,
  check: KbDoctorCheck,
  conceptId: string,
): string {
  const group = report.groups.find((entry) => entry.check === check);
  return (
    group?.findings.find((found) => found.conceptId === conceptId)?.note ?? ""
  );
}

/** A hand-built record, for the shapes a legal write cannot produce. */
function record(
  conceptId: string,
  frontmatter: Partial<KbRecord["frontmatter"]> = {},
  body = "Body.\n",
): KbRecord {
  return {
    conceptId,
    frontmatter: {
      type: conceptId.split(".")[0] ?? "fact",
      strauss_status: "accepted",
      ...frontmatter,
    },
    body,
  };
}

describe("doctor", () => {
  test("reports every check, empty ones included", async ({
    bundle,
    store,
  }) => {
    await seed(store, bundle);

    const report = doctor(await store.list(bundle), { now: NOW });

    expect(report.groups.map((group) => group.check)).toEqual([
      ...KB_DOCTOR_CHECKS,
    ]);
    for (const group of report.groups) {
      expect(group.count).toBe(group.findings.length);
      expect(group.headline.length).toBeGreaterThan(0);
    }
    expect(report.recordCount).toBe(11);
    expect(report.counts).toEqual({
      expired: 1,
      expiring: 1,
      unverified: 3,
      aging: 2,
      orphaned: 3,
      "broken-supersession": 1,
      "superseded-but-cited": 1,
    });
    expect(report.findingCount).toBe(12);
    expect(report.healthy).toBe(false);
  });

  test("names the record whose stale_after has passed", async ({
    bundle,
    store,
  }) => {
    await seed(store, bundle);

    const report = doctor(await store.list(bundle), { now: NOW });

    expect(ids(report, "expired")).toEqual(["fact.pricing-tier"]);
    expect(note(report, "expired", "fact.pricing-tier")).toBe(
      "stale since 2026-06-01 (92 days ago)",
    );
  });

  test("names the record whose stale_after is inside the window", async ({
    bundle,
    store,
  }) => {
    await seed(store, bundle);
    const records = await store.list(bundle);

    expect(ids(doctor(records, { now: NOW }), "expiring")).toEqual([
      "fact.quota-limit",
    ]);
    expect(
      note(doctor(records, { now: NOW }), "expiring", "fact.quota-limit"),
    ).toBe("goes stale 2026-09-15 (in 14 days)");
    // A window shorter than the distance to the date reports nothing, and the
    // record does not migrate into `expired`.
    const narrow = doctor(records, { now: NOW, expiringDays: 7 });
    expect(ids(narrow, "expiring")).toEqual([]);
    expect(ids(narrow, "expired")).toEqual(["fact.pricing-tier"]);
  });

  test("reports what nobody confirmed, once it is old enough", async ({
    bundle,
    store,
  }) => {
    await seed(store, bundle);
    const records = await store.list(bundle);

    // fact.checked is the same age and carries a verified[] entry.
    expect(ids(doctor(records, { now: NOW }), "unverified")).toEqual([
      "fact.old-note",
      "open-question.retry-scope",
      "requirement.dormant-proposal",
    ]);
    expect(
      ids(doctor(records, { now: NOW, unverifiedDays: 300 }), "unverified"),
    ).toEqual([]);
  });

  test("reports what has stayed open or proposed", async ({
    bundle,
    store,
  }) => {
    await seed(store, bundle);
    const records = await store.list(bundle);

    expect(ids(doctor(records, { now: NOW }), "aging")).toEqual([
      "open-question.retry-scope",
      "requirement.dormant-proposal",
    ]);
    expect(
      note(doctor(records, { now: NOW }), "aging", "open-question.retry-scope"),
    ).toBe("open for 239 days");
    expect(
      note(
        doctor(records, { now: NOW }),
        "aging",
        "requirement.dormant-proposal",
      ),
    ).toBe("proposed 239 days ago and still unsettled");
    expect(ids(doctor(records, { now: NOW, agingDays: 300 }), "aging")).toEqual(
      [],
    );
  });

  test("names records nothing links to", async ({ bundle, store }) => {
    await seed(store, bundle);

    const report = doctor(await store.list(bundle), { now: NOW });

    // decision.root cites six records and is cited back by fact.old-note.
    // decision.new-way is not rescued by the record it replaced: the only
    // thing pointing at it is decision.old-way, which no longer holds, so the
    // live half of that pair has no inbound link of its own.
    expect(ids(report, "orphaned")).toEqual([
      "constraint.dangling",
      "decision.new-way",
      "fact.island",
    ]);
  });

  // Taken symmetrically, as a graph walk takes it, a supersession pair vouches
  // for itself: the dead record points at the live one, the live one points
  // back, and an island of two never reports.
  test("does not let a superseded record rescue its replacement", () => {
    const report = doctor(
      [
        record("decision.old-way", {
          strauss_status: "superseded",
          strauss_superseded_by: "decision.new-way",
        }),
        record("decision.new-way", {
          strauss_supersedes: ["decision.old-way"],
        }),
      ],
      { now: NOW },
    );

    expect(ids(report, "orphaned")).toEqual(["decision.new-way"]);
  });

  test("names a supersession that does not resolve", async ({
    bundle,
    store,
  }) => {
    await seed(store, bundle);

    const report = doctor(await store.list(bundle), { now: NOW });

    expect(ids(report, "broken-supersession")).toEqual(["constraint.dangling"]);
    expect(note(report, "broken-supersession", "constraint.dangling")).toBe(
      "superseded with no replacement",
    );
  });

  test("names a live record citing one that no longer holds", async ({
    bundle,
    store,
  }) => {
    await seed(store, bundle);

    const report = doctor(await store.list(bundle), { now: NOW });

    expect(ids(report, "superseded-but-cited")).toEqual(["decision.root"]);
    expect(note(report, "superseded-but-cited", "decision.root")).toBe(
      "cites superseded decision.old-way — replaced by decision.new-way",
    );
  });

  // The link a supersession is supposed to leave behind. Reporting it would
  // put a finding on every correctly performed replacement.
  test("exempts a record citing the one it replaced", () => {
    const report = doctor(
      [
        record(
          "decision.new-way",
          { strauss_supersedes: ["decision.old-way"] },
          "Relates to [decision.old-way](decision.old-way.md).\n",
        ),
        record("decision.old-way", {
          strauss_status: "superseded",
          strauss_superseded_by: "decision.new-way",
        }),
      ],
      { now: NOW },
    );

    expect(report.counts["superseded-but-cited"]).toBe(0);
  });

  test("calls a clean base healthy", () => {
    const report = doctor(
      [
        record(
          "fact.one",
          { verified: [{ by: "human:a", at: RECENT }] },
          ["Relates to [fact.two](fact.two.md)."].join("\n"),
        ),
        record(
          "fact.two",
          { verified: [{ by: "human:a", at: RECENT }] },
          ["Relates to [fact.one](fact.one.md)."].join("\n"),
        ),
      ],
      { now: NOW },
    );

    expect(report.healthy).toBe(true);
    expect(report.findingCount).toBe(0);
    expect(report.groups).toHaveLength(KB_DOCTOR_CHECKS.length);
  });

  // Standing decides whether a record is still this base's problem: a replaced
  // record whose date has passed needs no repair, and reporting one would bury
  // the records that do.
  test("leaves superseded and rejected records out of the freshness checks", () => {
    const bundle = [
      record("fact.replaced", {
        strauss_status: "superseded",
        strauss_superseded_by: "fact.current",
        stale_after: "2020-01-01",
        generated: { by: WRITER, at: LONG_AGO },
      }),
      record("fact.current", {
        strauss_supersedes: ["fact.replaced"],
        verified: [{ by: "human:a", at: RECENT }],
        generated: { by: WRITER, at: RECENT },
      }),
      record("decision.turned-down", {
        strauss_status: "rejected",
        stale_after: "2020-01-01",
        generated: { by: WRITER, at: LONG_AGO },
      }),
    ];

    const report = doctor(bundle, { now: NOW });

    expect(report.counts.expired).toBe(0);
    expect(report.counts.unverified).toBe(0);
    // fact.replaced keeps its inbound link from the record that replaced it;
    // fact.current has none of its own, which is the graph question, not the
    // standing one.
    expect(ids(report, "orphaned")).toEqual([
      "decision.turned-down",
      "fact.current",
    ]);
  });

  // A date nobody can parse is a date nobody can trust; skipping it would
  // silently exempt the record from the only check that ages it.
  test("counts an unreadable stale_after as expired", () => {
    const report = doctor(
      [record("fact.hand-edited", { stale_after: "soon" })],
      {
        now: NOW,
      },
    );

    expect(note(report, "expired", "fact.hand-edited")).toBe(
      'stale_after "soon" is not a readable date',
    );
  });

  // The check measures how long something has gone unconfirmed. Without a
  // generated.at there is no duration to measure, and inventing one would
  // report every foreign record as overdue.
  test("skips the age checks on a record with no generated.at", () => {
    const report = doctor(
      [
        record("fact.timeless"),
        record("open-question.timeless", { strauss_status: "open" }),
      ],
      { now: NOW },
    );

    expect(report.counts.unverified).toBe(0);
    expect(report.counts.aging).toBe(0);
  });

  // The store writes the status and the pointer in one mutation, so the two
  // can only disagree off-tool — and adjudication reads such a record as
  // current whatever the pointer says, which is what makes it worth naming.
  test("names a dangling replacement pointer whatever the status says", () => {
    const report = doctor(
      [
        record("fact.points-nowhere", {
          strauss_superseded_by: "fact.never-written",
        }),
        record("fact.points-at-a-live-one", {
          strauss_superseded_by: "fact.still-here",
        }),
        record("fact.still-here"),
      ],
      { now: NOW },
    );

    expect(note(report, "broken-supersession", "fact.points-nowhere")).toBe(
      "replacement fact.never-written is missing",
    );
    expect(
      note(report, "broken-supersession", "fact.points-at-a-live-one"),
    ).toBe(
      "names fact.still-here as its replacement but is not marked superseded",
    );
  });

  // A superseded record at least names its replacement. A rejected one is a
  // well-formed assertion of what someone decided not to do, cited by a record
  // a reader trusts.
  test("reports a live record citing a rejected one", () => {
    const report = doctor(
      [
        record(
          "decision.live",
          {},
          "Relates to [decision.turned-down](decision.turned-down.md).\n",
        ),
        record("decision.turned-down", { strauss_status: "rejected" }),
      ],
      { now: NOW },
    );

    expect(note(report, "superseded-but-cited", "decision.live")).toBe(
      "cites rejected decision.turned-down",
    );
  });

  // `stale_after` is date-only, which Date.parse reads as UTC midnight — so a
  // record goes stale at the start of its date, not the end of it.
  test("puts a stale_after of today on the expiring side at UTC midnight", () => {
    const today = [record("fact.due", { stale_after: "2026-09-01" })];

    const atMidnight = doctor(today, { now: NOW });
    expect(ids(atMidnight, "expired")).toEqual([]);
    expect(note(atMidnight, "expiring", "fact.due")).toBe(
      "goes stale 2026-09-01 (in 0 days)",
    );

    const laterThatDay = doctor(today, {
      now: new Date("2026-09-01T12:00:00Z"),
    });
    expect(ids(laterThatDay, "expiring")).toEqual([]);
    expect(note(laterThatDay, "expired", "fact.due")).toBe(
      "stale since 2026-09-01 (0 days ago)",
    );
  });

  test("holds the window and age thresholds at exactly N days", () => {
    const dateAfter = (days: number) =>
      new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10);
    const daysBefore = (days: number) =>
      new Date(NOW.getTime() - days * 86_400_000).toISOString();

    // Inclusive at the horizon, silent one day past it.
    const window = doctor(
      [
        record("fact.at-the-edge", { stale_after: dateAfter(30) }),
        record("fact.past-the-edge", { stale_after: dateAfter(31) }),
      ],
      { now: NOW },
    );
    expect(ids(window, "expiring")).toEqual(["fact.at-the-edge"]);

    // Exclusive at the threshold: N days old is not yet "older than N".
    const age = doctor(
      [
        record("fact.exactly-ninety", {
          generated: { by: WRITER, at: daysBefore(90) },
        }),
        record("fact.ninety-one", {
          generated: { by: WRITER, at: daysBefore(91) },
        }),
        record("open-question.exactly-ninety", {
          strauss_status: "open",
          generated: { by: WRITER, at: daysBefore(90) },
        }),
        record("open-question.ninety-one", {
          strauss_status: "open",
          generated: { by: WRITER, at: daysBefore(91) },
        }),
      ],
      { now: NOW },
    );
    expect(ids(age, "unverified")).toEqual([
      "fact.ninety-one",
      "open-question.ninety-one",
    ]);
    expect(ids(age, "aging")).toEqual(["open-question.ninety-one"]);
  });

  test("reports a supersession cycle and a fork", () => {
    const report = doctor(
      [
        record("fact.a", {
          strauss_status: "superseded",
          strauss_superseded_by: "fact.b",
        }),
        record("fact.b", {
          strauss_status: "superseded",
          strauss_superseded_by: "fact.a",
          strauss_supersedes: ["fact.a"],
        }),
      ],
      { now: NOW },
    );

    expect(ids(report, "broken-supersession")).toContain("fact.a");
    expect(
      report.groups
        .find((group) => group.check === "broken-supersession")
        ?.findings.some((found) => found.note.includes("cycles through")),
    ).toBe(true);
  });
});

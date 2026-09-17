/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import { adjudicate, type KbStanding } from "../adjudicate.js";
import { composeRecord } from "../compose.js";
import {
  reassessCommand,
  type KbReassessResult,
} from "../commands/reassess.js";
import { doctor, type KbDoctorCheck, type KbDoctorReport } from "../doctor.js";
import { LOG_FILE } from "../kb-log.js";
import type { KbLink, KbRecord, KbRecordStatus } from "../kb-record.schema.js";
import { KbStore } from "../kb-store.js";
import { validateBundle } from "../validate.js";
import {
  liveReferencesTo,
  outboundReferences,
  staleReferences,
} from "./index.js";

/**
 * The two halves of a reference, stated separately.
 *
 * A composed record cannot state a frontmatter link without also rendering a
 * body sentence for it, which is exactly how the body-only reader stayed
 * plausible: every writer in this repository masked the gap. So the records
 * here are built by hand, one half at a time.
 */

interface Ctx {
  bundle: string;
  store: KbStore;
}

const test = baseTest.extend<Ctx>({
  bundle: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "strauss-kb-refs-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  store: async ({}, use) => {
    await use(new KbStore());
  },
});

const NOW = new Date("2026-09-01T00:00:00Z");
const AT = "2026-08-25T00:00:00Z";

type RecordOptions = {
  status?: KbRecordStatus;
  links?: KbLink[];
  /** Ids to cite in the prose, as `composeRecord` renders `relatedConceptIds`. */
  cites?: string[];
  supersededBy?: string;
  supersedes?: string[];
};

function record(conceptId: string, options: RecordOptions = {}): KbRecord {
  const [type] = conceptId.split(".");
  const cited = (options.cites ?? [])
    .map((id) => `Relates to [${id}](${id}.md).`)
    .join("\n\n");
  return {
    conceptId,
    frontmatter: {
      type: type as string,
      title: conceptId,
      strauss_status: options.status ?? "accepted",
      ...(options.links ? { strauss_links: options.links } : {}),
      ...(options.supersededBy
        ? { strauss_superseded_by: options.supersededBy }
        : {}),
      ...(options.supersedes ? { strauss_supersedes: options.supersedes } : {}),
    } as KbRecord["frontmatter"],
    body: `\n## Claim\n\nThe claim.\n\n${cited}\n`,
  };
}

/** The replaced/replacement pair, both pointers written, as the store writes it. */
function replacedPair(): KbRecord[] {
  return [
    record("decision.old-way", {
      status: "superseded",
      supersededBy: "decision.new-way",
    }),
    record("decision.new-way", {
      cites: ["decision.old-way"],
      supersedes: ["decision.old-way"],
    }),
  ];
}

function standingsOf(bundle: KbRecord[]): Map<string, KbStanding> {
  return new Map(
    adjudicate(bundle, bundle, NOW).map((hit) => [
      hit.record.conceptId,
      hit.standing,
    ]),
  );
}

const stale = (bundle: KbRecord[]) =>
  staleReferences(bundle, standingsOf(bundle));

const notesIn = (report: KbDoctorReport, check: KbDoctorCheck) =>
  report.groups.find((group) => group.check === check)?.findings ?? [];

describe("outboundReferences", () => {
  test("merges the two halves into one reference per target", () => {
    const from = record("risk.export-window", {
      links: [{ target: "decision.retention", rel: "related_to" }],
      cites: ["decision.retention", "fact.quota"],
    });

    expect(outboundReferences(from)).toEqual([
      {
        target: "decision.retention",
        origins: ["body", "link"],
        rels: ["related_to"],
      },
      { target: "fact.quota", origins: ["body"], rels: [] },
    ]);
  });

  test("keeps two rels between one pair, and drops a self-reference", () => {
    const from = record("decision.a", {
      links: [
        { target: "fact.b", rel: "depends_on" },
        { target: "fact.b", rel: "informs" },
        { target: "fact.b", rel: "depends_on" },
        { target: "decision.a", rel: "related_to" },
      ],
      cites: ["decision.a"],
    });

    expect(outboundReferences(from)).toEqual([
      { target: "fact.b", origins: ["link"], rels: ["depends_on", "informs"] },
    ]);
  });

  // The rule `edgeNeighbours` already holds: a rel outside the closed
  // vocabulary is not a claim any walk can interpret, so none traverses it,
  // and only a known rel ever reaches a rendered note.
  test("a rel outside the vocabulary is not a reference", () => {
    const from = record("decision.a", {
      links: [
        { target: "fact.b", rel: "causes\u001b[31m\n" } as unknown as KbLink,
        { target: "fact.c", rel: "depends_on" },
      ],
    });

    expect(outboundReferences(from)).toEqual([
      { target: "fact.c", origins: ["link"], rels: ["depends_on"] },
    ]);

    const bundle = [from, record("fact.b"), record("fact.c")];
    expect(
      notesIn(doctor(bundle, { now: NOW }), "orphaned").map((f) => f.conceptId),
    ).toEqual(["decision.a", "fact.b"]);
    expect(validateBundle(bundle).map((problem) => problem.check)).toEqual([
      "link_rel",
    ]);
  });

  test("a superseded target reached only by an unknown rel is not reported", () => {
    const bundle = [
      ...replacedPair(),
      record("risk.watching", {
        status: "open",
        links: [
          { target: "decision.old-way", rel: "causes" } as unknown as KbLink,
        ],
      }),
    ];

    expect(stale(bundle)).toEqual([]);
  });

  // A record that explains the house style shows a citation; it does not make
  // one. Both new consumers act on what this parser returns.
  test("a link inside a fence or a code span is an example, not a citation", () => {
    const from = record("decision.house-style");
    from.body = [
      "",
      "## Claim",
      "",
      "Cite like this:",
      "",
      "```markdown",
      "Relates to [decision.fenced](decision.fenced.md).",
      "```",
      "",
      "Inline, `[decision.inline](decision.inline.md)` is an example too.",
      "",
      "Relates to [decision.real](decision.real.md).",
      "",
    ].join("\n");

    expect(outboundReferences(from).map((entry) => entry.target)).toEqual([
      "decision.real",
    ]);
    expect(validateBundle([from])).toEqual([
      {
        check: "body_link",
        conceptId: "decision.house-style",
        note: "body cites decision.real, which is not in the bundle",
        severity: "warning",
      },
    ]);
  });

  // The reviewer's own record proved the first fix wrong: a longer run in the
  // middle of a line re-paired every span after it.
  test("a longer backtick run does not re-pair the spans after it", () => {
    const from = record("decision.house-style");
    from.body = [
      "",
      "## Claim",
      "",
      "`](<concept-id>.md)` inside a ```markdown block is a reference, so",
      "`Relates to [decision.quoted](decision.quoted.md).` is an example.",
      "",
      "Relates to [decision.real](decision.real.md).",
      "",
    ].join("\n");

    expect(outboundReferences(from).map((entry) => entry.target)).toEqual([
      "decision.real",
    ]);
  });

  test("an unclosed fence runs to the end of the record", () => {
    const from = record("decision.truncated");
    from.body = [
      "",
      "## Claim",
      "",
      "~~~",
      "Relates to [decision.fenced](decision.fenced.md).",
      "",
    ].join("\n");

    expect(outboundReferences(from)).toEqual([]);
  });

  test("a shared anchor is not a reference", () => {
    const one = record("fact.one");
    const two = record("fact.two");
    one.frontmatter.strauss_anchors = [{ file: "src/a.ts", symbol: "run" }];
    two.frontmatter.strauss_anchors = [{ file: "src/a.ts", symbol: "run" }];

    expect(outboundReferences(one)).toEqual([]);
  });
});

describe("staleReferences", () => {
  test("reports a frontmatter-only related_to at a superseded target", () => {
    const bundle = [
      ...replacedPair(),
      record("risk.export-window", {
        status: "open",
        links: [{ target: "decision.old-way", rel: "related_to" }],
      }),
    ];

    expect(stale(bundle)).toEqual([
      {
        from: "risk.export-window",
        target: "decision.old-way",
        targetStanding: "superseded",
        origins: ["link"],
        rels: ["related_to"],
        replacedBy: ["decision.new-way"],
      },
    ]);
  });

  test("reports a frontmatter-only causal link at a rejected target", () => {
    const bundle = [
      record("decision.turned-down", { status: "rejected" }),
      record("open-question.retry-scope", {
        status: "open",
        links: [{ target: "decision.turned-down", rel: "depends_on" }],
      }),
    ];

    expect(stale(bundle)).toEqual([
      {
        from: "open-question.retry-scope",
        target: "decision.turned-down",
        targetStanding: "rejected",
        origins: ["link"],
        rels: ["depends_on"],
        replacedBy: [],
      },
    ]);
  });

  test("a body citation alone still reports, as it always did", () => {
    const bundle = [
      ...replacedPair(),
      record("decision.live", { cites: ["decision.old-way"] }),
    ];

    expect(stale(bundle)).toMatchObject([
      { from: "decision.live", origins: ["body"], rels: [] },
    ]);
  });

  test("the same pair stated both ways is one finding", () => {
    const bundle = [
      ...replacedPair(),
      record("decision.live", {
        cites: ["decision.old-way"],
        links: [{ target: "decision.old-way", rel: "related_to" }],
      }),
    ];

    expect(stale(bundle)).toMatchObject([
      {
        from: "decision.live",
        origins: ["body", "link"],
        rels: ["related_to"],
      },
    ]);
  });

  test("a replacement citing its predecessor is not a finding", () => {
    expect(stale(replacedPair())).toEqual([]);
  });

  test("a superseded or rejected referencing record is asked nothing", () => {
    const bundle = [
      ...replacedPair(),
      record("decision.also-dead", {
        status: "rejected",
        cites: ["decision.old-way"],
        links: [{ target: "decision.old-way", rel: "depends_on" }],
      }),
      record("decision.replaced-too", {
        status: "superseded",
        supersededBy: "decision.new-way",
        cites: ["decision.old-way"],
      }),
    ];

    expect(stale(bundle)).toEqual([]);
  });

  test("a resolved referencing record adjudicates as current and reports", () => {
    const bundle = [
      ...replacedPair(),
      record("risk.settled", {
        status: "resolved",
        links: [{ target: "decision.old-way", rel: "informs" }],
      }),
    ];

    expect(stale(bundle)).toMatchObject([{ from: "risk.settled" }]);
  });

  test("a current target is not a finding, either half", () => {
    const bundle = [
      record("decision.in-force"),
      record("risk.watching", {
        status: "open",
        cites: ["decision.in-force"],
        links: [{ target: "decision.in-force", rel: "related_to" }],
      }),
    ];

    expect(stale(bundle)).toEqual([]);
  });

  test("a target the bundle does not hold has no standing to report", () => {
    const bundle = [
      record("risk.watching", {
        status: "open",
        links: [{ target: "decision.absent", rel: "related_to" }],
        cites: ["decision.also-absent"],
      }),
    ];

    expect(stale(bundle)).toEqual([]);
  });

  test("names the whole replacement chain, and stops at a broken one", () => {
    const chained = [
      record("decision.v1", {
        status: "superseded",
        supersededBy: "decision.v2",
      }),
      record("decision.v2", {
        status: "superseded",
        supersededBy: "decision.v3",
        supersedes: ["decision.v1"],
      }),
      record("decision.v3", { supersedes: ["decision.v2"] }),
      record("risk.on-v1", {
        status: "open",
        links: [{ target: "decision.v1", rel: "depends_on" }],
      }),
    ];
    expect(stale(chained)[0]?.replacedBy).toEqual([
      "decision.v2",
      "decision.v3",
    ]);

    const broken = [
      record("decision.gone-head", {
        status: "superseded",
        supersededBy: "decision.never-written",
      }),
      record("risk.on-gone", {
        status: "open",
        links: [{ target: "decision.gone-head", rel: "depends_on" }],
      }),
    ];
    expect(stale(broken)[0]?.replacedBy).toEqual([]);
  });

  test("a supersession cycle does not hang the chain walk", () => {
    const bundle = [
      record("decision.a", {
        status: "superseded",
        supersededBy: "decision.b",
      }),
      record("decision.b", {
        status: "superseded",
        supersededBy: "decision.a",
      }),
      record("risk.on-a", {
        status: "open",
        links: [{ target: "decision.a", rel: "depends_on" }],
      }),
    ];

    expect(stale(bundle)[0]?.replacedBy).toEqual(["decision.b"]);
  });
});

describe("liveReferencesTo", () => {
  test("names the records still in force that point at a replaced one", () => {
    const bundle = [
      ...replacedPair(),
      record("risk.export-window", {
        status: "open",
        links: [{ target: "decision.old-way", rel: "related_to" }],
      }),
      record("decision.dead-too", {
        status: "rejected",
        cites: ["decision.old-way"],
      }),
    ];

    expect(
      liveReferencesTo("decision.old-way", bundle, standingsOf(bundle)),
    ).toEqual([
      {
        from: "risk.export-window",
        title: "risk.export-window",
        standing: "open",
        origins: ["link"],
        rels: ["related_to"],
      },
    ]);
  });
});

describe("doctor reads both halves", () => {
  test("superseded-but-cited names the rel and the replacement", () => {
    const bundle = [
      ...replacedPair(),
      record("risk.export-window", {
        status: "open",
        links: [{ target: "decision.old-way", rel: "related_to" }],
      }),
    ];

    const report = doctor(bundle, { now: NOW });
    const findings = notesIn(report, "superseded-but-cited");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.note).toBe(
      "cites superseded decision.old-way via related_to — replaced by decision.new-way",
    );
    expect(findings[0]?.reference).toMatchObject({
      from: "risk.export-window",
      target: "decision.old-way",
      origins: ["link"],
    });
  });

  test("a prose citation keeps the note it always had", () => {
    const bundle = [
      ...replacedPair(),
      record("decision.live", { cites: ["decision.old-way"] }),
    ];

    expect(
      notesIn(doctor(bundle, { now: NOW }), "superseded-but-cited")[0]?.note,
    ).toBe("cites superseded decision.old-way — replaced by decision.new-way");
  });

  test("a record reachable only through a typed link is not orphaned", () => {
    const bundle = [
      record("fact.quota"),
      record("decision.uses-quota", {
        links: [{ target: "fact.quota", rel: "depends_on" }],
      }),
    ];

    expect(
      notesIn(doctor(bundle, { now: NOW }), "orphaned").map((f) => f.conceptId),
    ).toEqual(["decision.uses-quota"]);
  });
});

describe("validate reads the body half", () => {
  test("warns on a prose citation of a record the bundle does not hold", () => {
    const problems = validateBundle([
      record("decision.live", { cites: ["fact.never-written"] }),
    ]);

    expect(problems).toEqual([
      {
        check: "body_link",
        conceptId: "decision.live",
        note: "body cites fact.never-written, which is not in the bundle",
        severity: "warning",
      },
    ]);
  });

  test("stays silent once the citation is removed", () => {
    expect(validateBundle([record("decision.live")])).toEqual([]);
  });

  test("a missing target declared both ways is reported once", () => {
    const problems = validateBundle([
      record("decision.live", {
        cites: ["fact.never-written"],
        links: [{ target: "fact.never-written", rel: "related_to" }],
      }),
    ]);

    expect(problems.map((problem) => problem.check)).toEqual(["link_target"]);
  });
});

describe("reassess without code drift", () => {
  const seed = async (store: KbStore, bundle: string) => {
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "retention",
          title: "Exports are kept for thirty days",
          why: "A shorter window loses evidence a dispute needs.",
          sections: { Decision: "Keep exports thirty days." },
        },
        "agent:writer",
        AT,
      ),
    );
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "retention-seven-days",
          title: "Exports are kept for seven days",
          why: "Storage cost outgrew the dispute window.",
          sections: { Decision: "Keep exports seven days." },
          supersedes: ["decision.retention"],
        },
        "agent:writer",
        AT,
      ),
    );
    // Frontmatter only: the risk names the old policy and says nothing about
    // it in prose, which is the shape the body-only reader never saw.
    const risk = composeRecord(
      "risk",
      {
        slug: "environment-override",
        title: "An environment override can shorten the window",
        why: "A dispute opened after the override loses its evidence.",
        sections: {
          Risk: "The window is read from the environment.",
          "Why it matters": "Evidence disappears before a dispute is filed.",
        },
      },
      "agent:writer",
      AT,
    );
    risk.frontmatter.strauss_links = [
      { target: "decision.retention", rel: "related_to" },
    ];
    await store.write(bundle, risk);
  };

  const run = (bundle: string, conceptId: string) =>
    reassessCommand.run(
      { store: new KbStore(), actor: "agent:reader", now: () => AT },
      reassessCommand.input.parse({ bundlePath: bundle, conceptId }),
    ) as Promise<KbReassessResult>;

  test("a stale-link-only risk gets a packet, with no anchors at all", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const result = await run(bundle, "risk.environment-override");

    expect(result.packet?.anchors).toEqual([]);
    expect(result.packet?.references.outgoing).toEqual([
      {
        from: "risk.environment-override",
        target: "decision.retention",
        targetStanding: "superseded",
        origins: ["link"],
        rels: ["related_to"],
        replacedBy: ["decision.retention-seven-days"],
      },
    ]);
    expect(result.packet?.default).toBe("review");

    const rendered = reassessCommand.render?.(result) ?? "";
    expect(rendered).not.toContain("nothing to reassess");
    expect(rendered).toContain("## References that no longer hold (1)");
    expect(rendered).toContain(
      "decision.retention [superseded] (link, related_to)",
    );
  });

  test("reassessing the replaced decision exposes the risk still on it", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const result = await run(bundle, "decision.retention");

    expect(result.packet?.references.incoming).toEqual([
      {
        from: "risk.environment-override",
        title: "An environment override can shorten the window",
        standing: "open",
        origins: ["link"],
        rels: ["related_to"],
      },
    ]);
    const rendered = reassessCommand.render?.(result) ?? "";
    expect(rendered).toContain("## Still pointing here (1)");
    // The referrers have no replacement of their own; this record does.
    expect(result.packet?.defaultNote).toBe(
      "no anchor drift; re-read the records still pointing here against what replaced this one",
    );
    expect(rendered).not.toContain("against what replaced them");
  });

  // The packet the change exists for: the replaced decision, whose readers have
  // to be found. `incoming` is one hop; a dependant further down the causal
  // chain is only in `impact`.
  test("a references-only packet still carries the record's dependants", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "export-job-window",
          title: "The export job reads the retention window",
          why: "The job would keep exports the policy says to drop.",
          sections: { Decision: "Read the window from the policy." },
          links: [{ target: "decision.retention", rel: "depends_on" }],
        },
        "agent:writer",
        AT,
      ),
    );

    const result = await run(bundle, "decision.retention");

    expect(result.packet?.anchors).toEqual([]);
    expect(result.packet?.impact).toMatchObject([
      { conceptId: "decision.export-job-window", depth: 1 },
    ]);
  });

  // The section header states a count. A title is another record's text, so a
  // newline in one must fill a row, never forge one.
  test("a referrer's title cannot forge a row in the report", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const file = join(bundle, "risk.environment-override.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "title: An environment override can shorten the window",
        String.raw`title: "Innocent\u001B\n- decision.forged [current] (link) - not a real row"`,
      ),
      "utf8",
    );

    const rendered =
      reassessCommand.render?.(await run(bundle, "decision.retention")) ?? "";
    const rows = rendered
      .split("\n")
      .filter((line) => line.startsWith("- ") && line.includes("[open]"));

    expect(rendered).toContain("## Still pointing here (1)");
    expect(rows).toHaveLength(1);
    expect(rendered).not.toContain("\u001b");
    // The forged text survives as text on the one real row, which is the point.
    expect(
      rendered.split("\n").some((line) => line.startsWith("- decision.forged")),
    ).toBe(false);
  });

  test("a record with no drift and no stale reference has nothing to reassess", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const result = await run(bundle, "decision.retention-seven-days");

    expect(result.packet).toBeNull();
    expect(reassessCommand.render?.(result) ?? "").toContain(
      "nothing to reassess",
    );
  });

  test("removing the reference clears the finding, and nothing was written", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const before = readFileSync(join(bundle, LOG_FILE), "utf8");

    const found = await run(bundle, "risk.environment-override");
    expect(found.packet?.references.outgoing).toHaveLength(1);
    expect(readFileSync(join(bundle, LOG_FILE), "utf8")).toBe(before);

    // The authorized update: the author retargets the link at what replaced
    // the old policy. `reassess` never does this itself.
    const file = join(bundle, "risk.environment-override.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "target: decision.retention\n",
        "target: decision.retention-seven-days\n",
      ),
      "utf8",
    );

    expect((await run(bundle, "risk.environment-override")).packet).toBeNull();
  });
});

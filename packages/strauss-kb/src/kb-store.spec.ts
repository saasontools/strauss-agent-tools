/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, vi, test as baseTest } from "vitest";
import { composeRecord, type ComposeInput } from "./compose.js";
import {
  composeDecisionRecord,
  composeNoDecisionRecord,
  isNoDecisionRecord,
  selectDecisions,
  type DecisionInput,
} from "./decision-record.js";
import { DEFAULT_LOAD_MAX_RECORDS, KbStore } from "./kb-store.js";
import {
  KbInvalidConceptIdError,
  KbRecordAlreadyExistsError,
  KbRecordNotFoundError,
  KbSelfVerificationError,
  KbWriteConflictError,
} from "./kb-errors.js";
import { INDEX_FILE } from "./kb-index.js";
import { LOG_FILE } from "./kb-log.js";
import type { KbRecord } from "./kb-record.schema.js";
import { stringifyMarkdownWithFrontmatter } from "./markdown.js";
import { validateBundle } from "./validate.js";

/**
 * Isolates the store's private `markSuperseded` for conflict-injection tests
 * — its signature, not `any`, is what's asserted through the `unknown` cast.
 */
type WithMarkSuperseded = {
  markSuperseded(
    bundlePath: string,
    conceptId: string,
    replacementId: string,
    actor: string,
  ): Promise<KbRecord>;
};

/**
 * `parse` runs between `mutate`'s first read and its witness read, so a spy
 * that rewrites the file on disk inside it stages a genuine concurrent write.
 */
type WithParse = {
  parse(conceptId: string, raw: string): KbRecord | null;
};

interface Ctx {
  bundle: string;
  store: KbStore;
}

const test = baseTest.extend<Ctx>({
  bundle: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "strauss-kb-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  store: async ({}, use) => {
    await use(new KbStore());
  },
});

const WRITTEN_BY = "test-writer";
const WRITTEN_AT = "2026-08-02T09:14:00Z";

function decision(overrides: Partial<DecisionInput> = {}) {
  return composeDecisionRecord(
    {
      slug: "region-in-cache-key",
      title: "Region is part of the cache key",
      why: "The cache is shared across regions, so a region-less key serves one region another region's data.",
      alternative:
        "A cache per region — one more thing to provision, and it drifts.",
      verify: ["no cache key omits the region"],
      anchors: [
        {
          file: "src/cache/order-cache.ts",
          symbol: "OrderCache.get",
        },
      ],
      ...overrides,
    },
    WRITTEN_BY,
    WRITTEN_AT,
  );
}

function fact(slug: string, overrides: Partial<ComposeInput> = {}) {
  return composeRecord(
    "fact",
    {
      slug,
      title: `Fact ${slug}`,
      why: "Something observed.",
      sections: { Claim: "The claim.", Evidence: "The evidence." },
      ...overrides,
    },
    WRITTEN_BY,
    WRITTEN_AT,
  );
}

describe("KbStore", () => {
  test("writes a record whose concept id is its path minus .md", async ({
    store,
    bundle,
  }) => {
    const written = await store.write(bundle, decision());

    expect(written.conceptId).toBe("decision.region-in-cache-key");
    const raw = readFileSync(
      join(bundle, "decision.region-in-cache-key.md"),
      "utf8",
    );
    expect(raw).toContain("type: decision");
    expect(raw).toContain("strauss_status: accepted");
  });

  test("addresses the bundle by path, so two bundles stay independent", async ({
    store,
    bundle,
  }) => {
    const other = join(bundle, "nested", "kb");
    mkdirSync(other, { recursive: true });

    await store.write(bundle, decision());
    await store.write(other, fact("only-over-here"));

    expect((await store.list(bundle)).map((r) => r.conceptId)).toEqual([
      "decision.region-in-cache-key",
    ]);
    expect((await store.list(other)).map((r) => r.conceptId)).toEqual([
      "fact.only-over-here",
    ]);
  });

  test("refuses a second write to the same concept id", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, decision());

    const rejection = await store
      .write(bundle, decision({ title: "A different decision" }))
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(KbRecordAlreadyExistsError);
    // 409 rather than a message match: the caller retries a collision with a
    // different slug, and gives up on a 400.
    expect((rejection as KbRecordAlreadyExistsError).code).toBe(409);
  });

  test("rejects a slug that is not kebab-case", async ({ store, bundle }) => {
    const rejection = await store
      .write(bundle, decision({ slug: "Not A Slug" }))
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(KbInvalidConceptIdError);
    // 400, not 409: no retry with a different slug rescues malformed input.
    expect((rejection as KbInvalidConceptIdError).code).toBe(400);
  });

  // The concept id names one file directly under the bundle root; a separator
  // would let a caller write outside it.
  test("refuses a concept id containing a path separator", async ({
    store,
    bundle,
  }) => {
    const rejection = await store
      .read(bundle, "../../etc/passwd")
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(KbInvalidConceptIdError);
  });

  test("preserves unknown frontmatter keys, as OKF requires", async ({
    store,
    bundle,
  }) => {
    writeFileSync(
      join(bundle, "fact.foreign.md"),
      [
        "---",
        "type: fact",
        "title: Written by another producer",
        "their_extension: keep me",
        "---",
        "Body.",
        "",
      ].join("\n"),
    );

    const read = await store.read(bundle, "fact.foreign");
    expect(read?.frontmatter.their_extension).toBe("keep me");
  });

  // OKF calls a concept carrying only `type` fully conformant, so a missing
  // status must not make a record unreadable.
  test("defaults the status of a record that carries none", async ({
    store,
    bundle,
  }) => {
    writeFileSync(
      join(bundle, "fact.bare.md"),
      ["---", "type: fact", "---", "Body.", ""].join("\n"),
    );

    const read = await store.read(bundle, "fact.bare");
    expect(read?.frontmatter.strauss_status).toBe("draft");
  });

  test("moves a status and leaves the rest of the record alone", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, decision());
    const moved = await store.setStatus(
      bundle,
      "decision.region-in-cache-key",
      "rejected",
    );

    expect(moved.frontmatter.strauss_status).toBe("rejected");
    expect(moved.frontmatter.title).toBe("Region is part of the cache key");
    expect(moved.frontmatter.strauss_anchors).toHaveLength(1);
  });

  test("reports a mutation against a record that does not exist", async ({
    store,
    bundle,
  }) => {
    const rejection = await store
      .setStatus(bundle, "fact.absent", "accepted")
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(KbRecordNotFoundError);
    expect((rejection as KbRecordNotFoundError).code).toBe(404);
  });

  test("links both directions when superseding", async ({ store, bundle }) => {
    await store.write(bundle, fact("auth-throws"));
    await store.write(bundle, fact("auth-retries"));

    await store.supersede(bundle, "fact.auth-throws", "fact.auth-retries");

    const old = await store.read(bundle, "fact.auth-throws");
    const replacement = await store.read(bundle, "fact.auth-retries");

    expect(old?.frontmatter.strauss_status).toBe("superseded");
    expect(old?.frontmatter.strauss_superseded_by).toBe("fact.auth-retries");
    // The backlink is written here rather than left for a validator to miss.
    expect(replacement?.frontmatter.strauss_supersedes).toEqual([
      "fact.auth-throws",
    ]);
    expect(validateBundle(await store.list(bundle))).toEqual([]);
  });

  test("marks the prior record superseded when written with supersedes", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("auth-throws"));

    const written = await store.write(
      bundle,
      fact("auth-retries", { supersedes: ["fact.auth-throws"] }),
    );

    expect(written.action).toBe("superseded-prior");
    expect(written.supersededIds).toEqual(["fact.auth-throws"]);

    const old = await store.read(bundle, "fact.auth-throws");
    const replacement = await store.read(bundle, "fact.auth-retries");

    expect(old?.frontmatter.strauss_status).toBe("superseded");
    expect(old?.frontmatter.strauss_superseded_by).toBe("fact.auth-retries");
    expect(replacement?.frontmatter.strauss_supersedes).toEqual([
      "fact.auth-throws",
    ]);
    expect(validateBundle(await store.list(bundle))).toEqual([]);

    const { entries } = await store.readLog(bundle);
    expect(entries.map((entry) => [entry.conceptId, entry.operation])).toEqual([
      ["fact.auth-throws", "write"],
      ["fact.auth-retries", "write"],
      ["fact.auth-throws", "supersede"],
    ]);
  });

  test("reports 'created' and an empty list when supersedes is absent", async ({
    store,
    bundle,
  }) => {
    const written = await store.write(bundle, fact("standalone"));

    expect(written.action).toBe("created");
    expect(written.supersededIds).toEqual([]);
  });

  test("marks the prior record superseded through write-decision's own path", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("region-only-key"));

    const written = await store.write(
      bundle,
      decision({
        slug: "region-and-account-key",
        supersedes: ["fact.region-only-key"],
      }),
    );

    expect(written.action).toBe("superseded-prior");
    expect(written.supersededIds).toEqual(["fact.region-only-key"]);

    const old = await store.read(bundle, "fact.region-only-key");
    expect(old?.frontmatter.strauss_status).toBe("superseded");
    expect(old?.frontmatter.strauss_superseded_by).toBe(
      "decision.region-and-account-key",
    );
    expect(validateBundle(await store.list(bundle))).toEqual([]);
  });

  // Broken links are legal (compose.ts): a supersedes id may name a record not
  // yet written. The write must still succeed, and validate — not write — is
  // the one that reports the missing target.
  test("does not fail the write when a supersedes target does not exist", async ({
    store,
    bundle,
  }) => {
    const written = await store.write(
      bundle,
      fact("auth-retries", { supersedes: ["fact.does-not-exist"] }),
    );

    expect(written.action).toBe("created");
    expect(written.supersededIds).toEqual([]);

    const problems = validateBundle(await store.list(bundle));
    expect(problems).toContainEqual({
      check: "supersedes",
      conceptId: "fact.auth-retries",
      note: "target fact.does-not-exist is missing",
    });
  });

  // Reachable through kb_write: a record naming its own concept id would
  // otherwise mark itself superseded-by-itself the instant it's published.
  test("ignores a record naming its own concept id in supersedes", async ({
    store,
    bundle,
  }) => {
    const written = await store.write(
      bundle,
      fact("self-referential", { supersedes: ["fact.self-referential"] }),
    );

    expect(written.action).toBe("created");
    expect(written.supersededIds).toEqual([]);

    const read = await store.read(bundle, "fact.self-referential");
    expect(read?.frontmatter.strauss_status).not.toBe("superseded");
  });

  test("marks a duplicated id in supersedes once, not once per occurrence", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("auth-throws"));

    const written = await store.write(
      bundle,
      fact("auth-retries", {
        supersedes: ["fact.auth-throws", "fact.auth-throws"],
      }),
    );

    expect(written.supersededIds).toEqual(["fact.auth-throws"]);

    const { entries } = await store.readLog(bundle);
    expect(
      entries.filter(
        (entry) =>
          entry.conceptId === "fact.auth-throws" &&
          entry.operation === "supersede",
      ),
    ).toHaveLength(1);
  });

  test("retries a CAS conflict marking a superseded target, then succeeds", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("auth-throws"));

    const internal = store as unknown as WithMarkSuperseded;
    const original = internal.markSuperseded.bind(internal);
    let calls = 0;
    vi.spyOn(internal, "markSuperseded").mockImplementation(async (...args) => {
      calls += 1;
      if (calls < 3) throw new KbWriteConflictError(args[1]);
      return original(...args);
    });

    const written = await store.write(
      bundle,
      fact("auth-retries", { supersedes: ["fact.auth-throws"] }),
    );

    expect(calls).toBe(3);
    expect(written.action).toBe("superseded-prior");
    expect(written.supersededIds).toEqual(["fact.auth-throws"]);
  });

  // The new record is already published by the time the loop hits a
  // permanent conflict, so the write must still succeed — only the residue
  // is reported, via `supersededIds` and, downstream, `kb_validate`.
  test("gives up marking superseded after repeated CAS conflicts, without failing the write", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("auth-throws"));

    const internal = store as unknown as WithMarkSuperseded;
    vi.spyOn(internal, "markSuperseded").mockRejectedValue(
      new KbWriteConflictError("fact.auth-throws"),
    );

    const written = await store.write(
      bundle,
      fact("auth-retries", { supersedes: ["fact.auth-throws"] }),
    );

    expect(written.action).toBe("created");
    expect(written.supersededIds).toEqual([]);

    const persisted = await store.read(bundle, "fact.auth-retries");
    expect(persisted).not.toBeNull();
  });

  test("answers an open question, appending the answer to the body", async ({
    store,
    bundle,
  }) => {
    await store.write(
      bundle,
      composeRecord(
        "open-question",
        {
          slug: "retry-scope",
          title: "Which failures should the client retry?",
          why: "Scope decides how much of the client needs a backoff.",
          sections: {
            Question: "Which failure classes must the client retry?",
          },
        },
        WRITTEN_BY,
        WRITTEN_AT,
      ),
    );

    const answered = await store.answer(
      bundle,
      "open-question.retry-scope",
      "Timeouts and 5xx only.",
      "assaf",
    );

    expect(answered.frontmatter.strauss_status).toBe("resolved");
    expect(answered.frontmatter.strauss_answered?.by).toBe("assaf");
    expect(answered.body).toContain("## Answer");
    expect(answered.body).toContain("Timeouts and 5xx only.");
  });
});

describe("verify", () => {
  // The noteless first event and the passthrough key on the second stand in
  // for OKF-native entries a foreign producer may have written.
  const PRIOR_EVENTS = [
    { by: "agent:researcher", at: "2026-08-01T00:00:00Z" },
    {
      by: "human:dana",
      at: "2026-08-02T00:00:00Z",
      note: "spot-checked the claim",
      their_extension: "kept",
    },
  ];

  function seed(
    bundle: string,
    generatedBy: string,
    verified: Record<string, unknown>[] = [],
  ): string {
    writeFileSync(
      join(bundle, "fact.two-checks.md"),
      stringifyMarkdownWithFrontmatter("The claim.\n", {
        type: "fact",
        title: "A fact with a history",
        generated: { by: generatedBy, at: WRITTEN_AT },
        verified,
        strauss_status: "accepted",
      }),
    );
    return "fact.two-checks";
  }

  test("appends one event and leaves the prior ones untouched", async ({
    store,
    bundle,
  }) => {
    const id = seed(bundle, "agent:writer", PRIOR_EVENTS);

    const updated = await store.verify(
      bundle,
      id,
      "Re-ran the check against main.",
      "agent:checker",
      "2026-08-03T00:00:00Z",
    );

    expect(updated.frontmatter.verified).toEqual([
      ...PRIOR_EVENTS,
      {
        by: "agent:checker",
        at: "2026-08-03T00:00:00Z",
        note: "Re-ran the check against main.",
      },
    ]);

    const persisted = await store.read(bundle, id);
    expect(persisted?.frontmatter.verified).toEqual(
      updated.frontmatter.verified,
    );

    const { entries } = await store.readLog(bundle);
    expect(entries.at(-1)).toMatchObject({
      operation: "verify",
      conceptId: id,
      by: "agent:checker",
    });
  });

  // Case drift anywhere in the actor — `Agent:Claude` vs `agent:claude` —
  // must not mint a distinct verifier identity.
  test("refuses a non-human actor verifying its own record, and logs it", async ({
    store,
    bundle,
  }) => {
    const id = seed(bundle, "agent:claude");

    const rejection = await store
      .verify(bundle, id, "Looks right to me.", "Agent:Claude")
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(KbSelfVerificationError);
    expect((rejection as KbSelfVerificationError).code).toBe(400);
    // The message names the record's generator, not the refused verifier.
    expect((rejection as KbSelfVerificationError).message).toContain(
      "generated by agent:claude",
    );

    // The refusal never publishes, but it does leave its own log entry.
    const persisted = await store.read(bundle, id);
    expect(persisted?.frontmatter.verified).toEqual([]);

    const { entries } = await store.readLog(bundle);
    expect(entries.at(-1)).toMatchObject({
      operation: "verify:refused",
      conceptId: id,
      by: "Agent:Claude",
    });
  });

  // Only the kind prefix is case-normalized: `Human:` is `human:`, and a
  // person restating their own record is a legitimate check.
  test("lets Human:alice verify what human:alice generated", async ({
    store,
    bundle,
  }) => {
    const id = seed(bundle, "human:alice");

    const updated = await store.verify(
      bundle,
      id,
      "Still holds after the rewrite.",
      "Human:alice",
      "2026-08-03T00:00:00Z",
    );

    expect(updated.frontmatter.verified).toEqual([
      {
        by: "Human:alice",
        at: "2026-08-03T00:00:00Z",
        note: "Still holds after the rewrite.",
      },
    ]);
  });

  test("rejects an empty or whitespace-only note before touching the record", async ({
    store,
    bundle,
  }) => {
    const id = seed(bundle, "agent:writer");

    for (const note of ["", "   "]) {
      await expect(
        store.verify(bundle, id, note, "agent:checker"),
      ).rejects.toThrow();
    }

    const persisted = await store.read(bundle, id);
    expect(persisted?.frontmatter.verified).toEqual([]);
  });

  test("surfaces a concurrent write as the conflict error", async ({
    store,
    bundle,
  }) => {
    const id = seed(bundle, "agent:writer");

    const internal = store as unknown as WithParse;
    const original = internal.parse.bind(internal);
    vi.spyOn(internal, "parse").mockImplementation((conceptId, raw) => {
      writeFileSync(join(bundle, `${conceptId}.md`), `${raw}\n`);
      return original(conceptId, raw);
    });

    const rejection = await store
      .verify(bundle, id, "A check that loses the race.", "agent:checker")
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(KbWriteConflictError);
    expect((rejection as KbWriteConflictError).code).toBe(409);
  });
});

describe("INDEX.md", () => {
  test("is written from the records and repaired when it drifts", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, decision());
    await store.write(bundle, fact("cursor-scans"));

    writeFileSync(join(bundle, INDEX_FILE), "# KB Index\n\n- stale nonsense\n");
    const repaired = await store.readIndex(bundle);

    expect(repaired).toContain("decision.region-in-cache-key.md");
    expect(repaired).toContain("fact.cursor-scans.md");
    expect(repaired).not.toContain("stale nonsense");
    expect(readFileSync(join(bundle, INDEX_FILE), "utf8")).toBe(repaired);
  });

  // A title does not tell a reader whether a record is worth opening.
  test("carries the description, not only the title", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, decision());

    expect(await store.readIndex(bundle)).toContain(
      "The cache is shared across regions",
    );
  });

  // Both store-owned files are markdown. Left in the listing they parse to
  // null and vanish — but only after warning that the bundle holds a malformed
  // record, which sends a reader looking for a problem that is not there.
  test("neither store-owned file is listed as a record", async ({ bundle }) => {
    const warnings: Record<string, unknown>[] = [];
    const quiet = new KbStore({ warn: (entry) => warnings.push(entry) });

    await quiet.write(bundle, decision());
    await quiet.readIndex(bundle);

    expect((await quiet.list(bundle)).map((r) => r.conceptId)).toEqual([
      "decision.region-in-cache-key",
    ]);
    expect(warnings).toEqual([]);
  });
});

describe("log.jsonl", () => {
  test("appends one line per mutation", async ({ store, bundle }) => {
    await store.write(bundle, fact("one"));
    await store.write(bundle, fact("two"));
    await store.setStatus(bundle, "fact.one", "rejected");

    const { entries, malformed } = await store.readLog(bundle);

    expect(malformed).toEqual([]);
    expect(entries.map((entry) => entry.operation)).toEqual([
      "write",
      "write",
      "status:rejected",
    ]);
    expect(entries[0]?.conceptId).toBe("fact.one");
  });

  // The log is the only bundle artifact nothing else can reconstruct, so a bad
  // line is reported and left in place rather than repaired away.
  test("reports a malformed line without rewriting it", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("one"));
    const before = readFileSync(join(bundle, LOG_FILE), "utf8");
    writeFileSync(join(bundle, LOG_FILE), `${before}garbage line\n`);

    const { entries, malformed } = await store.readLog(bundle);

    expect(entries).toHaveLength(1);
    expect(malformed).toEqual([{ line: 2, text: "garbage line" }]);
    expect(readFileSync(join(bundle, LOG_FILE), "utf8")).toContain(
      "garbage line",
    );
  });

  // Well-formed JSON that is not a log entry is malformed too — otherwise the
  // shape is only enforced on write, and a hand-edit slips a stranger through.
  test("reports JSON that does not match the entry schema", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("one"));
    const before = readFileSync(join(bundle, LOG_FILE), "utf8");
    writeFileSync(join(bundle, LOG_FILE), `${before}{"at":"now"}\n`);

    const { entries, malformed } = await store.readLog(bundle);

    expect(entries).toHaveLength(1);
    expect(malformed).toEqual([{ line: 2, text: '{"at":"now"}' }]);
  });

  // A separator-delimited line could not carry a value containing the
  // separator; JSON can, which is why the parser went away.
  test("round-trips a value that would have broken a delimited line", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("one"), "agent · with · dots");

    const { entries, malformed } = await store.readLog(bundle);
    expect(malformed).toEqual([]);
    expect(entries[0]?.by).toBe("agent · with · dots");
  });

  test("leaves no staging file behind", async ({ store, bundle }) => {
    await store.write(bundle, decision());
    await store.write(bundle, { ...decision(), overwrite: true });

    expect(readdirSync(bundle).sort()).toEqual(
      ["decision.region-in-cache-key.md", LOG_FILE].sort(),
    );
  });
});

describe("composeRecord", () => {
  test("renders the type’s sections in order and omits the empty ones", () => {
    const composed = composeRecord(
      "risk",
      {
        slug: "fake-clock-no-timers",
        title: "The E2E fake clock does not advance timers",
        why: "The E2E suite would pass against behaviour production does not have.",
        sections: {
          Risk: "Nothing advances a pending timer.",
          Mitigation: "Cover expiry against a real clock in staging only.",
        },
      },
      WRITTEN_BY,
      WRITTEN_AT,
    );

    expect(composed.body).toContain("## Risk");
    expect(composed.body).toContain("## Mitigation");
    // "Why it matters" was not supplied; an empty heading would read as an
    // answer rather than an omission.
    expect(composed.body).not.toContain("## Why it matters");
    expect(composed.body.indexOf("## Risk")).toBeLessThan(
      composed.body.indexOf("## Mitigation"),
    );
  });

  test("carries stale_after into frontmatter and rejects a malformed one", () => {
    const composed = composeRecord(
      "fact",
      {
        slug: "vendor-quota",
        title: "Vendor quota is 100 rps",
        why: "Sizing depends on it.",
        stale_after: "2027-02-16",
      },
      WRITTEN_BY,
      WRITTEN_AT,
    );

    expect(composed.frontmatter.stale_after).toBe("2027-02-16");

    expect(() =>
      composeRecord(
        "fact",
        { slug: "x", title: "X", why: "Y", stale_after: "soonish" },
        WRITTEN_BY,
        WRITTEN_AT,
      ),
    ).toThrow(/YYYY-MM-DD/);
  });

  test("refuses a section the type does not define", () => {
    expect(() =>
      composeRecord(
        "fact",
        {
          slug: "x",
          title: "X",
          why: "Y",
          sections: { Mitigation: "wrong type" },
        },
        WRITTEN_BY,
        WRITTEN_AT,
      ),
    ).toThrow(/no section Mitigation/);
  });

  test("starts each type at its own status", () => {
    expect(fact("a").frontmatter.strauss_status).toBe("accepted");
    expect(
      composeRecord(
        "open-question",
        { slug: "q", title: "Q", why: "W" },
        WRITTEN_BY,
        WRITTEN_AT,
      ).frontmatter.strauss_status,
    ).toBe("open");
  });

  test("rejects a supersedes array beyond the cap", () => {
    expect(() =>
      composeRecord(
        "fact",
        {
          slug: "x",
          title: "X",
          why: "Y",
          supersedes: Array.from({ length: 33 }, (_, i) => `fact.s-${i}`),
        },
        WRITTEN_BY,
        WRITTEN_AT,
      ),
    ).toThrow();
  });

  test("rejects a related concept id that would emit a broken link", () => {
    expect(() =>
      composeDecisionRecord(
        {
          slug: "x",
          title: "X",
          why: "Y",
          relatedConceptIds: ["not a [concept] id"],
        },
        WRITTEN_BY,
        WRITTEN_AT,
      ),
    ).toThrow();
  });

  test("renders related concepts as body links, which OKF reads as edges", () => {
    const composed = composeDecisionRecord(
      { ...decisionInput(), relatedConceptIds: ["flow.cache-fill"] },
      WRITTEN_BY,
      WRITTEN_AT,
    );

    expect(composed.body).toContain("[flow.cache-fill](flow.cache-fill.md)");
  });

  test("keys source footnotes to the sources[].id", () => {
    const composed = composeDecisionRecord(
      {
        ...decisionInput(),
        sources: [
          {
            id: "cache-design",
            resource: "docs/cache-design.md",
            title: "Cache design note",
          },
        ],
      },
      WRITTEN_BY,
      WRITTEN_AT,
    );

    expect(composed.frontmatter.sources).toHaveLength(1);
    expect(composed.body).toContain("[^cache-design]: Cache design note");
  });

  // Spelled as a sentinel inside the reference list, "no source" would make
  // `sources` unable to be legitimately empty. As a field it can be.
  test("records an unsourced claim as a field, not a fake source", () => {
    const composed = composeRecord(
      "assumption",
      {
        slug: "worker-runs-single-region",
        title: "The worker runs in one region",
        why: "Multi-region would change the locking story.",
        assumption: true,
      },
      WRITTEN_BY,
      WRITTEN_AT,
    );

    expect(composed.frontmatter.strauss_assumption).toBe(true);
    expect(composed.frontmatter.sources).toBeUndefined();
  });
});

describe("decisions", () => {
  test("composes the no-decision claim under a reserved slug", async ({
    store,
    bundle,
  }) => {
    const written = await store.write(
      bundle,
      composeNoDecisionRecord("nothing to decide", WRITTEN_BY, WRITTEN_AT),
    );

    expect(written.conceptId).toBe("decision.none");
    expect(isNoDecisionRecord(written)).toBe(true);
  });

  test("excludes the no-decision claim from the decisions", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, decision());
    await store.write(
      bundle,
      composeNoDecisionRecord("nothing to decide", WRITTEN_BY, WRITTEN_AT),
    );

    const decisions = selectDecisions(await store.list(bundle, "decision"));
    expect(decisions.map((record) => record.conceptId)).toEqual([
      "decision.region-in-cache-key",
    ]);
  });
});

describe("validateBundle", () => {
  test("finds a supersession pointer with no partner", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("orphan"));
    await store.setStatus(bundle, "fact.orphan", "superseded");

    const problems = validateBundle(await store.list(bundle));
    expect(problems).toEqual([
      {
        check: "superseded_by",
        conceptId: "fact.orphan",
        note: "superseded with no replacement",
      },
    ]);
  });

  // OKF permits any type, so a stranger's record is a note rather than a fault.
  test("notes an unrecognised type without failing the record", async ({
    store,
    bundle,
  }) => {
    writeFileSync(
      join(bundle, "glossary.term.md"),
      ["---", "type: glossary", "---", "Body.", ""].join("\n"),
    );

    const problems = validateBundle(await store.list(bundle));
    expect(problems).toEqual([
      {
        check: "type",
        conceptId: "glossary.term",
        note: 'unrecognised type "glossary"',
      },
    ]);
  });
});

function decisionInput(): DecisionInput {
  return {
    slug: "region-in-cache-key",
    title: "Region is part of the cache key",
    why: "The cache is shared across regions.",
  };
}

describe("load", () => {
  test("hands over the whole base with standing attached", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, decision());
    await store.write(bundle, fact("cursor-scans"));

    const result = await store.load(bundle);

    expect(result.loaded).toBe(true);
    if (!result.loaded) return;
    expect(result.recordCount).toBe(2);
    expect(result.tokensLoaded).toBeGreaterThan(0);
    expect(result.records.map((hit) => hit.standing)).toEqual([
      "current",
      "current",
    ]);
  });

  // A truncated base is indistinguishable from a complete one, so a caller
  // would answer "that was never decided" from a slice it did not know was one.
  test("refuses rather than truncating when over budget", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, decision());

    const result = await store.load(bundle, { budgetTokens: 1 });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.recordCount).toBe(1);
    expect(result.approxTokens).toBeGreaterThan(1);
    expect(result).not.toHaveProperty("records");
  });

  test("narrows to a type but adjudicates against the whole base", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("auth-throws"));
    await store.write(bundle, fact("auth-retries"));
    await store.write(bundle, decision());
    await store.supersede(bundle, "fact.auth-throws", "fact.auth-retries");

    const result = await store.load(bundle, { type: "fact" });

    expect(result.loaded).toBe(true);
    if (!result.loaded) return;
    expect(result.recordCount).toBe(2);
    expect(result.superseded.map((entry) => entry.conceptId)).toEqual([
      "fact.auth-throws",
    ]);
    expect(result.superseded[0]?.supersededBy).toEqual(["fact.auth-retries"]);
  });

  // Standing is a qualifier on a body, and over a long session the body
  // outlives the qualifier. A stub leaves nothing to act on.
  test("names superseded records instead of spelling them out", async ({
    store,
    bundle,
  }) => {
    await store.write(
      bundle,
      fact("auth-throws", {
        sections: { Claim: "The claim.", Evidence: "Only the stale one says." },
      }),
    );
    await store.write(bundle, fact("auth-retries"));
    await store.supersede(bundle, "fact.auth-throws", "fact.auth-retries");

    const result = await store.load(bundle);

    expect(result.loaded).toBe(true);
    if (!result.loaded) return;
    expect(result.records.map((hit) => hit.record.conceptId)).toEqual([
      "fact.auth-retries",
    ]);
    expect(result.superseded).toEqual([
      {
        conceptId: "fact.auth-throws",
        title: "Fact auth-throws",
        supersededBy: ["fact.auth-retries"],
        at: WRITTEN_AT,
      },
    ]);
    // The count stays over the whole base: a stub is still a record the caller
    // has been told about.
    expect(result.recordCount).toBe(2);
    expect(JSON.stringify(result)).not.toContain("Only the stale one says.");
  });

  // A rejected record is the answer to "why didn't you just do X" — the
  // question a diff destroys hardest. Stubbing it would delete the best
  // content in the base to save tokens.
  test("keeps rejected, open and unsettled records whole", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("shared-cache"));
    await store.write(bundle, fact("draft-thing"));
    await store.setStatus(bundle, "fact.shared-cache", "rejected");
    await store.setStatus(bundle, "fact.draft-thing", "draft");

    const result = await store.load(bundle);

    expect(result.loaded).toBe(true);
    if (!result.loaded) return;
    expect(result.superseded).toEqual([]);
    expect(result.records.map((hit) => hit.standing).sort()).toEqual([
      "rejected",
      "unsettled",
    ]);
    for (const hit of result.records) {
      expect(hit.record.body).toContain("The evidence.");
    }
  });

  // Costing the full bodies would refuse a base that fits once the superseded
  // ones are stubs.
  test("measures the budget against what it hands back", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("kept"));
    await store.write(bundle, fact("dropped"));

    const whole = await store.load(bundle);
    expect(whole.loaded).toBe(true);
    if (!whole.loaded) return;

    await store.supersede(bundle, "fact.dropped", "fact.kept");
    const stubbed = await store.load(bundle);
    expect(stubbed.loaded).toBe(true);
    if (!stubbed.loaded) return;

    expect(stubbed.tokensLoaded).toBeLessThan(whole.tokensLoaded);
    // And the smaller figure is the one the budget is held against.
    const result = await store.load(bundle, {
      budgetTokens: stubbed.tokensLoaded,
    });
    expect(result.loaded).toBe(true);
  });

  test("an empty base loads as empty rather than refusing", async ({
    store,
    bundle,
  }) => {
    const result = await store.load(bundle);

    expect(result.loaded).toBe(true);
    expect(result.recordCount).toBe(0);
  });

  // The default budget is the guardrail an agent hits by accident; `all` is
  // the explicit override for an operator who has decided to pay for it.
  test("all loads a base over the default budget without refusing", async ({
    store,
    bundle,
  }) => {
    await writeOverBudgetBundle(store, bundle);

    const refused = await store.load(bundle);
    expect(refused.loaded).toBe(false);

    const result = await store.load(bundle, { all: true });

    expect(result.loaded).toBe(true);
    if (!result.loaded) return;
    expect(result.recordCount).toBe(OVER_BUDGET_RECORD_COUNT);
    expect(result.records).toHaveLength(OVER_BUDGET_RECORD_COUNT);
    expect(result.tokensLoaded).toBeGreaterThan(25_000);
    expect(result.budgetTokens).toBeNull();
  });

  test("all leaves standing adjudication untouched", async ({
    store,
    bundle,
  }) => {
    await writeOverBudgetBundle(store, bundle);
    await store.write(bundle, fact("auth-throws"));
    await store.write(bundle, fact("auth-retries"));
    await store.write(bundle, fact("shared-cache"));
    await store.supersede(bundle, "fact.auth-throws", "fact.auth-retries");
    await store.setStatus(bundle, "fact.shared-cache", "rejected");

    const result = await store.load(bundle, { all: true });

    expect(result.loaded).toBe(true);
    if (!result.loaded) return;
    expect(result.superseded.map((entry) => entry.conceptId)).toEqual([
      "fact.auth-throws",
    ]);
    const rejected = result.records.find(
      (hit) => hit.record.conceptId === "fact.shared-cache",
    );
    expect(rejected?.standing).toBe("rejected");
    expect(rejected?.record.body).toContain("The evidence.");
  });

  // The gate is a second ceiling beside the budget, not a restatement of it:
  // many short records fit the tokens and still read as a skim.
  describe("the record gate", () => {
    test("refuses past the gate while comfortably under the budget", async ({
      store,
      bundle,
    }) => {
      for (let i = 0; i < 3; i++) await store.write(bundle, fact(`short-${i}`));

      const result = await store.load(bundle, { maxRecords: 2 });

      expect(result.loaded).toBe(false);
      if (result.loaded) return;
      expect(result.refusedBy).toEqual(["pages"]);
      expect(result.pageCount).toBe(3);
      expect(result.maxRecords).toBe(2);
      expect(result.approxTokens).toBeLessThan(result.budgetTokens);
      expect(result).not.toHaveProperty("records");
    });

    // Off-by-one here is the difference between a gate and a suggestion.
    test("at the gate loads; one past it refuses", async ({
      store,
      bundle,
    }) => {
      for (let i = 0; i < 2; i++) await store.write(bundle, fact(`short-${i}`));

      expect((await store.load(bundle, { maxRecords: 2 })).loaded).toBe(true);

      await store.write(bundle, fact("short-2"));
      expect((await store.load(bundle, { maxRecords: 2 })).loaded).toBe(false);
    });

    // Held against the pages a reader would actually read. A superseded record
    // arrives as a one-line stub, so counting it would refuse a base that is
    // in fact small.
    test("counts pages, not stubs", async ({ store, bundle }) => {
      await store.write(bundle, fact("auth-throws"));
      await store.write(bundle, fact("auth-retries"));
      await store.write(bundle, fact("shared-cache"));
      await store.supersede(bundle, "fact.auth-throws", "fact.auth-retries");

      const result = await store.load(bundle, { maxRecords: 2 });

      expect(result.loaded).toBe(true);
      if (!result.loaded) return;
      expect(result.recordCount).toBe(3);
      expect(result.records).toHaveLength(2);
    });

    test("defaults to 40 pages", async ({ store, bundle }) => {
      expect(DEFAULT_LOAD_MAX_RECORDS).toBe(40);
      for (let i = 0; i < DEFAULT_LOAD_MAX_RECORDS + 1; i++) {
        await store.write(bundle, fact(`short-${i}`));
      }

      const result = await store.load(bundle);

      expect(result.loaded).toBe(false);
      if (result.loaded) return;
      expect(result.maxRecords).toBe(DEFAULT_LOAD_MAX_RECORDS);
      expect(result.refusedBy).toContain("pages");
    });

    // A caller told only "too big" raises the ceiling. One told which ceiling,
    // and what to call instead, has somewhere else to go.
    test("names the gate value and the next commands in the refusal", async ({
      store,
      bundle,
    }) => {
      for (let i = 0; i < 3; i++) await store.write(bundle, fact(`short-${i}`));

      const result = await store.load(bundle, { maxRecords: 2 });

      expect(result.loaded).toBe(false);
      if (result.loaded) return;
      expect(result.message).toContain("3 records is past the 2-record gate");
      expect(result.message).toContain("kb_catalog");
      expect(result.message).toContain("kb_pack");
      expect(result.message).toContain("kb_query");
    });

    test("reports both ceilings when both trip", async ({ store, bundle }) => {
      for (let i = 0; i < 3; i++) await store.write(bundle, fact(`short-${i}`));

      const result = await store.load(bundle, {
        maxRecords: 2,
        budgetTokens: 1,
      });

      expect(result.loaded).toBe(false);
      if (result.loaded) return;
      expect(result.refusedBy).toEqual(["pages", "tokens"]);
      expect(result.message).toContain("2-record gate");
      expect(result.message).toContain("1-token budget");
    });

    // Symmetric with the refusal. A caller that can see how close it came can
    // act before the base crosses the line.
    test("a successful load reports the ceilings it cleared", async ({
      store,
      bundle,
    }) => {
      await store.write(bundle, fact("kept"));
      await store.write(bundle, fact("dropped"));
      await store.supersede(bundle, "fact.dropped", "fact.kept");

      const result = await store.load(bundle);

      expect(result.loaded).toBe(true);
      if (!result.loaded) return;
      expect(result.recordCount).toBe(2);
      // The stub is a record the caller was told about, but not a page.
      expect(result.pageCount).toBe(1);
      expect(result.maxRecords).toBe(DEFAULT_LOAD_MAX_RECORDS);
      expect(result.budgetTokens).toBe(25_000);
    });

    test("all reports both ceilings as null, not as their defaults", async ({
      store,
      bundle,
    }) => {
      await store.write(bundle, fact("kept"));

      const result = await store.load(bundle, { all: true });

      expect(result.loaded).toBe(true);
      if (!result.loaded) return;
      expect(result.maxRecords).toBeNull();
      expect(result.budgetTokens).toBeNull();
      expect(result.pageCount).toBe(1);
    });

    test("all bypasses the gate as it bypasses the budget", async ({
      store,
      bundle,
    }) => {
      for (let i = 0; i < 3; i++) await store.write(bundle, fact(`short-${i}`));

      const result = await store.load(bundle, { all: true, maxRecords: 2 });

      expect(result.loaded).toBe(true);
      if (!result.loaded) return;
      expect(result.records).toHaveLength(3);
      expect(result.budgetTokens).toBeNull();
    });

    // The filter narrows what is loaded, so it has to narrow what is gated —
    // otherwise "load one type" is refused by records it never returns.
    test("gates the filtered slice, not the whole base", async ({
      store,
      bundle,
    }) => {
      for (let i = 0; i < 3; i++) await store.write(bundle, fact(`short-${i}`));
      await store.write(bundle, decision());

      const result = await store.load(bundle, {
        type: "decision",
        maxRecords: 2,
      });

      expect(result.loaded).toBe(true);
      if (!result.loaded) return;
      expect(result.records).toHaveLength(1);
    });
  });
});

const OVER_BUDGET_RECORD_COUNT = 40;

/** Enough bulk facts to push `approxTokens` past `DEFAULT_LOAD_BUDGET`. */
async function writeOverBudgetBundle(
  store: KbStore,
  bundle: string,
): Promise<void> {
  const paragraph = Array.from(
    { length: 40 },
    (_, i) => `Sentence ${i} explains one observed detail about the system.`,
  ).join(" ");
  for (let i = 0; i < OVER_BUDGET_RECORD_COUNT; i++) {
    await store.write(
      bundle,
      fact(`bulk-${i}`, {
        sections: { Claim: paragraph, Evidence: paragraph },
      }),
    );
  }
}

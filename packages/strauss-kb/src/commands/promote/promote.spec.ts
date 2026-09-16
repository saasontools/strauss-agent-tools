import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeRecord, type ComposeInput } from "../../compose.js";
import {
  KbInvalidConceptIdError,
  KbPromoteCollisionError,
  KbPromoteSelfError,
  KbPromoteStandingError,
  KbPromoteStoppedError,
} from "../../kb-errors.js";
import type { KbRecordType } from "../../kb-record.schema.js";
import { KbStore } from "../../kb-store.js";
import { promoteCommand } from "./command.js";
import type { KbPromoteResult } from "./model.js";

const AT = "2026-08-01T00:00:00.000Z";

describe("promoteCommand", () => {
  let store: KbStore;
  let source: string;
  let target: string;

  beforeEach(() => {
    store = new KbStore();
    source = realpathSync(mkdtempSync(join(tmpdir(), "strauss-kb-review-")));
    target = realpathSync(mkdtempSync(join(tmpdir(), "strauss-kb-adr-")));
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  const seed = (type: KbRecordType, input: ComposeInput, base = source) =>
    store.write(base, composeRecord(type, input, "agent:writer", AT));

  const run = async (input: Record<string, unknown>) =>
    (await promoteCommand.run(
      { store, actor: "agent:merger", now: () => AT },
      promoteCommand.input.parse({ bundlePath: source, ...input }),
    )) as KbPromoteResult;

  test("carries the record accepted, without review tags, and logs both bases", async () => {
    await seed("fact", { slug: "beta", title: "Beta", why: "It holds" });
    await seed("fact", { slug: "gamma", title: "Gamma", why: "It also holds" });
    await seed("decision", {
      slug: "alpha",
      title: "Alpha",
      why: "The consequence",
      tags: ["review", "review:pr-9", "cursor"],
      links: [
        { target: "fact.beta", rel: "depends_on" },
        { target: "fact.gamma", rel: "related_to" },
      ],
    });
    await store.setStatus(source, "decision.alpha", "proposed", "agent:writer");

    const result = await run({
      conceptIds: ["decision.alpha", "fact.beta"],
      to: target,
      source: "https://github.com/org/repo/pull/59",
    });

    const promoted = await store.read(target, "decision.alpha");
    expect(promoted?.frontmatter.strauss_status).toBe("accepted");
    expect(promoted?.frontmatter.tags).toEqual(["cursor"]);
    expect(promoted?.frontmatter.strauss_links).toEqual([
      { target: "fact.beta", rel: "depends_on" },
    ]);
    expect(promoted?.frontmatter.sources).toContainEqual({
      id: "promoted",
      resource: "https://github.com/org/repo/pull/59",
    });
    expect(promoted?.body).toContain("Depends on [fact.beta](fact.beta.md).");
    expect(promoted?.body).not.toContain("fact.gamma");

    // The original stays put: promotion copies, and the review base is the
    // record of what the review actually said.
    expect(await store.read(source, "decision.alpha")).not.toBeNull();

    expect(result).toMatchObject({
      to: target,
      promoted: [
        {
          conceptId: "decision.alpha",
          droppedLinks: [{ target: "fact.gamma", rel: "related_to" }],
        },
        { conceptId: "fact.beta", droppedLinks: [] },
      ],
    });

    const out = (await store.readLog(source)).entries.filter(
      (entry) => entry.operation === "promote-out",
    );
    const into = (await store.readLog(target)).entries.filter(
      (entry) => entry.operation === "promote-in",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ conceptId: "decision.alpha", target });
    expect(into[0]).toMatchObject({
      conceptId: "decision.alpha",
      target: source,
    });
  });

  test("refuses to overwrite a record the target already holds, unless forced", async () => {
    await seed("decision", { slug: "alpha", title: "Alpha", why: "Because" });
    await seed(
      "decision",
      { slug: "alpha", title: "Older Alpha", why: "Because" },
      target,
    );

    await expect(
      run({ conceptIds: ["decision.alpha"], to: target }),
    ).rejects.toBeInstanceOf(KbPromoteCollisionError);
    expect(
      (await store.read(target, "decision.alpha"))?.frontmatter.title,
    ).toBe("Older Alpha");

    await run({ conceptIds: ["decision.alpha"], to: target, force: true });
    expect(
      (await store.read(target, "decision.alpha"))?.frontmatter.title,
    ).toBe("Alpha");
  });

  test("nothing is written when any record in the run would collide", async () => {
    await seed("decision", { slug: "alpha", title: "Alpha", why: "Because" });
    await seed("fact", { slug: "beta", title: "Beta", why: "It holds" });
    await seed(
      "fact",
      { slug: "beta", title: "Older", why: "It holds" },
      target,
    );

    await expect(
      run({ conceptIds: ["decision.alpha", "fact.beta"], to: target }),
    ).rejects.toBeInstanceOf(KbPromoteCollisionError);
    expect(await store.read(target, "decision.alpha")).toBeNull();
  });

  test("a withdrawn record is refused before anything is written", async () => {
    await seed("decision", { slug: "old", title: "Old", why: "Because" });
    await seed("decision", {
      slug: "new",
      title: "New",
      why: "Because",
      supersedes: ["decision.old"],
    });
    await seed("decision", { slug: "cut", title: "Cut", why: "Because" });
    await store.setStatus(source, "decision.cut", "rejected", "agent:writer");

    // Second in the list, so the refusal has to come from the pre-flight for
    // `decision.new` to stay unwritten.
    await expect(
      run({ conceptIds: ["decision.new", "decision.old"], to: target }),
    ).rejects.toBeInstanceOf(KbPromoteStandingError);
    await expect(
      run({ conceptIds: ["decision.cut"], to: target }),
    ).rejects.toBeInstanceOf(KbPromoteStandingError);
    expect(await store.list(target)).toEqual([]);
  });

  test("statuses that say what a record is carry unchanged", async () => {
    await seed("open-question", {
      slug: "ports",
      title: "Ports",
      why: "Because",
    });
    await seed("risk", { slug: "leak", title: "Leak", why: "Because" });
    await store.setStatus(source, "risk.leak", "resolved", "agent:writer");
    await seed("constraint", {
      slug: "budget",
      title: "Budget",
      why: "Because",
    });
    await store.setStatus(
      source,
      "constraint.budget",
      "proposed",
      "agent:writer",
    );

    await run({
      conceptIds: ["open-question.ports", "risk.leak", "constraint.budget"],
      to: target,
    });

    const status = async (id: string) =>
      (await store.read(target, id))?.frontmatter.strauss_status;
    expect(await status("open-question.ports")).toBe("open");
    expect(await status("risk.leak")).toBe("resolved");
    expect(await status("constraint.budget")).toBe("accepted");
  });

  test("verified events are dropped and anchors carried unchanged", async () => {
    await seed("fact", {
      slug: "anchored",
      title: "Anchored",
      why: "It holds",
      anchors: [{ file: "src/server.ts", symbol: "handler" }],
    });
    await store.verify(source, "fact.anchored", "checked", "agent:checker", AT);

    await run({ conceptIds: ["fact.anchored"], to: target });

    const promoted = await store.read(target, "fact.anchored");
    expect(promoted?.frontmatter.verified).toBeUndefined();
    // Still the source repository's file: a cross-repo target reports drift
    // until the record is re-anchored there.
    expect(promoted?.frontmatter.strauss_anchors).toEqual([
      { file: "src/server.ts", symbol: "handler" },
    ]);
  });

  test("a base cannot be promoted into itself", async () => {
    await seed("decision", { slug: "alpha", title: "Alpha", why: "Because" });

    await expect(
      run({ conceptIds: ["decision.alpha"], to: source }),
    ).rejects.toBeInstanceOf(KbPromoteSelfError);
  });

  test("a malformed concept id fails before the ids ahead of it are written", async () => {
    await seed("decision", { slug: "alpha", title: "Alpha", why: "Because" });

    await expect(
      run({ conceptIds: ["decision.alpha", "decision.a.b"], to: target }),
    ).rejects.toBeInstanceOf(KbInvalidConceptIdError);
    expect(await store.read(target, "decision.alpha")).toBeNull();
  });

  test("a write that fails mid-run reports what landed", async () => {
    await seed("decision", { slug: "alpha", title: "Alpha", why: "Because" });
    await seed("fact", { slug: "beta", title: "Beta", why: "It holds" });
    // Not a record, so the collision check reads it as absent and the write
    // behind it fails on the name already being taken.
    writeFileSync(join(target, "fact.beta.md"), "not a record\n", "utf8");

    const failure = await run({
      conceptIds: ["decision.alpha", "fact.beta"],
      to: target,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(KbPromoteStoppedError);
    expect((failure as KbPromoteStoppedError).landed).toEqual([
      "decision.alpha",
    ]);
    expect((await store.list(target)).map((row) => row.conceptId)).toEqual([
      "decision.alpha",
    ]);
    const index = await store.readIndex(target);
    expect(index).toContain("decision.alpha");
    expect(index).not.toContain("fact.beta");
  });

  test("flag values never read as concept ids", () => {
    expect(
      promoteCommand.fromArgv(
        [
          "promote",
          "decision.alpha",
          "--to",
          target,
          "--source",
          "https://pr",
          "--carry",
          "status,verified",
          "--on-conflict",
          "skip-human-settled",
        ],
        source,
        () => Promise.resolve(""),
      ),
    ).toEqual({
      bundlePath: source,
      conceptIds: ["decision.alpha"],
      to: target,
      source: "https://pr",
      carry: ["status", "verified"],
      onConflict: "skip-human-settled",
    });
  });

  test("an unknown --carry field is refused", () => {
    expect(() =>
      promoteCommand.fromArgv(
        ["promote", "decision.alpha", "--to", target, "--carry", "body"],
        source,
        () => Promise.resolve(""),
      ),
    ).toThrow(KbInvalidConceptIdError);
  });

  test("--carry copies status, verified and tags as they stand", async () => {
    await seed("risk", {
      slug: "leak",
      title: "Leak",
      why: "Because",
      tags: ["review", "review:pr-9", "cursor"],
    });
    await store.verify(source, "risk.leak", "still open", "agent:checker", AT);

    await run({
      conceptIds: ["risk.leak"],
      to: target,
      carry: ["status", "verified", "tags", "anchors"],
    });

    const promoted = await store.read(target, "risk.leak");
    expect(promoted?.frontmatter.strauss_status).toBe("open");
    expect(promoted?.frontmatter.tags).toEqual([
      "review",
      "review:pr-9",
      "cursor",
    ]);
    expect(promoted?.frontmatter.verified).toEqual([
      { by: "agent:checker", at: AT, note: "still open" },
    ]);
  });

  test("an unsettled status carries only when named, and settles otherwise", async () => {
    await seed("constraint", {
      slug: "budget",
      title: "Budget",
      why: "Because",
    });
    await store.setStatus(
      source,
      "constraint.budget",
      "proposed",
      "agent:writer",
    );

    await run({
      conceptIds: ["constraint.budget"],
      to: target,
      carry: ["status"],
    });
    expect(
      (await store.read(target, "constraint.budget"))?.frontmatter
        .strauss_status,
    ).toBe("proposed");

    await run({
      conceptIds: ["constraint.budget"],
      to: target,
      onConflict: "force",
    });
    expect(
      (await store.read(target, "constraint.budget"))?.frontmatter
        .strauss_status,
    ).toBe("accepted");
  });

  test("--on-conflict refuse is the default, force overwrites", async () => {
    await seed("decision", { slug: "alpha", title: "Alpha", why: "Because" });
    await seed(
      "decision",
      { slug: "alpha", title: "Older Alpha", why: "Because" },
      target,
    );

    await expect(
      run({ conceptIds: ["decision.alpha"], to: target }),
    ).rejects.toBeInstanceOf(KbPromoteCollisionError);
    await expect(
      run({
        conceptIds: ["decision.alpha"],
        to: target,
        onConflict: "refuse",
      }),
    ).rejects.toBeInstanceOf(KbPromoteCollisionError);

    const result = await run({
      conceptIds: ["decision.alpha"],
      to: target,
      onConflict: "force",
    });
    expect(result.skipped).toEqual([]);
    expect(
      (await store.read(target, "decision.alpha"))?.frontmatter.title,
    ).toBe("Alpha");
  });

  test("skip-human-settled leaves a human's record alone and refreshes the rest", async () => {
    await seed("risk", {
      slug: "leak",
      title: "Leak, reworded",
      why: "Because",
    });
    await seed("fact", {
      slug: "beta",
      title: "Beta, reworded",
      why: "It holds",
    });
    await seed("risk", { slug: "leak", title: "Leak", why: "Because" }, target);
    await seed(
      "fact",
      { slug: "beta", title: "Beta", why: "It holds" },
      target,
    );
    await store.setStatus(
      target,
      "risk.leak",
      "resolved",
      "human:reviewer",
      "fixed in 0ddba11",
    );
    // An agent settling the other one protects nothing.
    await store.setStatus(target, "fact.beta", "accepted", "agent:merger");

    const result = await run({
      conceptIds: ["risk.leak", "fact.beta"],
      to: target,
      onConflict: "skip-human-settled",
    });

    expect(result.skipped).toEqual([
      { conceptId: "risk.leak", settledBy: "human:reviewer" },
    ]);
    expect(result.promoted.map((entry) => entry.conceptId)).toEqual([
      "fact.beta",
    ]);
    expect((await store.read(target, "risk.leak"))?.frontmatter.title).toBe(
      "Leak",
    );
    expect((await store.read(target, "fact.beta"))?.frontmatter.title).toBe(
      "Beta, reworded",
    );
    // Nothing was logged against the record left alone.
    const into = (await store.readLog(target)).entries.filter(
      (entry) => entry.operation === "promote-in",
    );
    expect(into.map((entry) => entry.conceptId)).toEqual(["fact.beta"]);
  });

  test("a human move that does not settle leaves the target promotable", async () => {
    await seed("open-question", {
      slug: "ports",
      title: "Ports, reworded",
      why: "Because",
    });
    await seed(
      "open-question",
      { slug: "ports", title: "Ports", why: "Because" },
      target,
    );
    await store.setStatus(target, "open-question.ports", "open", "human:asker");

    const result = await run({
      conceptIds: ["open-question.ports"],
      to: target,
      onConflict: "skip-human-settled",
    });

    expect(result.skipped).toEqual([]);
    expect(
      (await store.read(target, "open-question.ports"))?.frontmatter.title,
    ).toBe("Ports, reworded");
  });

  test("--force and a disagreeing --on-conflict are refused", () => {
    expect(
      promoteCommand.input.safeParse({
        bundlePath: source,
        conceptIds: ["decision.alpha"],
        to: target,
        force: true,
        onConflict: "skip-human-settled",
      }).success,
    ).toBe(false);
    expect(
      promoteCommand.input.safeParse({
        bundlePath: source,
        conceptIds: ["decision.alpha"],
        to: target,
        force: true,
        onConflict: "force",
      }).success,
    ).toBe(true);
  });

  test("a promotion with no target base is refused before it runs", () => {
    expect(
      promoteCommand.input.safeParse({
        bundlePath: source,
        conceptIds: ["decision.alpha"],
      }).success,
    ).toBe(false);
  });
});

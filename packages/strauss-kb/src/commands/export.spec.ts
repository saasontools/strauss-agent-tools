import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeDecisionRecord } from "../decision-record.js";
import { KbStore } from "../kb-store.js";
import { exportCommand, type KbExportResult } from "./export.js";

const AT = "2026-08-01T00:00:00.000Z";

describe("exportCommand", () => {
  let store: KbStore;
  let bundle: string;
  let out: string;

  beforeEach(() => {
    store = new KbStore();
    bundle = realpathSync(mkdtempSync(join(tmpdir(), "strauss-kb-export-")));
    out = realpathSync(mkdtempSync(join(tmpdir(), "strauss-kb-adr-")));
  });

  afterEach(() => {
    rmSync(bundle, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });

  const seed = (
    slug: string,
    title: string,
    extra: Record<string, unknown> = {},
  ) =>
    store.write(
      bundle,
      composeDecisionRecord(
        { slug, title, why: `Why ${slug}`, ...extra },
        "agent:writer",
        AT,
      ),
    );

  const run = async () =>
    (await exportCommand.run(
      { store, actor: "agent:exporter", now: () => AT },
      exportCommand.input.parse({
        bundlePath: bundle,
        format: "madr",
        to: out,
      }),
    )) as KbExportResult;

  test("renders one MADR file per decision, in MADR headings", async () => {
    await seed("cursor-v2", "Cursor pagination", {
      alternative:
        "Offset pagination, which skips rows under concurrent writes",
      impact: "Every list endpoint changes its page token",
    });

    const result = await run();
    expect(result.exported).toEqual([
      {
        conceptId: "decision.cursor-v2",
        file: "0001-cursor-v2.md",
        status: "accepted",
      },
    ]);

    const text = readFileSync(join(out, "0001-cursor-v2.md"), "utf8");
    expect(text).toContain("# Cursor pagination");
    expect(text).toContain("## Status\n\naccepted");
    expect(text).toContain("## Context and Problem Statement\n\nWhy cursor-v2");
    expect(text).toContain("## Considered Options\n\nOffset pagination");
    expect(text).toContain("## Decision Outcome\n\nCursor pagination");
    expect(text).toContain("## Consequences\n\nEvery list endpoint");
    expect(text.trimEnd()).toMatch(
      /<!-- strauss-kb export: decision\.cursor-v2 -->$/,
    );
  });

  test("a deleted export is renumbered on the next run", async () => {
    await seed("aaa", "First");
    await seed("bbb", "Second");
    await run();
    rmSync(join(out, "0001-aaa.md"));

    // Numbering is stable only while the file stays put: nothing else records
    // which number a decision was exported under.
    expect((await run()).exported).toContainEqual({
      conceptId: "decision.aaa",
      file: "0003-aaa.md",
      status: "accepted",
    });
  });

  test("a file this exporter did not write is reported and left alone", async () => {
    await seed("aaa", "First");
    writeFileSync(join(out, "0001-aaa.md"), "# Someone else's ADR\n", "utf8");

    const result = await run();
    expect(result.exported).toEqual([]);
    expect(result.foreign).toEqual([
      { conceptId: "decision.aaa", file: "0001-aaa.md" },
    ]);
    expect(readFileSync(join(out, "0001-aaa.md"), "utf8")).toBe(
      "# Someone else's ADR\n",
    );
  });

  test("numbering is by slug, so a later run appends and never renumbers", async () => {
    await seed("aaa", "First");
    await seed("bbb", "Second");
    const first = await run();
    expect(first.exported.map((entry) => entry.file)).toEqual([
      "0001-aaa.md",
      "0002-bbb.md",
    ]);

    // Sorts between the two, so an ordinal-by-position scheme would renumber
    // `bbb` here — the one thing an ADR's number must never do.
    await seed("abc", "Third");
    const second = await run();
    expect(second.exported.map((entry) => entry.file)).toEqual([
      "0001-aaa.md",
      "0003-abc.md",
      "0002-bbb.md",
    ]);
    expect(readdirSync(out).sort()).toEqual([
      "0001-aaa.md",
      "0002-bbb.md",
      "0003-abc.md",
    ]);
  });

  test("a re-run rewrites the same bytes", async () => {
    await seed("aaa", "First", { impact: "Something changes" });
    await run();
    const before = readFileSync(join(out, "0001-aaa.md"), "utf8");
    await run();
    expect(readFileSync(join(out, "0001-aaa.md"), "utf8")).toBe(before);
  });

  test("a superseded decision is exported with what replaced it", async () => {
    await seed("aaa", "First");
    await seed("bbb", "Second");
    await store.supersede(bundle, "decision.aaa", "decision.bbb", "agent:x");

    const result = await run();
    expect(result.exported).toContainEqual({
      conceptId: "decision.aaa",
      file: "0001-aaa.md",
      status: "superseded by decision.bbb",
    });
    expect(readFileSync(join(out, "0001-aaa.md"), "utf8")).toContain(
      "## Status\n\nsuperseded by decision.bbb",
    );
  });

  test("the no-decision claim is not an ADR", async () => {
    await seed("aaa", "First");
    await store.write(
      bundle,
      composeDecisionRecord(
        { slug: "none", title: "No decision to record", why: "Nothing to say" },
        "agent:writer",
        AT,
      ),
    );

    expect((await run()).exported.map((entry) => entry.conceptId)).toEqual([
      "decision.aaa",
    ]);
  });
});

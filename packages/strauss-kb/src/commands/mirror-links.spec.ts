import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { composeRecord } from "../compose.js";
import { KbBaseFrozenError, pinBase } from "../kb-pins/index.js";
import { KbStore } from "../kb-store.js";
import { validateBundle } from "../validate.js";
import {
  mirrorLinksCommand,
  type KbMirrorLinksResult,
} from "./mirror-links.js";

/**
 * The migration every base runs once. What it writes is what every consumer
 * will read afterwards, so a citation it misses is an edge that disappears and
 * a citation it invents is an edge nobody wrote.
 */

const AT = "2026-08-01T00:00:00Z";

describe("mirrorLinksCommand", () => {
  let store: KbStore;
  let bundle: string;

  beforeEach(() => {
    store = new KbStore();
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-mirror-"));
  });
  afterEach(() => rmSync(bundle, { recursive: true, force: true }));

  const seed = (slug: string, sections: Record<string, string>) =>
    store.write(
      bundle,
      composeRecord(
        "fact",
        { slug, title: `Fact ${slug}`, why: "Something observed.", sections },
        "agent:writer",
        AT,
      ),
    );

  const run = (input: Record<string, unknown> = {}) =>
    mirrorLinksCommand.run(
      { store, actor: "agent:migrator", now: () => AT },
      mirrorLinksCommand.input.parse({ bundlePath: bundle, ...input }),
    ) as Promise<KbMirrorLinksResult>;

  const linksOf = async (conceptId: string) =>
    (await store.read(bundle, conceptId))?.frontmatter.strauss_links;

  test("mirrors a citation the frontmatter does not declare", async () => {
    await seed("citer", { Claim: "See [fact.target](fact.target.md)." });
    await seed("target", { Claim: "The claim." });

    const result = await run();

    expect(result.mirrored).toEqual([
      { conceptId: "fact.citer", added: ["fact.target"] },
    ]);
    expect(await linksOf("fact.citer")).toEqual([
      { target: "fact.target", rel: "related_to" },
    ]);
    expect(validateBundle(await store.list(bundle))).toEqual([]);
  });

  // `related_to` claims no dependence, which is all a markdown link states.
  // Inventing a stronger rel would put a dependency in the base nobody wrote.
  test("leaves a target that already carries a rel alone", async () => {
    await store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug: "citer",
          title: "Fact citer",
          why: "Something observed.",
          sections: { Claim: "The claim." },
          links: [{ target: "fact.target", rel: "depends_on" }],
        },
        "agent:writer",
        AT,
      ),
    );
    await seed("target", { Claim: "The claim." });

    expect((await run()).mirrored).toEqual([]);
    expect(await linksOf("fact.citer")).toEqual([
      { target: "fact.target", rel: "depends_on" },
    ]);
  });

  test("a quoted example is not a citation", async () => {
    await seed("house-style", {
      Claim: "Cite like `Relates to [fact.example](fact.example.md).` — so.",
    });

    expect((await run()).mirrored).toEqual([]);
    expect(await linksOf("fact.house-style")).toBeUndefined();
  });

  // The addition is computed against the record at write time, not against
  // the snapshot the run started from: a link written in between survives.
  test("keeps a link written after the run read the base", async () => {
    await seed("citer", { Claim: "See [fact.target](fact.target.md)." });
    const listed = store.list.bind(store);
    vi.spyOn(store, "list").mockImplementationOnce(async (path) => {
      const snapshot = await listed(path);
      const file = join(bundle, "fact.citer.md");
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace(
          "\nstrauss_status:",
          "\nstrauss_links:\n  - target: fact.later\n    rel: depends_on\nstrauss_status:",
        ),
        "utf8",
      );
      return snapshot;
    });

    await run();

    expect(await linksOf("fact.citer")).toEqual([
      { target: "fact.later", rel: "depends_on" },
      { target: "fact.target", rel: "related_to" },
    ]);
  });

  // One hostile body must not stop the rest of the base migrating, and must
  // not be skipped silently either.
  test("names an unreadable body and mirrors the rest", async () => {
    await seed("citer", { Claim: "See [fact.target](fact.target.md)." });
    await seed("hostile", { Claim: "Placeholder." });
    const file = join(bundle, "fact.hostile.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "Placeholder.",
        `${"* ".repeat(200)}[x](fact.target.md)`,
      ),
      "utf8",
    );

    const result = await run();

    expect(result.mirrored).toEqual([
      { conceptId: "fact.citer", added: ["fact.target"] },
    ]);
    expect(result.unreadable).toMatchObject([{ conceptId: "fact.hostile" }]);
    expect(mirrorLinksCommand.render?.(result)).toContain(
      "unreadable fact.hostile —",
    );
  });

  test("a second run has nothing left to do", async () => {
    await seed("citer", { Claim: "See [fact.target](fact.target.md)." });
    await seed("target", { Claim: "The claim." });
    await run();

    const again = await run();

    expect(again.mirrored).toEqual([]);
    expect(again.pending).toEqual([]);
  });

  test("--dry-run names what would go and writes nothing", async () => {
    await seed("citer", { Claim: "See [fact.target](fact.target.md)." });
    const before = readFileSync(join(bundle, "fact.citer.md"), "utf8");

    const result = await run({ dryRun: true });

    expect(result).toMatchObject({ dryRun: true, mirrored: [] });
    expect(result.pending).toEqual([
      { conceptId: "fact.citer", added: ["fact.target"] },
    ]);
    expect(readFileSync(join(bundle, "fact.citer.md"), "utf8")).toBe(before);
  });

  // A target written later is still the edge the prose states; `validate`
  // reports the absent target, as it does for any declared link.
  test("mirrors a citation whose target is not in the base yet", async () => {
    await seed("citer", { Claim: "See [fact.later](fact.later.md)." });

    await run();

    expect(await linksOf("fact.citer")).toEqual([
      { target: "fact.later", rel: "related_to" },
    ]);
    expect(validateBundle(await store.list(bundle))).toMatchObject([
      { check: "link_target", severity: "warning" },
    ]);
  });

  test("refuses to write on a frozen base, and still answers --dry-run", async () => {
    await seed("citer", { Claim: "See [fact.target](fact.target.md)." });
    const workspace = mkdtempSync(join(tmpdir(), "strauss-kb-mirror-ws-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
    try {
      await pinBase(store, workspace, bundle, AT, {
        layer: "local",
        frozen: true,
      });

      expect((await run({ dryRun: true })).pending).toHaveLength(1);
      await expect(run()).rejects.toBeInstanceOf(KbBaseFrozenError);
    } finally {
      cwd.mockRestore();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("renders the count and every record it touched", async () => {
    await seed("citer", { Claim: "See [fact.target](fact.target.md)." });
    await seed("target", { Claim: "The claim." });

    expect(mirrorLinksCommand.render?.(await run())).toBe(
      [
        "mirrored 1 citation across 1 of 2 records",
        "- fact.citer → fact.target",
      ].join("\n"),
    );
  });
});

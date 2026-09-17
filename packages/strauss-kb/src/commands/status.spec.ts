import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeRecord } from "../compose.js";
import { KbStatusReasonRequiredError } from "../kb-errors.js";
import { KbStore } from "../kb-store.js";
import { statusCommand } from "./status.js";

const AT = "2026-08-01T00:00:00.000Z";

describe("statusCommand", () => {
  let store: KbStore;
  let bundle: string;

  beforeEach(async () => {
    store = new KbStore();
    bundle = realpathSync(mkdtempSync(join(tmpdir(), "strauss-kb-status-")));
    await store.write(
      bundle,
      composeRecord(
        "risk",
        { slug: "leak", title: "Leak", why: "Because" },
        "agent:writer",
        AT,
      ),
    );
  });

  afterEach(() => rmSync(bundle, { recursive: true, force: true }));

  const run = (input: Record<string, unknown>) =>
    statusCommand.run(
      { store, actor: "agent:merger", now: () => AT },
      statusCommand.input.parse({ bundlePath: bundle, ...input }),
    );

  test("the reason reaches the log entry", async () => {
    await run({
      conceptId: "risk.leak",
      status: "resolved",
      reason: "the bound is asserted in kb-pack.spec.ts",
    });

    const entry = (await store.readLog(bundle)).entries.find(
      (row) => row.operation === "status:resolved",
    );
    expect(entry).toMatchObject({
      conceptId: "risk.leak",
      by: "agent:merger",
      reason: "the bound is asserted in kb-pack.spec.ts",
    });
  });

  test("resolving a risk without one is refused, and nothing moves", async () => {
    await expect(
      run({ conceptId: "risk.leak", status: "resolved" }),
    ).rejects.toBeInstanceOf(KbStatusReasonRequiredError);
    await expect(
      run({ conceptId: "risk.leak", status: "resolved", reason: "   " }),
    ).rejects.toBeInstanceOf(KbStatusReasonRequiredError);

    expect(
      (await store.read(bundle, "risk.leak"))?.frontmatter.strauss_status,
    ).toBe("open");
  });

  test("rejecting a risk closes it too, so it needs a reason as well", async () => {
    await expect(
      run({ conceptId: "risk.leak", status: "rejected" }),
    ).rejects.toBeInstanceOf(KbStatusReasonRequiredError);

    await run({
      conceptId: "risk.leak",
      status: "rejected",
      reason: "the bound cannot be reached",
    });
    expect(
      (await store.read(bundle, "risk.leak"))?.frontmatter.strauss_status,
    ).toBe("rejected");
  });

  test("every other move takes a reason without needing one", async () => {
    await run({ conceptId: "risk.leak", status: "accepted" });
    expect(
      (await store.read(bundle, "risk.leak"))?.frontmatter.strauss_status,
    ).toBe("accepted");

    const entry = (await store.readLog(bundle)).entries.find(
      (row) => row.operation === "status:accepted",
    );
    expect(entry?.reason).toBeUndefined();
  });

  test("--reason is read off argv, never as a positional", () => {
    expect(
      statusCommand.fromArgv(
        ["status", "risk.leak", "resolved", "--reason", "fixed in 0ddba11"],
        bundle,
        () => Promise.resolve(""),
      ),
    ).toEqual({
      bundlePath: bundle,
      conceptId: "risk.leak",
      status: "resolved",
      reason: "fixed in 0ddba11",
    });
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createKbMcpServer } from "./mcp.js";

type RegisteredTool = {
  handler(args: unknown): Promise<{ content: { text: string }[] }>;
};

/**
 * The tool wrapper, in process. `test/smoke.spec.ts` drives the same server
 * through a real client over stdio; this reaches the branch that decides how a
 * result becomes tool content, which a client cannot distinguish from outside.
 */
function tools(): Record<string, RegisteredTool> {
  return (
    createKbMcpServer() as unknown as {
      _registeredTools: Record<string, RegisteredTool>;
    }
  )._registeredTools;
}

describe("createKbMcpServer", () => {
  let bundle: string;

  beforeEach(() => {
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-mcp-"));
  });
  afterEach(() => {
    rmSync(bundle, { recursive: true, force: true });
  });

  test("serialises an object result as pretty JSON text", async () => {
    const result = await tools().kb_types!.handler({});

    expect(result.content[0]!.text.startsWith("{\n")).toBe(true);
    expect(Object.keys(JSON.parse(result.content[0]!.text))).toContain(
      "decision",
    );
  });

  // `kb_index` returns markdown, not a structure. Wrapping it in JSON would
  // hand a client an escaped document it then has to unescape.
  test("passes a string result through unquoted", async () => {
    await tools().kb_write!.handler({
      bundlePath: bundle,
      type: "fact",
      input: {
        slug: "index-is-derived",
        title: "The index is recomputable from the records",
        why: "Nothing has to remember to rebuild it.",
      },
    });

    const result = await tools().kb_index!.handler({ bundlePath: bundle });

    expect(result.content[0]!.text.startsWith("# KB Index")).toBe(true);
  });

  // `kb_pack` renders text like `kb_index`, and its budget refusal reaches the
  // client as the typed error — never as a partial pack in tool content.
  test("kb_pack renders a pack and refuses past the budget with the typed error", async () => {
    await tools().kb_write!.handler({
      bundlePath: bundle,
      type: "fact",
      input: {
        slug: "pack-root",
        title: "The pack starts somewhere",
        why: "A neighbourhood needs a centre.",
      },
    });

    const result = await tools().kb_pack!.handler({
      bundlePath: bundle,
      conceptId: "fact.pack-root",
    });
    expect(
      result.content[0]!.text.startsWith("# KB Pack — fact.pack-root"),
    ).toBe(true);

    await expect(
      tools().kb_pack!.handler({
        bundlePath: bundle,
        conceptId: "fact.pack-root",
        budgetTokens: 1,
      }),
    ).rejects.toMatchObject({
      name: "KbPackBudgetExceededError",
      details: { budgetTokens: 1 },
    });
  });

  test("rejects arguments the command's schema does not accept", async () => {
    await expect(
      tools().kb_status!.handler({
        bundlePath: bundle,
        conceptId: "fact.index-is-derived",
        status: "nearly",
      }),
    ).rejects.toThrow();
  });

  // The server reads STRAUSS_KB_ACTOR once, at construction, so a session
  // acting for several people had one name for all of them. `actor` is
  // per-call, and `kb_verify` weighs it the way it weighs the ambient one.
  describe("a per-call actor", () => {
    const seed = () =>
      tools().kb_write!.handler({
        bundlePath: bundle,
        type: "fact",
        input: {
          slug: "actor-is-per-call",
          title: "A write names its own actor",
          why: "One session may act for several people.",
        },
        actor: "agent:x",
      });

    test("lets someone other than the writer verify", async () => {
      await seed();

      const result = await tools().kb_verify!.handler({
        bundlePath: bundle,
        conceptId: "fact.actor-is-per-call",
        note: "read the code, still true",
        actor: "human:alice",
      });

      expect(JSON.parse(result.content[0]!.text)).toMatchObject({
        verified: 1,
      });
    });

    test("still refuses the record's own generator", async () => {
      await seed();

      await expect(
        tools().kb_verify!.handler({
          bundlePath: bundle,
          conceptId: "fact.actor-is-per-call",
          note: "read my own work",
          actor: "agent:x",
        }),
      ).rejects.toMatchObject({ name: "KbSelfVerificationError" });
    });

    test("refuses an actor that is not kind:name", async () => {
      await expect(
        tools().kb_no_decision!.handler({
          bundlePath: bundle,
          reason: "nothing to decide",
          actor: "alice",
        }),
      ).rejects.toThrow(/kind:name/);
    });
  });

  test("names itself and its version to the client", () => {
    const server = createKbMcpServer() as unknown as {
      server: { _serverInfo?: { name: string; version: string } };
    };

    expect(server.server._serverInfo).toMatchObject({ name: "strauss-kb" });
  });
});

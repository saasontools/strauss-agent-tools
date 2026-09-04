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

  test("names itself and its version to the client", () => {
    const server = createKbMcpServer() as unknown as {
      server: { _serverInfo?: { name: string; version: string } };
    };

    expect(server.server._serverInfo).toMatchObject({ name: "strauss-kb" });
  });
});

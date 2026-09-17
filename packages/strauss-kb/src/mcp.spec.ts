import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { pinBase } from "./kb-pins/index.js";
import { KbStore } from "./kb-store.js";
import { createKbMcpServer } from "./mcp.js";

const NOW = "2026-08-26T12:00:00Z";

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

  // MCP has no exit code, so the outcome per anchor is the whole answer: an
  // agent reads the same `applied` the CLI gates on.
  test("kb_anchor_resolve reports the same outcomes the CLI gates on", async () => {
    const repo = mkdtempSync(join(tmpdir(), "strauss-kb-mcp-repo-"));
    try {
      const file = "src/orders.ts";
      const source = [
        "export function totals(orders: Order[]): number {",
        "  return orders.length;",
        "}",
        "",
      ].join("\n");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, file), source, "utf8");
      await tools().kb_write!.handler({
        bundlePath: bundle,
        type: "decision",
        input: {
          slug: "totals-counts",
          title: "Totals counts orders",
          why: "Summing amounts would double-charge refunds.",
          anchors: [{ file, symbol: "totals" }],
        },
      });
      const resolve = (args: Record<string, unknown>) =>
        tools()
          .kb_anchor_resolve!.handler({
            bundlePath: bundle,
            conceptId: "decision.totals-counts",
            repoRoot: repo,
            ...args,
          })
          .then((result) => JSON.parse(result.content[0]!.text));

      expect(await resolve({})).toMatchObject({
        results: [{ state: "stamped", outcome: "applied" }],
      });

      writeFileSync(
        join(repo, file),
        source.replace("orders.length", "orders.length + 0"),
        "utf8",
      );
      expect(await resolve({ rebaseline: true })).toMatchObject({
        results: [{ state: "drifted", outcome: "applied", rebaselined: true }],
      });
      expect(await resolve({})).toMatchObject({
        results: [{ state: "match" }],
      });

      // MCP has no exit code, so a refusal has to be in the result itself.
      const workspace = mkdtempSync(join(tmpdir(), "strauss-kb-mcp-ws-"));
      const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
      try {
        await pinBase(new KbStore(), workspace, bundle, NOW, {
          layer: "local",
          frozen: true,
        });
        writeFileSync(
          join(repo, file),
          source.replace("orders.length", "orders.length + 1"),
          "utf8",
        );

        expect(await resolve({ rebaseline: true })).toMatchObject({
          frozen: true,
          results: [
            { state: "drifted", outcome: "failed", outcomeReason: "frozen" },
          ],
        });
      } finally {
        cwd.mockRestore();
        rmSync(workspace, { recursive: true, force: true });
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // The wrapper is generic, so what this proves is that the reference findings
  // survive the trip: `kb_doctor` carries the structured edge, and
  // `kb_reassess` answers with a packet where drift alone would have said
  // nothing to reassess.
  test("kb_doctor and kb_reassess carry reference findings to a client", async () => {
    const write = (type: string, input: Record<string, unknown>) =>
      tools().kb_write!.handler({ bundlePath: bundle, type, input });

    await write("decision", {
      slug: "retention",
      title: "Exports are kept for thirty days",
      why: "A shorter window loses evidence a dispute needs.",
      sections: { Decision: "Keep exports thirty days." },
    });
    await write("decision", {
      slug: "retention-seven-days",
      title: "Exports are kept for seven days",
      why: "Storage cost outgrew the dispute window.",
      sections: { Decision: "Keep exports seven days." },
      supersedes: ["decision.retention"],
    });
    await write("risk", {
      slug: "environment-override",
      title: "An environment override can shorten the window",
      why: "A dispute opened after the override loses its evidence.",
      sections: { Risk: "The window is read from the environment." },
    });
    // Frontmatter only: `kb_write` cannot state one half without the other.
    const file = join(bundle, "risk.environment-override.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "\nstrauss_status:",
        "\nstrauss_links:\n  - target: decision.retention\n    rel: related_to\nstrauss_status:",
      ),
      "utf8",
    );

    const report = JSON.parse(
      (await tools().kb_doctor!.handler({ bundlePath: bundle })).content[0]!
        .text,
    ) as { groups: { check: string; findings: { reference?: unknown }[] }[] };
    expect(
      report.groups.find((group) => group.check === "superseded-but-cited")
        ?.findings[0]?.reference,
    ).toMatchObject({
      from: "risk.environment-override",
      target: "decision.retention",
      origins: ["link"],
    });

    const packet = JSON.parse(
      (
        await tools().kb_reassess!.handler({
          bundlePath: bundle,
          conceptId: "risk.environment-override",
        })
      ).content[0]!.text,
    ) as { packet: { references: { outgoing: unknown[] } } | null };
    expect(packet.packet?.references.outgoing).toMatchObject([
      { target: "decision.retention", rels: ["related_to"] },
    ]);
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

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hashAnchorText, resolveAnchor } from "../../anchor-resolver/index.js";
import { runKbCli } from "../../cli.js";
import { composeRecord } from "../../compose.js";
import { parseLog } from "../../kb-log.js";
import { pinBase } from "../../kb-pins/index.js";
import type { KbAnchor } from "../../kb-record.schema.js";
import { KbStore } from "../../kb-store.js";
import { createKbMcpServer } from "../../mcp.js";
import { KB_COMMANDS_BY_NAME } from "../index.js";
import { applyAnchorSet } from "../../anchors/index.js";
import { anchorSetCommand } from "./command.js";
import type { AnchorSetInput, KbAnchorSetResult } from "./model.js";

/**
 * The issue's fixture: a retention policy anchored in two files, refactored so
 * the cleanup side is renamed — and its body rewritten — and the shared
 * setting extracted.
 */
const CLEANUP = "src/cleanup.mjs";
const DOWNLOAD = "src/download.mjs";
const RETENTION = "src/retention.mjs";
const ID = "decision.export-retention";

const CLEANUP_BEFORE = [
  "export function shouldDeleteExport(exportedAt, now) {",
  "  return now - exportedAt > 30 * 24 * 60 * 60 * 1000;",
  "}",
  "",
].join("\n");

const CLEANUP_AFTER = [
  "import { retentionDays } from './retention.mjs';",
  "",
  "export function isExportExpired(exportedAt, now) {",
  "  return now - exportedAt > retentionDays() * 86400000;",
  "}",
  "",
].join("\n");

const DOWNLOAD_SOURCE = [
  "export function canDownloadExport(exportedAt, now) {",
  "  return now - exportedAt <= 30 * 24 * 60 * 60 * 1000;",
  "}",
  "",
].join("\n");

const RETENTION_SOURCE = [
  "export function retentionDays() {",
  "  return Number(process.env.EXPORT_RETENTION_DAYS ?? 30);",
  "}",
  "",
].join("\n");

const REASON =
  "Reviewed the refactor: isExportExpired replaces shouldDeleteExport; retentionDays owns the shared setting.";

describe("anchorSetCommand", () => {
  let repo: string;
  let bundle: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-set-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-set-bundle-"));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  function writeSource(file: string, contents: string): void {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), contents, "utf8");
  }

  /** An anchor as a resolution pass leaves it: hashed, dated, sized. */
  function stamped(file: string, symbol: string, source: string): KbAnchor {
    const resolved = resolveAnchor(source, { file, symbol });
    if (!resolved) throw new Error(`fixture symbol ${symbol} did not resolve`);
    return {
      file,
      symbol,
      hash: hashAnchorText(resolved.text),
      hash_kind: "raw",
      resolver: "regex",
      resolved_at: "2026-08-01T00:00:00Z",
      lines: resolved.endLine - resolved.startLine + 1,
    };
  }

  async function seed(anchors: KbAnchor[]): Promise<void> {
    await new KbStore().write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "export-retention",
          title: "Exports are deleted after thirty days",
          why: "A longer retention keeps customer data past what the contract allows.",
          sections: {
            Decision: "Delete an export thirty days after it was produced.",
            Rejected: "Ninety days, past what the contract allows.",
          },
          sources: [{ id: "contract", resource: "https://example.test/dpa" }],
          links: [{ target: "risk.export-retention-env", rel: "informs" }],
        },
        "agent:writer",
        "2026-08-01T00:00:00Z",
      ),
    );
    await new KbStore().updateAnchors(bundle, ID, anchors, "agent:resolver");
  }

  async function seedRefactor(): Promise<KbAnchor[]> {
    writeSource(CLEANUP, CLEANUP_BEFORE);
    writeSource(DOWNLOAD, DOWNLOAD_SOURCE);
    const before = [
      stamped(CLEANUP, "shouldDeleteExport", CLEANUP_BEFORE),
      stamped(DOWNLOAD, "canDownloadExport", DOWNLOAD_SOURCE),
    ];
    await seed(before);
    writeSource(CLEANUP, CLEANUP_AFTER);
    writeSource(RETENTION, RETENTION_SOURCE);
    return before;
  }

  /** The set a reviewer sends: the anchors it read, with the rename applied. */
  function renamed(before: KbAnchor[]): AnchorSetInput {
    return {
      reason: REASON,
      anchors: [
        { ...(before[0] as KbAnchor), symbol: "isExportExpired" },
        before[1] as KbAnchor,
        { file: RETENTION, symbol: "retentionDays" },
      ],
    };
  }

  async function run(
    input: unknown,
    actor = "agent:reviewer",
  ): Promise<KbAnchorSetResult> {
    const parsed = anchorSetCommand.input.parse({
      bundlePath: bundle,
      conceptId: ID,
      input,
    });
    return (await anchorSetCommand.run(
      { store: new KbStore(), actor, now: () => "2026-09-17T12:00:00Z" },
      parsed,
    )) as KbAnchorSetResult;
  }

  async function anchors(): Promise<KbAnchor[]> {
    const record = await new KbStore().read(bundle, ID);
    return record?.frontmatter.strauss_anchors ?? [];
  }

  function snapshot(dir: string): Record<string, string> {
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((path) => statSync(join(dir, path)).isFile())
      .sort();
    return Object.fromEntries(
      files.map((path) => [path, readFileSync(join(dir, path), "utf8")]),
    );
  }

  describe("the reviewed rename", () => {
    test("carries the baseline to the new symbol and leaves the addition unstamped", async () => {
      const before = await seedRefactor();

      const result = await run(renamed(before));

      expect(result.baseline).toBe("unchanged");
      expect(result.changes).toEqual([
        {
          op: "move",
          from: { file: CLEANUP, symbol: "shouldDeleteExport" },
          to: { file: CLEANUP, symbol: "isExportExpired" },
        },
        { op: "add", to: { file: RETENTION, symbol: "retentionDays" } },
      ]);

      const [cleanup, download, helper] = await anchors();
      expect(cleanup).toEqual({ ...before[0], symbol: "isExportExpired" });
      expect(download).toEqual(before[1]);
      expect(Object.keys(helper ?? {}).sort()).toEqual(["file", "symbol"]);
    });

    test("leaves standing, body, sources, links and generation untouched", async () => {
      const before = await seedRefactor();
      const store = new KbStore();
      await store.verify(bundle, ID, "Read the contract clause.", "human:ada");
      const was = await store.read(bundle, ID);

      await run(renamed(before));

      const now = await store.read(bundle, ID);
      expect(now?.body).toBe(was?.body);
      expect({ ...now?.frontmatter, strauss_anchors: undefined }).toEqual({
        ...was?.frontmatter,
        strauss_anchors: undefined,
      });
      expect(now?.frontmatter.verified).toHaveLength(1);
    });

    // The whole point: the pointer moved, the evidence did not.
    test("the moved pointer reports drift until it is rebaselined", async () => {
      const before = await seedRefactor();
      await run(renamed(before));
      const resolve = KB_COMMANDS_BY_NAME.get("anchor-resolve");
      const ctx = {
        store: new KbStore(),
        actor: "agent:reviewer",
        now: () => "2026-09-17T12:00:00Z",
      };
      const call = async (rebaseline: boolean) =>
        (await resolve!.run(
          ctx,
          resolve!.input.parse({
            bundlePath: bundle,
            conceptId: ID,
            repoRoot: repo,
            ...(rebaseline ? { rebaseline: true } : {}),
          }),
        )) as { results: { state: string }[] };

      expect((await call(false)).results.map((e) => e.state).sort()).toEqual([
        "drifted",
        "match",
        "stamped",
      ]);

      await call(true);
      expect(
        (await call(false)).results.every((e) => e.state === "match"),
      ).toBe(true);
    });

    test("both surfaces reach the same record", async () => {
      const before = await seedRefactor();
      const viaCommand = await run(renamed(before));
      const afterCommand = await anchors();

      const other = mkdtempSync(join(tmpdir(), "strauss-kb-set-mcp-"));
      try {
        const saved = bundle;
        bundle = other;
        const beforeOther = await seedRefactor();
        vi.stubEnv("STRAUSS_KB_ACTOR", "agent:reviewer");
        const tool = (
          createKbMcpServer() as unknown as {
            _registeredTools: Record<
              string,
              {
                handler(
                  args: unknown,
                ): Promise<{ content: { text: string }[] }>;
              }
            >;
          }
        )._registeredTools.kb_anchor_set;
        const raw = await tool!.handler({
          bundlePath: other,
          conceptId: ID,
          input: renamed(beforeOther),
        });
        const viaMcp = JSON.parse(raw.content[0]!.text) as KbAnchorSetResult;
        expect(viaMcp.changes).toEqual(viaCommand.changes);
        expect(await anchors()).toEqual(afterCommand);
        bundle = saved;
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });

    test("the CLI reads the set from stdin", async () => {
      const before = await seedRefactor();
      vi.stubEnv("STRAUSS_KB_ACTOR", "agent:reviewer");
      const out = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      vi.spyOn(process.stdin, "setEncoding").mockReturnValue(process.stdin);
      vi.spyOn(process.stdin, "on").mockImplementation(((
        event: string,
        listener: (chunk?: string) => void,
      ) => {
        if (event === "data") listener(JSON.stringify(renamed(before)));
        if (event === "end") listener();
        return process.stdin;
      }) as never);

      await runKbCli(["--bundle", bundle, "anchor-set", ID]);
      out.mockRestore();
      vi.restoreAllMocks();

      expect((await anchors()).map((anchor) => anchor.symbol)).toEqual([
        "isExportExpired",
        "canDownloadExport",
        "retentionDays",
      ]);
    });
  });

  describe("resolve", () => {
    // Choosing the pointer is the reading, so the set can be stamped at once.
    test("stamps every anchor against the current code in the same call", async () => {
      const before = await seedRefactor();
      const parsed = anchorSetCommand.input.parse({
        bundlePath: bundle,
        conceptId: ID,
        input: renamed(before),
        resolve: true,
        repoRoot: repo,
      });

      const result = (await anchorSetCommand.run(
        {
          store: new KbStore(),
          actor: "agent:reviewer",
          now: () => "2026-09-17T12:00:00Z",
        },
        parsed,
      )) as KbAnchorSetResult;

      expect(result.baseline).toBe("stamped");
      const [cleanup, , helper] = await anchors();
      expect(cleanup?.hash).not.toBe(before[0]?.hash);
      expect(helper?.hash).toMatch(/^sha256:/);

      const check = KB_COMMANDS_BY_NAME.get("anchor-resolve")!;
      const after = (await check.run(
        {
          store: new KbStore(),
          actor: "agent:reviewer",
          now: () => "2026-09-17T12:00:00Z",
        },
        check.input.parse({
          bundlePath: bundle,
          conceptId: ID,
          repoRoot: repo,
          check: true,
        }),
      )) as { results: { state: string }[] };
      expect(after.results.every((entry) => entry.state === "match")).toBe(
        true,
      );
    });

    test("a pointer that names nothing fails the command", async () => {
      const before = await seedRefactor();
      const input = {
        reason: "typo in the new symbol",
        anchors: [
          { file: CLEANUP, symbol: "isExportExpried" },
          before[1] as KbAnchor,
        ],
      };
      const parsed = anchorSetCommand.input.parse({
        bundlePath: bundle,
        conceptId: ID,
        input,
        resolve: true,
        repoRoot: repo,
      });

      const result = await anchorSetCommand.run(
        {
          store: new KbStore(),
          actor: "agent:reviewer",
          now: () => "2026-09-17T12:00:00Z",
        },
        parsed,
      );

      expect(anchorSetCommand.failsWhen?.(result, parsed)).toBe(true);
      expect(
        anchorSetCommand.failsWhen?.(
          { ...(result as object), resolved: [{ state: "match" }] },
          parsed,
        ),
      ).toBe(false);
    });

    test("is off by default: the pointers are written and nothing stamped", async () => {
      const before = await seedRefactor();

      const result = await run(renamed(before));

      expect(result.baseline).toBe("unchanged");
      expect(result.resolved).toBeUndefined();
      expect((await anchors())[2]?.hash).toBeUndefined();
    });
  });

  describe("the audit trail", () => {
    test("logs one anchor-set entry with actor, reason and what changed", async () => {
      const before = await seedRefactor();

      await run(renamed(before), "agent:reviewer");

      const entries = parseLog(
        readFileSync(join(bundle, "log.jsonl"), "utf8"),
      ).entries.filter((entry) => entry.operation === "anchor-set");
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        by: "agent:reviewer",
        conceptId: ID,
        reason: REASON,
        anchors: [
          {
            op: "move",
            from: { file: CLEANUP, symbol: "shouldDeleteExport" },
            to: { file: CLEANUP, symbol: "isExportExpired" },
          },
          { op: "add", to: { file: RETENTION, symbol: "retentionDays" } },
        ],
      });
    });

    test("writes no verified[] event", async () => {
      const before = await seedRefactor();
      await run(renamed(before));
      const record = await new KbStore().read(bundle, ID);
      expect(record?.frontmatter.verified).toEqual([]);
    });

    // Both directions; forward is the one a shared base needs.
    test("an entry carrying a field this reader never heard of still parses", () => {
      const future = `${JSON.stringify({
        at: "2027-01-01T00:00:00.000Z",
        by: "agent:later",
        operation: "anchor-set",
        conceptId: ID,
        reason: "a later version added a field",
        confidence: "high",
      })}\n`;
      const read = parseLog(future);
      expect(read.malformed).toEqual([]);
      expect(read.entries).toHaveLength(1);
    });

    test("a line missing a required field is still malformed", () => {
      const broken = `${JSON.stringify({
        at: "2027-01-01T00:00:00.000Z",
        operation: "anchor-set",
        conceptId: ID,
      })}\n`;
      expect(parseLog(broken).malformed).toHaveLength(1);
    });
  });

  describe("the set is taken as given", () => {
    // Whether the code was read is the caller's claim; the log records it.
    test("dropping a stamped anchor is accepted and logged as a drop", async () => {
      const before = await seedRefactor();

      const result = await run({
        reason: "the cleanup path moved to another service",
        anchors: [before[1] as KbAnchor],
      });

      expect(result.changes).toEqual([
        { op: "drop", from: { file: CLEANUP, symbol: "shouldDeleteExport" } },
      ]);
      expect(await anchors()).toEqual([before[1]]);
    });
  });

  describe("a record's birth", () => {
    test("refuses two anchors at one address, which compose used to allow", () => {
      expect(() =>
        composeRecord(
          "fact",
          {
            slug: "dup",
            title: "Two pointers, one place",
            why: "They would drift and rebaseline as a pair for ever.",
            anchors: [
              { file: CLEANUP, symbol: "x" },
              { file: CLEANUP, symbol: "x" },
            ],
          },
          "agent:writer",
          "2026-08-01T00:00:00Z",
        ),
      ).toThrow(/appears twice/);
    });

    // The same rule, and birth is not an exception: the record holds nothing,
    // so there is no baseline to carry and a first write can only ask for
    // addresses. anchor-resolve is what turns one into evidence.
    test("takes the addresses, which anchor-resolve then stamps", () => {
      const record = composeRecord(
        "fact",
        {
          slug: "born-bare",
          title: "Born with an address",
          why: "The resolver measures it once the change settles.",
          anchors: [{ file: CLEANUP, symbol: "shouldDeleteExport" }],
        },
        "agent:writer",
        "2026-08-01T00:00:00Z",
      );

      expect(record.frontmatter.strauss_anchors).toEqual([
        { file: CLEANUP, symbol: "shouldDeleteExport" },
      ]);
    });
  });

  describe("refusals leave the record and the log alone", () => {
    test("an empty set", () => {
      expect(() =>
        anchorSetCommand.input.parse({
          bundlePath: bundle,
          conceptId: ID,
          input: { reason: "remove everything", anchors: [] },
        }),
      ).toThrow();
    });

    test("a reason of only whitespace", () => {
      expect(() =>
        anchorSetCommand.input.parse({
          bundlePath: bundle,
          conceptId: ID,
          input: { reason: "  ", anchors: [{ file: CLEANUP }] },
        }),
      ).toThrow(/reason/);
    });

    test("an anchor naming both a symbol and a span", () => {
      expect(() =>
        anchorSetCommand.input.parse({
          bundlePath: bundle,
          conceptId: ID,
          input: {
            reason: "both addresses",
            anchors: [
              { file: CLEANUP, symbol: "x", span: { start: 1, end: 2 } },
            ],
          },
        }),
      ).toThrow(/symbol or a span/);
    });

    test("two anchors at one address", async () => {
      const before = await seedRefactor();

      await expect(
        run({
          reason: "say it twice",
          anchors: [
            before[0],
            before[1],
            { file: DOWNLOAD, symbol: "canDownloadExport" },
          ],
        }),
      ).rejects.toMatchObject({ name: "KbAnchorSetDuplicateError" });
    });

    // One remote has many spellings, and the resolver compares them normalised.
    test("two spellings of one remote are one address", () => {
      expect(() =>
        applyAnchorSet(
          [{ file: "lib/a.go", symbol: "Retention" }],
          [
            {
              file: "lib/a.go",
              symbol: "Retention",
              repo: "https://github.com/org/name",
            },
            {
              file: "lib/a.go",
              symbol: "Retention",
              repo: "git@github.com:org/name.git",
            },
          ],
        ),
      ).toThrow(/appears twice/);
    });

    test("a record that does not exist", async () => {
      const before = await seedRefactor();
      const was = snapshot(bundle);

      await expect(
        anchorSetCommand.run(
          {
            store: new KbStore(),
            actor: "agent:reviewer",
            now: () => "2026-09-17T12:00:00Z",
          },
          anchorSetCommand.input.parse({
            bundlePath: bundle,
            conceptId: "decision.not-here",
            input: renamed(before),
          }),
        ),
      ).rejects.toMatchObject({ name: "KbRecordNotFoundError" });

      expect(snapshot(bundle)).toEqual(was);
    });

    test("a frozen base", async () => {
      const before = await seedRefactor();
      const workspace = mkdtempSync(join(tmpdir(), "strauss-kb-set-ws-"));
      const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
      try {
        await pinBase(
          new KbStore(),
          workspace,
          bundle,
          "2026-09-17T12:00:00Z",
          {
            frozen: true,
          },
        );
        const was = snapshot(bundle);

        await expect(run(renamed(before))).rejects.toMatchObject({
          name: "KbBaseFrozenError",
        });

        expect(snapshot(bundle)).toEqual(was);
      } finally {
        cwd.mockRestore();
        rmSync(workspace, { recursive: true, force: true });
      }
    });

    test("a refusal caps the locator it quotes", async () => {
      await seedRefactor();
      const huge = { file: `src/${"a".repeat(200_000)}.mjs` };

      const caught = await run({
        reason: "point at something enormous, twice",
        anchors: [huge, huge],
      }).then(
        () => null,
        (error: Error) => error,
      );

      expect(caught?.message.length).toBeLessThan(400);
    });
  });

  describe("the command table", () => {
    test("is registered under both surfaces with a stdin adapter", async () => {
      const command = KB_COMMANDS_BY_NAME.get("anchor-set");
      expect(command?.tool).toBe("kb_anchor_set");
      expect(command?.usage.startsWith("anchor-set")).toBe(true);
      const input = { reason: REASON, anchors: [{ file: CLEANUP }] };
      expect(
        await command?.fromArgv(["anchor-set", ID], bundle, () =>
          Promise.resolve(JSON.stringify(input)),
        ),
      ).toMatchObject({
        bundlePath: bundle,
        conceptId: ID,
        input,
        resolve: false,
      });
      expect(
        await command?.fromArgv(
          ["anchor-set", ID, "--resolve", "--repo-root", "/repo"],
          bundle,
          () => Promise.resolve(JSON.stringify(input)),
        ),
      ).toMatchObject({ resolve: true, repoRoot: "/repo" });
    });
  });
});

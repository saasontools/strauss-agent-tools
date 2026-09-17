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
import { anchorUpdateCommand } from "./command.js";
import type { AnchorPatchInput, KbAnchorUpdateResult } from "./model.js";
import { applyAnchorPatch } from "./patch.js";

/**
 * The issue's own fixture: a retention policy anchored in two files, refactored
 * so the cleanup side is renamed and its shared setting extracted.
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

const RENAME = {
  reason:
    "Reviewed the refactor: isExportExpired replaces shouldDeleteExport; retentionDays owns the shared setting.",
  replace: [
    {
      from: { file: CLEANUP, symbol: "shouldDeleteExport" },
      to: { file: CLEANUP, symbol: "isExportExpired" },
    },
  ],
  add: [{ file: RETENTION, symbol: "retentionDays" }],
};

describe("anchorUpdateCommand", () => {
  let repo: string;
  let bundle: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-update-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-update-bundle-"));
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
    // Written through the anchor path so the fixture's baselines are exactly
    // what a resolution pass would have stamped.
    await new KbStore().updateAnchors(bundle, ID, anchors, "agent:resolver");
  }

  /** The fixture both surfaces run against: two stamped anchors, code moved. */
  async function seedRefactor(): Promise<void> {
    writeSource(CLEANUP, CLEANUP_BEFORE);
    writeSource(DOWNLOAD, DOWNLOAD_SOURCE);
    await seed([
      stamped(CLEANUP, "shouldDeleteExport", CLEANUP_BEFORE),
      stamped(DOWNLOAD, "canDownloadExport", DOWNLOAD_SOURCE),
    ]);
    writeSource(CLEANUP, CLEANUP_AFTER);
    writeSource(RETENTION, RETENTION_SOURCE);
  }

  async function run(
    input: unknown,
    actor = "agent:reviewer",
  ): Promise<KbAnchorUpdateResult> {
    const parsed = anchorUpdateCommand.input.parse({
      bundlePath: bundle,
      conceptId: ID,
      input,
    });
    return (await anchorUpdateCommand.run(
      { store: new KbStore(), actor, now: () => "2026-09-17T12:00:00Z" },
      parsed,
    )) as KbAnchorUpdateResult;
  }

  async function anchors(): Promise<KbAnchor[]> {
    const record = await new KbStore().read(bundle, ID);
    return record?.frontmatter.strauss_anchors ?? [];
  }

  /** Every file under `dir` by relative path, to check a run wrote nothing. */
  function snapshot(dir: string): Record<string, string> {
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((path) => statSync(join(dir, path)).isFile())
      .sort();
    return Object.fromEntries(
      files.map((path) => [path, readFileSync(join(dir, path), "utf8")]),
    );
  }

  describe("the reviewed rename", () => {
    test("replaces one pointer, adds the helper, and keeps the rest", async () => {
      await seedRefactor();
      const before = await anchors();

      const result = await run(RENAME);

      expect(result.conceptId).toBe(ID);
      expect(result.baseline).toBe("unchanged");
      expect(result.changes).toEqual([
        {
          op: "replace",
          from: { file: CLEANUP, symbol: "shouldDeleteExport" },
          to: { file: CLEANUP, symbol: "isExportExpired" },
        },
        { op: "add", to: { file: RETENTION, symbol: "retentionDays" } },
      ]);

      const after = await anchors();
      expect(after).toEqual([
        { ...before[0], symbol: "isExportExpired" },
        before[1],
        { file: RETENTION, symbol: "retentionDays" },
      ]);
    });

    // The point of the whole command: a pointer moves, a baseline does not.
    test("keeps the replaced anchor's baseline and leaves the addition unstamped", async () => {
      await seedRefactor();
      const before = await anchors();

      await run(RENAME);

      const [cleanup, download, helper] = await anchors();
      expect(cleanup).toMatchObject({
        hash: before[0]?.hash,
        hash_kind: "raw",
        resolver: "regex",
        resolved_at: "2026-08-01T00:00:00Z",
        lines: before[0]?.lines,
      });
      expect(download).toEqual(before[1]);
      expect(Object.keys(helper ?? {}).sort()).toEqual(["file", "symbol"]);
    });

    test("leaves standing, body, sources, links and generation untouched", async () => {
      await seedRefactor();
      const store = new KbStore();
      await store.verify(bundle, ID, "Read the contract clause.", "human:ada");
      const before = await store.read(bundle, ID);

      await run(RENAME);

      const after = await store.read(bundle, ID);
      expect(after?.body).toBe(before?.body);
      expect({ ...after?.frontmatter, strauss_anchors: undefined }).toEqual({
        ...before?.frontmatter,
        strauss_anchors: undefined,
      });
      expect(after?.frontmatter.verified).toHaveLength(1);
    });

    test("both surfaces reach the same record", async () => {
      await seedRefactor();
      const viaCommand = await run(RENAME);
      const afterCommand = await anchors();

      // A second bundle, patched through the MCP tool instead.
      const other = mkdtempSync(join(tmpdir(), "strauss-kb-update-mcp-"));
      try {
        const saved = bundle;
        bundle = other;
        await seedRefactor();
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
        )._registeredTools.kb_anchor_update;
        const raw = await tool!.handler({
          bundlePath: other,
          conceptId: ID,
          input: RENAME,
        });
        const viaMcp = JSON.parse(raw.content[0]!.text) as KbAnchorUpdateResult;
        expect(viaMcp.changes).toEqual(viaCommand.changes);
        expect(await anchors()).toEqual(afterCommand);
        bundle = saved;
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });

    test("the CLI reads the patch from stdin", async () => {
      await seedRefactor();
      vi.stubEnv("STRAUSS_KB_ACTOR", "agent:reviewer");
      const out = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      vi.spyOn(process.stdin, "setEncoding").mockReturnValue(process.stdin);
      vi.spyOn(process.stdin, "on").mockImplementation(((
        event: string,
        listener: (chunk?: string) => void,
      ) => {
        if (event === "data") listener(JSON.stringify(RENAME));
        if (event === "end") listener();
        return process.stdin;
      }) as never);

      await runKbCli(["--bundle", bundle, "anchor-update", ID]);
      out.mockRestore();
      vi.restoreAllMocks();

      expect((await anchors()).map((anchor) => anchor.symbol)).toEqual([
        "isExportExpired",
        "canDownloadExport",
        "retentionDays",
      ]);
    });
  });

  describe("the audit trail", () => {
    test("logs one anchor-update entry with actor, reason and every change", async () => {
      await seedRefactor();

      await run(RENAME, "agent:reviewer");

      const entries = parseLog(
        readFileSync(join(bundle, "log.jsonl"), "utf8"),
      ).entries.filter((entry) => entry.operation === "anchor-update");
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        by: "agent:reviewer",
        conceptId: ID,
        reason: RENAME.reason,
        anchors: [
          {
            op: "replace",
            from: { file: CLEANUP, symbol: "shouldDeleteExport" },
            to: { file: CLEANUP, symbol: "isExportExpired" },
          },
          { op: "add", to: { file: RETENTION, symbol: "retentionDays" } },
        ],
      });
      expect(Date.parse(entries[0]!.at)).not.toBeNaN();
    });

    // The event says a pointer moved. It never says the code was read.
    test("writes no verified[] event", async () => {
      await seedRefactor();

      await run(RENAME);

      const record = await new KbStore().read(bundle, ID);
      expect(record?.frontmatter.verified).toEqual([]);
    });

    // A resolve pass that predates this command must still read its own log.
    test("entries written before the reason field still parse", () => {
      const legacy = `${JSON.stringify({
        at: "2026-01-01T00:00:00.000Z",
        by: "agent:resolver",
        operation: "anchor-resolve",
        conceptId: ID,
      })}\n`;

      expect(parseLog(legacy).entries).toHaveLength(1);
      expect(parseLog(legacy).malformed).toEqual([]);
    });
  });

  describe("drift is still the resolver's answer", () => {
    test("the moved pointer reports drift until it is rebaselined", async () => {
      await seedRefactor();
      await run(RENAME);
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

      const before = await call(false);
      expect(before.results.map((entry) => entry.state).sort()).toEqual([
        "drifted",
        "match",
        "stamped",
      ]);

      await call(true);
      const after = await call(false);
      expect(after.results.every((entry) => entry.state === "match")).toBe(
        true,
      );
    });
  });

  describe("removal", () => {
    test("drops only its target", async () => {
      await seedRefactor();
      const before = await anchors();

      const result = await run({
        reason: "The download side moved to another service.",
        remove: [{ file: DOWNLOAD }],
      });

      expect(result.changes).toEqual([
        { op: "remove", from: { file: DOWNLOAD, symbol: "canDownloadExport" } },
      ]);
      expect(await anchors()).toEqual([before[0]]);
    });
  });

  describe("refusals leave the record and the log alone", () => {
    const refusals: [string, unknown, string][] = [
      [
        "a patch with no operations",
        { reason: "nothing to do" },
        "KbAnchorPatchEmptyError",
      ],
      [
        "a selector matching nothing",
        {
          reason: "rename",
          replace: [
            {
              from: { file: CLEANUP, symbol: "missing" },
              to: { file: CLEANUP, symbol: "isExportExpired" },
            },
          ],
        },
        "KbAnchorSelectorError",
      ],
      [
        "two operations on one anchor",
        {
          reason: "rename twice",
          replace: [
            {
              from: { file: CLEANUP },
              to: { file: CLEANUP, symbol: "isExportExpired" },
            },
          ],
          remove: [{ file: CLEANUP, symbol: "shouldDeleteExport" }],
        },
        "KbAnchorPatchConflictError",
      ],
      [
        "an addition that duplicates an existing anchor",
        {
          reason: "add what is already there",
          add: [{ file: DOWNLOAD, symbol: "canDownloadExport" }],
        },
        "KbAnchorPatchConflictError",
      ],
      [
        "two additions at one locator",
        {
          reason: "add it twice",
          add: [
            { file: RETENTION, symbol: "retentionDays" },
            { file: RETENTION, symbol: "retentionDays" },
          ],
        },
        "KbAnchorPatchConflictError",
      ],
      [
        "a replacement that crosses into another repository",
        {
          reason: "move it elsewhere",
          replace: [
            {
              from: { file: CLEANUP, symbol: "shouldDeleteExport" },
              to: {
                file: CLEANUP,
                symbol: "isExportExpired",
                repo: "https://github.com/other/repo",
              },
            },
          ],
        },
        "KbAnchorBoundaryError",
      ],
    ];

    for (const [name, input, error] of refusals) {
      test(name, async () => {
        await seedRefactor();
        const before = snapshot(bundle);

        await expect(run(input)).rejects.toMatchObject({ name: error });

        expect(snapshot(bundle)).toEqual(before);
      });
    }

    test("a hash the caller tried to inject", async () => {
      await seedRefactor();
      const before = snapshot(bundle);

      expect(() =>
        anchorUpdateCommand.input.parse({
          bundlePath: bundle,
          conceptId: ID,
          input: {
            reason: "carry the baseline across",
            add: [
              {
                file: RETENTION,
                symbol: "retentionDays",
                hash: `sha256:${"0".repeat(64)}`,
              },
            ],
          },
        }),
      ).toThrow(/hash/);

      expect(snapshot(bundle)).toEqual(before);
    });

    test("a `to` naming both a symbol and a span", async () => {
      await seedRefactor();
      const before = snapshot(bundle);

      await expect(
        run({
          reason: "widen it",
          replace: [
            {
              from: { file: CLEANUP, symbol: "shouldDeleteExport" },
              to: {
                file: CLEANUP,
                symbol: "isExportExpired",
                span: { start: 1, end: 5 },
              },
            },
          ],
        }),
      ).rejects.toThrow(/symbol or a span/);

      expect(snapshot(bundle)).toEqual(before);
    });

    // Not the CLI's parse: a library caller forwarding its own JSON has no
    // boundary, and this is the one field the command exists to refuse.
    test("a baseline injected past the surface schema, straight into the library", () => {
      const anchor: KbAnchor = {
        file: CLEANUP,
        symbol: "shouldDeleteExport",
        hash: `sha256:${"a".repeat(64)}`,
      };
      const forged = {
        reason: "carry the baseline across",
        replace: [
          {
            from: { file: CLEANUP },
            to: {
              file: CLEANUP,
              symbol: "isExportExpired",
              hash: `sha256:${"f".repeat(64)}`,
              resolved_at: "2099-01-01T00:00:00.000Z",
            },
          },
        ],
      } as unknown as AnchorPatchInput;

      expect(() => applyAnchorPatch(ID, [anchor], forged)).toThrow(/hash/);
    });

    test("two spellings of one remote at one locator", () => {
      const anchor: KbAnchor = {
        file: "lib/a.go",
        symbol: "Retention",
        repo: "https://github.com/org/name",
      };

      expect(() =>
        applyAnchorPatch(ID, [anchor], {
          reason: "add the same place under another spelling",
          add: [
            {
              file: "lib/a.go",
              symbol: "Retention",
              repo: "https://github.com/org/name.git",
            },
          ],
        }),
      ).toThrow(/appear twice/);
    });

    test("a selector spelled as the ssh remote finds the https anchor", () => {
      const anchor: KbAnchor = {
        file: "lib/a.go",
        symbol: "Retention",
        repo: "https://github.com/org/name",
      };

      const applied = applyAnchorPatch(ID, [anchor], {
        reason: "one remote, another spelling",
        remove: [
          {
            file: "lib/a.go",
            symbol: "Retention",
            repo: "git@github.com:org/name.git",
          },
        ],
      });

      expect(applied.anchors).toEqual([]);
    });

    test("a reason of only whitespace", () => {
      expect(() =>
        anchorUpdateCommand.input.parse({
          bundlePath: bundle,
          conceptId: ID,
          input: { reason: "   ", remove: [{ file: DOWNLOAD }] },
        }),
      ).toThrow(/reason/);
    });

    test("a record that does not exist", async () => {
      await seedRefactor();
      const before = snapshot(bundle);

      await expect(
        anchorUpdateCommand.run(
          {
            store: new KbStore(),
            actor: "agent:reviewer",
            now: () => "2026-09-17T12:00:00Z",
          },
          anchorUpdateCommand.input.parse({
            bundlePath: bundle,
            conceptId: "decision.not-here",
            input: RENAME,
          }),
        ),
      ).rejects.toMatchObject({ name: "KbRecordNotFoundError" });

      expect(snapshot(bundle)).toEqual(before);
    });

    test("a frozen base", async () => {
      await seedRefactor();
      const workspace = mkdtempSync(join(tmpdir(), "strauss-kb-update-ws-"));
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
        const before = snapshot(bundle);

        await expect(run(RENAME)).rejects.toMatchObject({
          name: "KbBaseFrozenError",
        });

        expect(snapshot(bundle)).toEqual(before);
      } finally {
        cwd.mockRestore();
        rmSync(workspace, { recursive: true, force: true });
      }
    });

    test("an ambiguous selector names how to narrow it", async () => {
      writeSource(CLEANUP, CLEANUP_BEFORE);
      await seed([
        { file: CLEANUP, symbol: "shouldDeleteExport" },
        { file: CLEANUP, symbol: "exportPath" },
      ]);

      await expect(
        run({ reason: "drop one", remove: [{ file: CLEANUP }] }),
      ).rejects.toMatchObject({
        name: "KbAnchorSelectorError",
        details: { matched: 2 },
      });
    });
  });

  describe("locator shapes", () => {
    test("a file-only anchor can be narrowed to a symbol, baseline intact", async () => {
      writeSource(CLEANUP, CLEANUP_BEFORE);
      await seed([
        {
          file: CLEANUP,
          hash: `sha256:${"a".repeat(64)}`,
          resolved_at: "2026-08-01T00:00:00Z",
        },
      ]);

      await run({
        reason: "The file's one exported symbol is where the policy lives.",
        replace: [
          {
            from: { file: CLEANUP },
            to: { file: CLEANUP, symbol: "isExportExpired" },
          },
        ],
      });

      expect(await anchors()).toEqual([
        {
          file: CLEANUP,
          symbol: "isExportExpired",
          hash: `sha256:${"a".repeat(64)}`,
          resolved_at: "2026-08-01T00:00:00Z",
        },
      ]);
    });

    test("a span replaces a symbol rather than joining it", async () => {
      await seed([{ file: DOWNLOAD, symbol: "canDownloadExport" }]);

      await run({
        reason: "The clause is a block of config, not a function.",
        replace: [
          {
            from: { file: DOWNLOAD, symbol: "canDownloadExport" },
            to: { file: DOWNLOAD, span: { start: 4, end: 9 } },
          },
        ],
      });

      expect(await anchors()).toEqual([
        { file: DOWNLOAD, span: { start: 4, end: 9 } },
      ]);
    });

    test("a pinned foreign anchor keeps repo, ref and baseline through a rename", async () => {
      const foreign: KbAnchor = {
        file: "lib/retention.go",
        symbol: "OldName",
        repo: "https://github.com/other/repo",
        ref: "9f2c3d4e5f60718293a4b5c6d7e8f90123456789",
        hash: `sha256:${"b".repeat(64)}`,
        hash_kind: "ast",
        resolver: "tree-sitter",
        lines: 12,
        resolved_at: "2026-08-01T00:00:00Z",
      };
      await seed([foreign]);

      await run({
        reason: "Upstream renamed it in the same commit.",
        replace: [
          {
            from: { file: "lib/retention.go", symbol: "OldName" },
            to: { file: "lib/retention.go", symbol: "NewName" },
          },
        ],
      });

      expect(await anchors()).toEqual([{ ...foreign, symbol: "NewName" }]);
    });

    test("a selector can name repo and ref to pick between same-named anchors", async () => {
      await seed([
        { file: "lib/a.go", symbol: "Retention" },
        {
          file: "lib/a.go",
          symbol: "Retention",
          repo: "https://github.com/other/repo",
        },
      ]);

      await run({
        reason: "Only the upstream one moved.",
        replace: [
          {
            from: {
              file: "lib/a.go",
              symbol: "Retention",
              repo: "https://github.com/other/repo",
            },
            to: { file: "lib/a.go", symbol: "RetentionDays" },
          },
        ],
      });

      expect(await anchors()).toEqual([
        { file: "lib/a.go", symbol: "Retention" },
        {
          file: "lib/a.go",
          symbol: "RetentionDays",
          repo: "https://github.com/other/repo",
        },
      ]);
    });
  });

  describe("concurrency", () => {
    // The patch is computed inside the mutation, so an edit that landed first
    // is patched on top of rather than overwritten.
    test("an unrelated anchor added first survives the patch", async () => {
      await seedRefactor();
      await new KbStore().updateAnchors(
        bundle,
        ID,
        [...(await anchors()), { file: "src/audit.mjs" }],
        "agent:other",
      );

      await run(RENAME);

      expect((await anchors()).map((anchor) => anchor.file)).toEqual([
        CLEANUP,
        DOWNLOAD,
        "src/audit.mjs",
        RETENTION,
      ]);
    });
  });

  describe("the command table", () => {
    test("is registered under both surfaces with a stdin adapter", async () => {
      const command = KB_COMMANDS_BY_NAME.get("anchor-update");
      expect(command?.tool).toBe("kb_anchor_update");
      expect(command?.usage.startsWith("anchor-update")).toBe(true);
      expect(
        await command?.fromArgv(["anchor-update", ID], bundle, () =>
          Promise.resolve(JSON.stringify(RENAME)),
        ),
      ).toEqual({ bundlePath: bundle, conceptId: ID, input: RENAME });
    });
  });
});

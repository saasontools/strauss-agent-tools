import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Counted rather than stubbed: whether a second pass re-reads a file only the
// real `readFile` can answer.
const reads: string[] = [];
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    default: real,
    readFile: (path: string, ...rest: unknown[]) => {
      reads.push(String(path));
      return (real.readFile as (...args: unknown[]) => unknown)(path, ...rest);
    },
  };
});

const { composeRecord } = await import("../../compose.js");
const { KbStore } = await import("../../kb-store.js");
const { TreeSitterResolver } =
  await import("../../tree-sitter-resolver/index.js");
const { classifyCommand } = await import("../classify/index.js");
const { matchCommand } = await import("./command.js");
const { resetParsedCache } = await import("./parsed-cache.js");

const AT = "2026-08-01T00:00:00Z";
const FILE = "src/order.service.ts";
const SOURCE = [
  "export function listOrders(after: string): Order[] {",
  "  void after;",
  "  return [];",
  "}",
  "",
  "export function cancel(id: string): void {",
  "  void id;",
  "}",
  "",
].join("\n");

const ctx = { store: new KbStore(), actor: "agent:reader", now: () => AT };
const files = [{ filePath: FILE, hunks: [{ startLine: 1, endLine: 4 }] }];

describe("the resolver pass is paid once per blob", () => {
  let repo: string;
  let bundle: string;

  beforeEach(async () => {
    reads.length = 0;
    resetParsedCache();
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-parsed-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-parsed-bundle-"));
    mkdirSync(dirname(join(repo, FILE)), { recursive: true });
    writeFileSync(join(repo, FILE), SOURCE, "utf8");
    await ctx.store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "cursor",
          title: "Decision cursor",
          why: "Offsets skip rows under concurrent writes.",
          anchors: [{ file: FILE, symbol: "listOrders" }],
        },
        "agent:writer",
        AT,
      ),
      "agent:writer",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(repo, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
  });

  const match = () =>
    matchCommand.run(
      ctx,
      matchCommand.input.parse({
        bundlePath: bundle,
        repoRoot: repo,
        offline: true,
        files,
      }),
    );

  const classify = () =>
    classifyCommand.run(
      ctx,
      classifyCommand.input.parse({
        bundlePath: bundle,
        repoRoot: repo,
        offline: true,
        files,
      }),
    );

  test("classify after match on the same range parses nothing again", async () => {
    await match();
    const attempt = vi.spyOn(TreeSitterResolver.prototype, "attempt");

    await classify();
    expect(attempt).not.toHaveBeenCalled();
  });

  test("a second match on the same range parses nothing again", async () => {
    await match();
    const attempt = vi.spyOn(TreeSitterResolver.prototype, "attempt");

    const again = await match();
    expect(attempt).not.toHaveBeenCalled();
    expect(again).toHaveLength(1);
  });

  test("an edited file is parsed again", async () => {
    await match();
    writeFileSync(join(repo, FILE), `// moved\n${SOURCE}`, "utf8");
    const attempt = vi.spyOn(TreeSitterResolver.prototype, "attempt");

    await match();
    expect(attempt).toHaveBeenCalled();
  });

  test("the cache is keyed by offline, so an online pass is not served a fallback", async () => {
    await match();
    const attempt = vi.spyOn(TreeSitterResolver.prototype, "attempt");

    await matchCommand.run(
      ctx,
      matchCommand.input.parse({ bundlePath: bundle, repoRoot: repo, files }),
    );
    expect(attempt).toHaveBeenCalled();
  });

  test("a regex fallback is not served to a pass that has the grammar", async () => {
    vi.spyOn(TreeSitterResolver.prototype, "attempt").mockReturnValue({
      kind: "abstain",
    });
    await match();
    vi.restoreAllMocks();

    const attempt = vi.spyOn(TreeSitterResolver.prototype, "attempt");
    const again = await match();
    expect(attempt).toHaveBeenCalled();
    expect(again).toHaveLength(1);
  });

  test("a grammar that would not load is not remembered as a miss", async () => {
    vi.spyOn(TreeSitterResolver.prototype, "attempt").mockReturnValue({
      kind: "unresolved",
      reason: "resolver-unavailable",
    });
    await match();
    vi.restoreAllMocks();

    const attempt = vi.spyOn(TreeSitterResolver.prototype, "attempt");
    await match();
    expect(attempt).toHaveBeenCalled();
  });

  test("a file that could not be read is not read again", async () => {
    chmodSync(join(repo, FILE), 0o000);
    await match();
    const tried = reads.filter((path) => path.endsWith(FILE)).length;
    expect(tried).toBeGreaterThan(0);

    await match();
    expect(reads.filter((path) => path.endsWith(FILE))).toHaveLength(tried);
    chmodSync(join(repo, FILE), 0o644);
  });
});

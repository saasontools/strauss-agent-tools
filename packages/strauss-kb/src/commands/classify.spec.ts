import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import type { KbClassifyResult } from "../classify/index.js";
import { composeRecord } from "../compose.js";
import { KbStore } from "../kb-store.js";
import { classifyCommand, renderClassify } from "./classify.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const noStdin = () => Promise.resolve("");
const store = new KbStore();
const ctx = {
  store,
  actor: "agent:test",
  now: () => "2026-09-01T09:00:00.000Z",
};

const asStdin = (files: unknown) => () =>
  Promise.resolve(JSON.stringify({ files }));

async function classify(argv: string[], bundle: string, stdin = noStdin) {
  const raw = await classifyCommand.fromArgv(argv, bundle, stdin);
  return (await classifyCommand.run(
    ctx,
    classifyCommand.input.parse(raw),
  )) as KbClassifyResult;
}

describe("classifyCommand argv", () => {
  const bundle = join(tmpdir(), "strauss-kb-classify-empty");

  test("--stdin takes the files array", async () => {
    const result = await classify(
      ["classify", "--stdin"],
      bundle,
      asStdin([{ filePath: "docs/README.md", hunks: [] }]),
    );
    expect(result.files).toEqual([
      { filePath: "docs/README.md", class: "docs", reason: "docs-path" },
    ]);
  });

  test("neither --git nor --stdin is refused", async () => {
    await expect(classify(["classify"], bundle)).rejects.toThrow(
      /--git <base>\.\.<head>/,
    );
  });

  test("stdin that is not JSON is refused", async () => {
    await expect(
      classify(["classify", "--stdin"], bundle, () => Promise.resolve("{")),
    ).rejects.toThrow(/stdin is not JSON/);
  });

  test("a range git cannot read is refused by name", async () => {
    await expect(
      classify(
        ["classify", "--git", "..HEAD", "--repo-root", REPO_ROOT],
        bundle,
      ),
    ).rejects.toThrow(/both halves/);
  });

  test("--offline reaches the input", async () => {
    expect(
      await classifyCommand.fromArgv(
        ["classify", "--stdin", "--offline"],
        bundle,
        asStdin([]),
      ),
    ).toMatchObject({ offline: true });
  });

  // The banner sits past the 64 KiB the read takes, on a line the window would
  // otherwise have counted: `source` is the read staying bounded.
  test("the banner comes from a bounded prefix, not the whole file", async () => {
    const root = mkdtempSync(join(tmpdir(), "strauss-kb-classify-big-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src/big.ts"),
      `// head\n${"x".repeat(100_000)}@generated\n${"y".repeat(1_000_000)}\n`,
      "utf8",
    );

    try {
      const { files } = await classify(
        ["classify", "--stdin", "--repo-root", root],
        bundle,
        asStdin([{ filePath: "src/big.ts", hunks: [] }]),
      );
      expect(files[0]).toMatchObject({ class: "source", reason: "default" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("renders one line per file", () => {
    expect(
      renderClassify({
        files: [
          { filePath: "docs/README.md", class: "docs", reason: "docs-path" },
          { filePath: "src/a.ts", class: "source", reason: "default" },
        ],
      }),
    ).toBe("docs    docs/README.md  (docs-path)\nsource  src/a.ts  (default)");
  });
});

/** `listOrders` spans lines 3-6, `cancel` lines 8-10. */
const SOURCE = [
  "export type Order = { id: string; amount: number };",
  "",
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

describe("classifyCommand symbol-scoped overrides", () => {
  const FILE = "src/order.service.ts";
  let repo: string;
  let bundle: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-classify-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-classify-bundle-"));
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, FILE), SOURCE, "utf8");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
  });

  test("an override on a symbol classifies only the hunks it spans", async () => {
    await store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug: "barrel",
          title: "listOrders only re-exports",
          why: "Reviewers keep reading a function that decides nothing.",
          anchors: [{ file: FILE, symbol: "listOrders" }],
          tags: ["review", "review:boilerplate"],
        },
        "agent:writer",
        "2026-08-01T00:00:00Z",
      ),
      "agent:writer",
    );

    const { files } = await classify(
      ["classify", "--stdin", "--repo-root", repo],
      bundle,
      asStdin([
        {
          filePath: FILE,
          hunks: [
            { startLine: 5, endLine: 5 },
            { startLine: 9, endLine: 9 },
          ],
        },
      ]),
    );

    expect(files[0]).toMatchObject({ class: "source", reason: "default" });
    expect(files[0]?.hunks).toEqual([
      {
        startLine: 5,
        endLine: 5,
        class: "boilerplate",
        reason: "kb-override fact.barrel",
      },
      { startLine: 9, endLine: 9, class: "source", reason: "default" },
    ]);
  });
});

/**
 * The companion fixture, through the CLI path a consumer uses. Loaded by URL
 * rather than imported: the fixture project already depends on this package,
 * and a static import would close the loop.
 */
describe("classify --git over the companion fixture", () => {
  let repo: string;
  let fixture: {
    materialize: (options: { out: string }) => { repo: string };
    readExpected: (scenario: string) => { classifier: Record<string, string> };
    scenarioNames: () => string[];
  };

  // The checkout is isolated, but so must be the `readRangeDiff` spawn: it
  // inherits this process's environment, host git config and all.
  const saved = {
    GIT_CONFIG_GLOBAL: process.env["GIT_CONFIG_GLOBAL"],
    GIT_CONFIG_SYSTEM: process.env["GIT_CONFIG_SYSTEM"],
  };

  beforeAll(async () => {
    // An empty file, not the null device: git on Windows rejects the latter.
    const emptyConfig = join(
      mkdtempSync(join(tmpdir(), "strauss-kb-gitconfig-")),
      "empty",
    );
    writeFileSync(emptyConfig, "");
    process.env["GIT_CONFIG_GLOBAL"] = emptyConfig;
    process.env["GIT_CONFIG_SYSTEM"] = emptyConfig;
    fixture = (await import(
      pathToFileURL(join(REPO_ROOT, "fixtures/companion-repo/materialize.mjs"))
        .href
    )) as typeof fixture;
    repo = fixture.materialize({
      out: mkdtempSync(join(tmpdir(), "strauss-kb-classify-")),
    }).repo;
  }, 120_000);

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  test("every scenario matches its expected.json classifier map", async () => {
    for (const scenario of fixture.scenarioNames()) {
      // On the branch, so the bundle and the generated banners are at head.
      execFileSync("git", ["-C", repo, "checkout", "--quiet", scenario]);
      const { files } = await classify(
        ["classify", "--git", `main...${scenario}`, "--repo-root", repo],
        join(repo, ".strauss/kb"),
      );

      expect(
        Object.fromEntries(files.map((file) => [file.filePath, file.class])),
        scenario,
      ).toEqual(fixture.readExpected(scenario).classifier);
    }
  }, 120_000);
});

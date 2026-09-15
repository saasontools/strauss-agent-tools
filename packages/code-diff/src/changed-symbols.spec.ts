import { describe, expect, test } from "vitest";
import {
  changedSymbols,
  contextSymbol,
  type Declaration,
} from "./changed-symbols.js";
import type { DiffFile } from "./model.js";

/** tenant.service.ts at the silent-code-change head, as a parse sees it. */
const TENANT: Declaration[] = [
  { name: "TenantRepository", startLine: 3, endLine: 5 },
  { name: "TenantService", startLine: 11, endLine: 23 },
  { name: "TenantService.findMany", startLine: 14, endLine: 22 },
  { name: "chunkIds", startLine: 25, endLine: 31 },
];

const file = (hunks: DiffFile["hunks"]): DiffFile => ({
  filePath: "src/services/tenant.service.ts",
  hunks,
});

describe("changedSymbols from declarations", () => {
  test("the smallest declaration holding the hunk names it", () => {
    const [hit] = changedSymbols(
      file([{ startLine: 15, endLine: 15 }]),
      TENANT,
    );
    expect(hit).toMatchObject({
      symbol: "TenantService.findMany",
      via: "parse",
    });
  });

  test("a hunk outside every declaration is file scope", () => {
    const [hit] = changedSymbols(file([{ startLine: 9, endLine: 9 }]), TENANT);
    expect(hit).toMatchObject({ symbol: null, via: "parse" });
  });

  test("a hunk crossing two declarations is named by what holds both, or nothing", () => {
    const [inside, across] = changedSymbols(
      file([
        { startLine: 13, endLine: 16 },
        { startLine: 22, endLine: 26 },
      ]),
      TENANT,
    );
    expect(inside?.symbol).toBe("TenantService");
    expect(across?.symbol).toBeNull();
  });

  test("blank lines at a hunk's edges do not widen it", () => {
    const report: Declaration[] = [
      { name: "ReportBuilder", startLine: 6, endLine: 19 },
      { name: "ReportBuilder.fromCharge", startLine: 11, endLine: 18 },
    ];
    const [hit] = changedSymbols(
      {
        filePath: "report.ts",
        hunks: [
          {
            startLine: 10,
            endLine: 18,
            lines: [
              "",
              "  /**",
              "   * Reads the charge result.",
              "   */",
              "  // one more",
              "  fromCharge(orderId: string, charge: ChargeResult): ReportRow {",
              "    return { orderId, amountMinor: charge.attempts };",
              "  }",
              "",
            ],
          },
        ],
      },
      report,
    );
    expect(hit?.symbol).toBe("ReportBuilder.fromCharge");
  });

  test("old-side hunks name nothing: the declarations are the new tree's", () => {
    expect(
      changedSymbols(
        file([{ startLine: 15, endLine: 15, side: "old" }]),
        TENANT,
      ),
    ).toEqual([]);
  });
});

describe("changedSymbols without a grammar", () => {
  test("git's function context names the hunk, and says so", () => {
    const [named, bare] = changedSymbols(
      file([
        { startLine: 15, endLine: 15, context: "export class TenantService {" },
        { startLine: 1, endLine: 1 },
      ]),
    );
    expect(named).toMatchObject({ symbol: "TenantService", via: "funcname" });
    expect(bare).toMatchObject({ symbol: null, via: "funcname" });
  });

  test.for([
    ["export class TenantService {", "TenantService"],
    ["async function load(id) {", "load"],
    ["def run(self):", "run"],
    ["func (s *Server) Cancel() {", "Cancel"],
    ["  public async findMany(ids: string[]) {", "findMany"],
    ["  if (ready) {", null],
    ["const CHUNK_SIZE = 100;", null],
  ] as const)("%s → %s", ([context, name]) => {
    expect(contextSymbol(context)).toBe(name);
  });
});

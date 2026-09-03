import { describe, expect, test } from "vitest";
import { adjudicate } from "./adjudicate.js";
import type { KbAnchorDriftEntry } from "./anchor-resolver.js";
import type { KbRecord, KbRecordStatus } from "./kb-record.schema.js";

function record(
  conceptId: string,
  frontmatter: Partial<KbRecord["frontmatter"]> = {},
): KbRecord {
  const [type] = conceptId.split(".");
  return {
    conceptId,
    frontmatter: {
      type: type as string,
      strauss_status: "accepted" as KbRecordStatus,
      generated: { by: "test", at: "2026-08-01T00:00:00Z" },
      ...frontmatter,
    } as KbRecord["frontmatter"],
    body: "Body.",
  };
}

const HASH = `sha256:${"ab".repeat(32)}`;

describe("adjudicate anchor drift", () => {
  test("flags a record whose drift entries include a non-match", () => {
    const anchored = record("decision.cursor-keyset");
    const drift = new Map<string, KbAnchorDriftEntry[]>([
      [
        "decision.cursor-keyset",
        [
          {
            file: "src/order.service.ts",
            symbol: "OrderService.list",
            state: "drifted",
            storedHash: HASH,
            currentHash: `sha256:${"cd".repeat(32)}`,
            diffSize: 6,
          },
        ],
      ],
    ]);

    const [hit] = adjudicate([anchored], [anchored], new Date(), drift);

    expect(hit?.warnings).toContainEqual({
      kind: "drifted",
      anchors: [
        {
          file: "src/order.service.ts",
          symbol: "OrderService.list",
          diffSize: 6,
        },
      ],
    });
  });

  // An anchor that cannot be re-resolved is drift too — the described code is
  // gone, not merely changed — and the reason travels with the warning.
  test("carries only the non-match entries, with their reasons", () => {
    const anchored = record("fact.cache-shape");
    const drift = new Map<string, KbAnchorDriftEntry[]>([
      [
        "fact.cache-shape",
        [
          {
            file: "src/cache.ts",
            state: "match",
            storedHash: HASH,
            currentHash: HASH,
            diffSize: 0,
          },
          {
            file: "src/removed.ts",
            state: "unresolved",
            storedHash: HASH,
            diffSize: null,
            reason: "file-missing",
          },
        ],
      ],
    ]);

    const [hit] = adjudicate([anchored], [anchored], new Date(), drift);
    const warning = hit?.warnings.find((w) => w.kind === "drifted");

    expect(warning).toEqual({
      kind: "drifted",
      anchors: [
        { file: "src/removed.ts", diffSize: null, reason: "file-missing" },
      ],
    });
  });

  test("an all-match map produces no drifted warning", () => {
    const anchored = record("decision.cursor-keyset");
    const drift = new Map<string, KbAnchorDriftEntry[]>([
      [
        "decision.cursor-keyset",
        [
          {
            file: "src/order.service.ts",
            state: "match",
            storedHash: HASH,
            currentHash: HASH,
            diffSize: 0,
          },
        ],
      ],
    ]);

    const [hit] = adjudicate([anchored], [anchored], new Date(), drift);
    expect(hit?.warnings.some((w) => w.kind === "drifted")).toBe(false);
  });

  test("an absent map leaves the existing warnings untouched", () => {
    const now = new Date("2026-08-26");
    const stale = record("fact.old", { stale_after: "2026-01-01" });

    const [without] = adjudicate([stale], [stale], now);
    const [withEmpty] = adjudicate([stale], [stale], now, new Map());

    expect(without?.warnings).toEqual([
      { kind: "stale", staleAfter: "2026-01-01" },
      { kind: "unverified" },
    ]);
    expect(withEmpty?.warnings).toEqual(without?.warnings);
  });
});

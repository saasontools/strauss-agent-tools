import { describe, expect, test } from "vitest";
import { DEFAULT_IO_CONCURRENCY, mapLimit } from "./concurrency.js";

/** Resolves once `release()` is called, so in-flight work can be held open. */
function gate(): { promise: Promise<void>; release: () => void } {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return { promise, release };
}

describe("mapLimit", () => {
  test("returns results index-aligned with the input, not completion order", async () => {
    const items = [30, 20, 10, 0];

    const out = await mapLimit(items, 4, async (ms, index) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return `${index}:${ms}`;
    });

    expect(out).toEqual(["0:30", "1:20", "2:10", "3:0"]);
  });

  // The whole point of the helper: a large base must not open every file at once.
  test("never runs more than `limit` at a time", async () => {
    const gates = Array.from({ length: 10 }, () => gate());
    let inFlight = 0;
    let peak = 0;

    const run = mapLimit(gates, 3, async (held) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await held.promise;
      inFlight -= 1;
      return null;
    });

    for (const held of gates) {
      held.release();
      await Promise.resolve();
    }
    await run;

    expect(peak).toBe(3);
  });

  test("empty input resolves to an empty array without calling the worker", async () => {
    let calls = 0;

    await expect(
      mapLimit([], DEFAULT_IO_CONCURRENCY, async () => {
        calls += 1;
        return 1;
      }),
    ).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  test("a limit above the item count runs every item once", async () => {
    const seen: number[] = [];

    const out = await mapLimit([1, 2, 3], 100, async (value) => {
      seen.push(value);
      return value * 2;
    });

    expect(out).toEqual([2, 4, 6]);
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  // Isolation is the caller's job — `readAnchorFiles` catches inside its worker.
  test("a rejection propagates to the caller", async () => {
    await expect(
      mapLimit([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error("boom");
        return value;
      }),
    ).rejects.toThrow("boom");
  });

  test.each([Number.NaN, 0, -1, 1.5])(
    "rejects a limit of %p rather than silently running serially",
    async (limit) => {
      await expect(mapLimit([1], limit, async (v) => v)).rejects.toThrow(
        RangeError,
      );
    },
  );
});

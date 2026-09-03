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

  // Once one item rejects, no new item may start — in-flight items still
  // finish (they were already running before the failure was known), but
  // nothing past the failure point gets a chance to.
  test("stops starting new items after a rejection, letting in-flight items finish", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const started = new Set<number>();
    const gates = new Map(
      items.filter((item) => item !== 2).map((item) => [item, gate()]),
    );
    let failItem2 = (): void => undefined;
    const item2Gate = new Promise<void>((resolve) => {
      failItem2 = resolve;
    });

    const run = mapLimit(items, 2, async (value) => {
      started.add(value);
      if (value === 2) {
        await item2Gate;
        throw new Error("boom-2");
      }
      await gates.get(value)!.promise;
      return value;
    });

    // The two runners settle onto items 1 and 2, one item each.
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(new Set([1, 2]));

    // Item 1 finishes, so its runner picks up item 3 — item 2 has not
    // failed yet, so this is still a legitimate start.
    gates.get(1)!.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(new Set([1, 2, 3]));

    // Same again for item 4.
    gates.get(3)!.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(new Set([1, 2, 3, 4]));

    // Now item 2 rejects. Item 4's runner must see the failure flag before
    // it would otherwise reach for item 5, so items 5 and 6 never start.
    failItem2();
    gates.get(4)!.release();

    await expect(run).rejects.toThrow("boom-2");
    expect(started).toEqual(new Set([1, 2, 3, 4]));
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

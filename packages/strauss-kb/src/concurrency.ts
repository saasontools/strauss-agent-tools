/**
 * Bounded fan-out for the store's I/O paths.
 *
 * Unbounded `Promise.all` over a bundle hits EMFILE on a large base; a serial
 * loop pays full syscall latency per file. One shared pool sits between them.
 */

/** Default in-flight file operations. Bounded so a large base cannot hit EMFILE. */
export const DEFAULT_IO_CONCURRENCY = 16;

/**
 * Runs `fn` over `items` with at most `limit` in flight.
 *
 * Results are index-aligned with `items` regardless of completion order. A
 * rejection propagates; a caller wanting per-item isolation catches inside `fn`.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(
      `mapLimit: "limit" must be a positive integer, got ${limit}`,
    );
  }
  const out = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (!failed && next < items.length) {
        const at = next++;
        try {
          out[at] = await fn(items[at] as T, at);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    },
  );
  await Promise.all(runners);
  return out;
}

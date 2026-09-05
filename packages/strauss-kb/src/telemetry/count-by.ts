/** `{ value: count }` over `items`, skipping the ones with no value. */
export function countBy<T>(
  items: readonly T[],
  of: (item: T) => string | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = of(item);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

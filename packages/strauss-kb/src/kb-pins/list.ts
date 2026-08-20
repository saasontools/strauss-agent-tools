import type { KbStore } from "../kb-store.js";
import { readMergedPins } from "./layers.js";
import type { KbPinStatus } from "./model.js";

/** Every effective pin across the layers, with whether it points at records. */
export async function listPins(
  store: KbStore,
  workspaceDir: string,
): Promise<KbPinStatus[]> {
  const merged = await readMergedPins(workspaceDir);
  return Promise.all(
    merged.pins.map(async (entry) => {
      const records = await store.list(entry.absolutePath);
      return {
        path: entry.path,
        layer: entry.layer,
        pinnedAt: entry.pinnedAt ?? null,
        absolutePath: entry.absolutePath,
        valid: records.length > 0,
        recordCount: records.length,
        mode: entry.mode ?? null,
        profiles: entry.profiles ?? null,
        frozen: entry.frozen === true,
      };
    }),
  );
}

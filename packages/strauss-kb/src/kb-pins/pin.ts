import type { KbStore } from "../kb-store.js";
import {
  layerRoot,
  readPinsLayer,
  resolvePinPath,
  storablePath,
  writePinsLayer,
} from "./layers.js";
import type { KbPin, KbPinOptions, KbPinResult } from "./model.js";

/**
 * Adds a base to one layer's manifest. Idempotent — re-pinning a pinned path
 * with no options returns the existing entry untouched, and re-pinning with
 * `mode`, `profiles`, or `frozen` updates just those fields, which is how a
 * pin's rendering or writability is changed. A path that is not (yet) a valid
 * base succeeds with a warning: bases are routinely pinned before they are
 * populated, the same way records link to records that do not exist yet.
 */
export async function pinBase(
  store: KbStore,
  workspaceDir: string,
  bundlePath: string,
  at: string,
  options: KbPinOptions = {},
): Promise<KbPinResult> {
  const layer = options.layer ?? "project";
  const root = layerRoot(workspaceDir, layer);
  const manifest = await readPinsLayer(workspaceDir, layer);
  const absolute = resolvePinPath(root, storablePath(root, bundlePath));

  const existing = manifest.pins.find(
    (entry) => resolvePinPath(root, entry.path) === absolute,
  );
  const records = await store.list(absolute);
  const warning =
    records.length === 0
      ? `no records found at ${absolute} — pinned anyway; bases are routinely pinned before they are populated`
      : undefined;

  const fields = {
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.profiles?.length ? { profiles: options.profiles } : {}),
    ...(options.frozen !== undefined ? { frozen: options.frozen } : {}),
  };

  if (existing) {
    const updated: KbPin = { ...existing, ...fields };
    if (Object.keys(fields).length) {
      await writePinsLayer(workspaceDir, layer, {
        ...manifest,
        pins: manifest.pins.map((entry) =>
          entry === existing ? updated : entry,
        ),
      });
    }
    return {
      path: existing.path,
      layer,
      pinnedAt: existing.pinnedAt ?? at,
      alreadyPinned: true,
      ...(updated.mode ? { mode: updated.mode } : {}),
      ...(updated.profiles ? { profiles: updated.profiles } : {}),
      ...(updated.frozen !== undefined ? { frozen: updated.frozen } : {}),
      ...(warning ? { warning } : {}),
    };
  }

  const entry: KbPin = {
    path: storablePath(root, bundlePath),
    pinnedAt: at,
    ...fields,
  };
  await writePinsLayer(workspaceDir, layer, {
    ...manifest,
    pins: [...manifest.pins, entry],
  });
  return {
    path: entry.path,
    layer,
    pinnedAt: at,
    alreadyPinned: false,
    ...fields,
    ...(warning ? { warning } : {}),
  };
}

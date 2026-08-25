import { resolve } from "node:path";
import {
  layerRoot,
  readPinsLayer,
  resolvePinPath,
  storablePath,
  writePinsLayer,
} from "./layers.js";
import { PIN_LAYERS, type KbPinLayer, type KbPinsManifest } from "./model.js";

/**
 * Removes a base from every layer that holds it — unpinned means gone, not
 * "gone from one file and still injected from another". A malformed layer is
 * skipped (it cannot be rewritten safely); the layers actually touched are
 * reported.
 */
export async function unpinBase(
  workspaceDir: string,
  bundlePath: string,
): Promise<{ path: string; removed: boolean; layers: KbPinLayer[] }> {
  const layers: KbPinLayer[] = [];
  for (const layer of PIN_LAYERS) {
    const root = layerRoot(workspaceDir, layer);
    let manifest: KbPinsManifest;
    try {
      manifest = await readPinsLayer(workspaceDir, layer);
    } catch {
      continue;
    }
    const absolute = resolvePinPath(root, storablePath(root, bundlePath));
    const kept = manifest.pins.filter(
      (entry) => resolvePinPath(root, entry.path) !== absolute,
    );
    if (kept.length !== manifest.pins.length) {
      await writePinsLayer(workspaceDir, layer, { ...manifest, pins: kept });
      layers.push(layer);
    }
  }
  return {
    path: storablePath(resolve(workspaceDir), bundlePath),
    removed: layers.length > 0,
    layers,
  };
}

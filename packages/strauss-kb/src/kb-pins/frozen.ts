import { resolve } from "node:path";
import { KbBaseFrozenError } from "./errors.js";
import { readMergedPins } from "./layers.js";

/**
 * Refuses when a write would land in a base this workspace froze. Called by
 * every mutating command; a workspace that pinned a base `--frozen` said the
 * base is concluded, and a quiet write past that would be exactly the silent
 * drift the pin was meant to stop.
 */
export async function assertBaseNotFrozen(
  workspaceDir: string,
  bundlePath: string,
): Promise<void> {
  const merged = await readMergedPins(workspaceDir);
  const absolute = resolve(bundlePath);
  const pin = merged.pins.find((entry) => entry.absolutePath === absolute);
  if (pin?.frozen === true) {
    throw new KbBaseFrozenError(pin.path, pin.layer);
  }
}

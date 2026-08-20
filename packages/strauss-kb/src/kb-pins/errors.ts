import type { KbPinLayer } from "./model.js";

export class KbPinsMalformedError extends Error {
  constructor(file: string, cause: string) {
    super(`pin manifest ${file} is not readable (${cause}) — fix or remove it`);
    this.name = "KbPinsMalformedError";
  }
}

export class KbBaseFrozenError extends Error {
  constructor(bundlePath: string, layer: KbPinLayer) {
    super(
      `${bundlePath} is frozen (read-only) by this workspace's ${layer} pin manifest — re-pin with --unfreeze, or unpin, to change it`,
    );
    this.name = "KbBaseFrozenError";
  }
}

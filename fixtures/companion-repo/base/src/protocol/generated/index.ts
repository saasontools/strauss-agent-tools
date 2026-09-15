// GENERATED FILE — do not edit.
// generator: scripts/gen-protocol.mjs
// input: src/protocol/protocol.json
// input-sha256: c9ad41853696cb006b4052e7b07d5e05e6cd3eb5657384fb21582bd9f45e6404

export const PROTOCOL_VERSION = 1;

export type PingMessage = {
  at: string;
};

export type ChargeMessage = {
  orderId: string;
  amountMinor: number;
};

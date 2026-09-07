// GENERATED FILE — do not edit.
// generator: scripts/gen-protocol.mjs
// input: src/protocol/protocol.json
// input-sha256: ba9abcdd71667cfad595023c567e3165695a618ee4226f8a3e8c0badd01e584e

export const PROTOCOL_VERSION = 2;

export type PingMessage = {
  at: string;
};

export type ChargeMessage = {
  orderId: string;
  amountMinor: number;
  tenantId: string;
};

export type RefundMessage = {
  providerId: string;
  amountMinor: number;
};

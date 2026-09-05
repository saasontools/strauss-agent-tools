import assert from "node:assert/strict";
import test from "node:test";
import {
  PaymentClient,
  type ChargeRequest,
  type PaymentProvider,
} from "./pay.ts";

test("charges once when a line is edited mid-retry", async () => {
  const request: ChargeRequest = {
    orderId: "o-1",
    cartHash: "cart-a",
    amountMinor: 1000,
  };

  // The provider dedupes on the key, and the first attempt's charge is
  // committed even though its response is lost — so a rotated key is a
  // second charge, not a retry.
  const charges = new Map<string, number>();
  let failuresLeft = 1;
  const provider: PaymentProvider = {
    async submit(idempotencyKey, amountMinor) {
      if (!charges.has(idempotencyKey)) {
        charges.set(idempotencyKey, amountMinor);
      }
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        request.cartHash = "cart-b";
        throw new Error("transient: the charge landed, the response did not");
      }
      return `provider-${charges.size}`;
    },
  };

  await new PaymentClient(provider).charge(request);

  assert.equal(
    charges.size,
    1,
    "the provider must see one charge, not one per key",
  );
});

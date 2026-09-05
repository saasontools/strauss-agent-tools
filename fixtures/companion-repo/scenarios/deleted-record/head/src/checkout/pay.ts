export type ChargeRequest = {
  orderId: string;
  cartHash: string;
  amountMinor: number;
};

export type ChargeResult = {
  providerId: string;
  attempts: number;
  amountMinor: number;
};

export interface PaymentProvider {
  submit(idempotencyKey: string, amountMinor: number): Promise<string>;
}

/** Charges a cart, retrying transient provider failures. */
export class PaymentClient {
  private readonly provider: PaymentProvider;
  private readonly maxAttempts: number;

  constructor(provider: PaymentProvider, maxAttempts = 3) {
    this.provider = provider;
    this.maxAttempts = maxAttempts;
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const key = idempotencyKey(request);
      try {
        const providerId = await this.provider.submit(key, request.amountMinor);
        return {
          providerId,
          attempts: attempt,
          amountMinor: request.amountMinor,
        };
      } catch (error) {
        lastError = error;
        await sleep(backoffMs(attempt));
      }
    }
    throw lastError;
  }
}

function idempotencyKey(request: ChargeRequest): string {
  return `cart:${request.cartHash}`;
}

function backoffMs(attempt: number): number {
  return 100 * 2 ** (attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

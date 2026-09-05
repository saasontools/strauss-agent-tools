export type ChargeRequest = {
  orderId: string;
  tenantId: string;
  cartHash: string;
  amountMinor: number;
};

export type ChargeResult = { providerId: string; attempts: number };

export interface PaymentProvider {
  submit(idempotencyKey: string, amountMinor: number): Promise<string>;
}

/** Charges a cart, retrying transient provider failures per tenant. */
export class PaymentClient {
  private readonly provider: PaymentProvider;
  private readonly attemptsPerTenant: number;
  private readonly spent = new Map<string, number>();

  constructor(provider: PaymentProvider, attemptsPerTenant = 3) {
    this.provider = provider;
    this.attemptsPerTenant = attemptsPerTenant;
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const key = idempotencyKey(request);
    const budget =
      this.attemptsPerTenant - (this.spent.get(request.tenantId) ?? 0);
    let lastError: unknown;
    for (let attempt = 1; attempt <= budget; attempt += 1) {
      try {
        const providerId = await this.provider.submit(key, request.amountMinor);
        this.spent.delete(request.tenantId);
        return { providerId, attempts: attempt };
      } catch (error) {
        lastError = error;
        this.spent.set(request.tenantId, attempt);
        await sleep(backoffMs(attempt));
      }
    }
    throw lastError;
  }
}

function idempotencyKey(request: ChargeRequest): string {
  return `order:${request.orderId}`;
}

function backoffMs(attempt: number): number {
  return 100 * 2 ** (attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

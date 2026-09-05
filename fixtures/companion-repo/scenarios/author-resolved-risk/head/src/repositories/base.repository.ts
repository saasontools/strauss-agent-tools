export type RetryOptions = { attempts: number; baseDelayMs: number };

const TRANSIENT = new Set([
  "ProvisionedThroughputExceededException",
  "ThrottlingException",
]);

export abstract class BaseRepository {
  protected constructor(
    protected readonly retry: RetryOptions = { attempts: 5, baseDelayMs: 50 },
  ) {}

  protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retry.attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isTransient(error)) throw error;
        lastError = error;
        await sleep(this.retry.baseDelayMs * attempt);
      }
    }
    throw lastError;
  }
}

function isTransient(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    TRANSIENT.has(String((error as { name: unknown }).name))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

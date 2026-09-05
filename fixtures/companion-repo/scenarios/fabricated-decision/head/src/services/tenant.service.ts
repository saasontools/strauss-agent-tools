export type Tenant = { id: string; name: string };

export interface TenantRepository {
  batchGet(ids: string[]): Promise<Tenant[]>;
}

export type FindManyResult = { found: Tenant[]; missing: string[] };

const CHUNK_SIZE = 100;
const CACHE_TTL_MS = 60_000;

export class TenantService {
  private readonly cache = new Map<string, { at: number; tenant: Tenant }>();

  constructor(private readonly repository: TenantRepository) {}

  async findMany(ids: string[]): Promise<FindManyResult> {
    const now = Date.now();
    const found: Tenant[] = [];
    const cold: string[] = [];
    for (const id of ids) {
      const hit = this.cache.get(id);
      if (hit && now - hit.at < CACHE_TTL_MS) found.push(hit.tenant);
      else cold.push(id);
    }
    for (const chunk of chunkIds(cold, CHUNK_SIZE)) {
      for (const tenant of await this.repository.batchGet(chunk)) {
        this.cache.set(tenant.id, { at: now, tenant });
        found.push(tenant);
      }
    }
    const seen = new Set(found.map((tenant) => tenant.id));
    return { found, missing: ids.filter((id) => !seen.has(id)) };
  }
}

export function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

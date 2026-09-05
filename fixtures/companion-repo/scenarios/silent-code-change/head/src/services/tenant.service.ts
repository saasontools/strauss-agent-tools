export type Tenant = { id: string; name: string };

export interface TenantRepository {
  batchGet(ids: string[]): Promise<Tenant[]>;
}

export type FindManyResult = { found: Tenant[]; missing: string[] };

const CHUNK_SIZE = 100;

export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  async findMany(ids: string[]): Promise<FindManyResult> {
    const unique = [...new Set(ids)];
    const found: Tenant[] = [];
    for (const chunk of chunkIds(unique, CHUNK_SIZE)) {
      found.push(...(await this.repository.batchGet(chunk)));
    }
    const seen = new Set(found.map((tenant) => tenant.id));
    return { found, missing: unique.filter((id) => !seen.has(id)) };
  }
}

export function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

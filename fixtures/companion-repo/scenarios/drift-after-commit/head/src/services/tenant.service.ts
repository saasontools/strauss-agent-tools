import { chunkIds } from "./chunker.ts";

export type Tenant = { id: string; name: string };

export interface TenantRepository {
  batchGet(ids: string[]): Promise<Tenant[]>;
}

export type FindManyResult = { found: Tenant[]; missing: string[] };

const CHUNK_SIZE = 100;

export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  async findMany(ids: string[]): Promise<FindManyResult> {
    const chunks = chunkIds(ids, CHUNK_SIZE);
    const batches = await Promise.all(
      chunks.map((chunk) => this.repository.batchGet(chunk)),
    );
    const found = batches.flat();
    const seen = new Set(found.map((tenant) => tenant.id));
    return { found, missing: ids.filter((id) => !seen.has(id)) };
  }
}

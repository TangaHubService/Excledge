import { ObjectLiteral } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { parsePagination } from "../common/http";

export const masterService = {
  async list<T extends ObjectLiteral>(
    entity: new () => T,
    alias: string,
    searchableKeys: string[],
    query: Record<string, unknown>,
  ) {
    const { page, pageSize, skip } = parsePagination(query);
    const search = String(query.search ?? "").trim();
    const repo = AppDataSource.getRepository(entity);
    const qb = repo.createQueryBuilder(alias);
    if (search && searchableKeys.length) {
      searchableKeys.forEach((key, i) => {
        const clause = `${alias}.${key} ILIKE :q`;
        if (i === 0) qb.where(clause, { q: `%${search}%` });
        else qb.orWhere(clause, { q: `%${search}%` });
      });
    }
    const [data, total] = await qb.orderBy(`${alias}.createdAt`, "DESC").skip(skip).take(pageSize).getManyAndCount();
    return { data, page, pageSize, total };
  },

  async create<T extends ObjectLiteral>(entity: new () => T, input: Record<string, unknown>) {
    const repo = AppDataSource.getRepository(entity);
    const created = await repo.save(repo.create(input as unknown as T));
    return created;
  },
};

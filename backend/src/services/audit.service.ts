import { AppDataSource } from "../config/data-source";
import { AuditLog } from "../entities/AuditLog";

export const writeAudit = async (input: Partial<AuditLog>) => {
  const repo = AppDataSource.getRepository(AuditLog);
  await repo.save(repo.create(input));
};

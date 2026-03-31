import { AppDataSource } from "../config/data-source";
import { ReportQueryDto } from "../dto/reports.dto";

const paginate = (query: ReportQueryDto) => {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit ?? 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const whereDateAndBranch = (query: ReportQueryDto, dateColumn: string, branchColumn: string) => {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.startDate) {
    clauses.push(`${dateColumn} >= $${params.length + 1}`);
    params.push(query.startDate);
  }
  if (query.endDate) {
    clauses.push(`${dateColumn} <= $${params.length + 1}`);
    params.push(query.endDate);
  }
  if (query.branchId) {
    clauses.push(`${branchColumn} = $${params.length + 1}`);
    params.push(query.branchId);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
};

export const reportsService = {
  async salesTrend(query: ReportQueryDto) {
    const { page, limit, offset } = paginate(query);
    const granularity = query.groupBy === "weekly" ? "week" : "day";
    const { where, params } = whereDateAndBranch(query, "s.\"createdAt\"", "s.\"branchId\"");
    const base = `
      SELECT date_trunc('${granularity}', s."createdAt")::date AS period,
             SUM(s."totalAmount"::numeric) AS "totalSales",
             COUNT(*)::int AS "transactionCount"
      FROM sales s
      ${where}
      GROUP BY period
    `;
    const data = await AppDataSource.query(`${base} ORDER BY period DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const total = await AppDataSource.query(`SELECT COUNT(*)::int AS count FROM (${base}) x`, params);
    return { data, meta: { total: Number(total[0]?.count ?? 0), page, limit } };
  },

  async inventoryValue(query: ReportQueryDto) {
    const { page, limit, offset } = paginate(query);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.branchId) {
      clauses.push(`ib."branchId" = $${params.length + 1}`);
      params.push(query.branchId);
    }
    if (query.categoryId) {
      clauses.push(`p."categoryId" = $${params.length + 1}`);
      params.push(query.categoryId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const base = `
      SELECT p.name AS "productName",
             c.name AS category,
             ib.quantity::numeric AS quantity,
             COALESCE(pi."unitCost"::numeric, p."unitPrice"::numeric) AS "costPrice",
             (ib.quantity::numeric * COALESCE(pi."unitCost"::numeric, p."unitPrice"::numeric)) AS "totalValue"
      FROM inventory_balances ib
      JOIN products p ON p.id = ib."productId"
      LEFT JOIN categories c ON c.id = p."categoryId"
      LEFT JOIN LATERAL (
        SELECT "unitCost"
        FROM purchase_items x
        WHERE x."productId" = p.id
        ORDER BY x."createdAt" DESC
        LIMIT 1
      ) pi ON true
      ${where}
    `;
    const data = await AppDataSource.query(`${base} ORDER BY "totalValue" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const total = await AppDataSource.query(`SELECT COUNT(*)::int AS count FROM (${base}) x`, params);
    return { data, meta: { total: Number(total[0]?.count ?? 0), page, limit } };
  },

  async topProducts(query: ReportQueryDto) {
    const { page, limit, offset } = paginate(query);
    const { where, params } = whereDateAndBranch(query, 's."createdAt"', 's."branchId"');
    const categoryFilter =
      query.categoryId
        ? `${where ? " AND " : "WHERE "}p."categoryId" = $${params.length + 1}`
        : "";
    const allParams = query.categoryId ? [...params, query.categoryId] : params;
    const base = `
      SELECT p.name AS "productName",
             SUM(si.quantity::numeric) AS "quantitySold",
             SUM((si.quantity::numeric * si."unitPrice"::numeric)) AS "totalRevenue"
      FROM sale_items si
      JOIN sales s ON s.id = si."saleId"
      JOIN products p ON p.id = si."productId"
      ${where}
      ${categoryFilter}
      GROUP BY p.name
    `;
    const data = await AppDataSource.query(`${base} ORDER BY "quantitySold" DESC LIMIT $${allParams.length + 1} OFFSET $${allParams.length + 2}`, [...allParams, limit, offset]);
    const total = await AppDataSource.query(`SELECT COUNT(*)::int AS count FROM (${base}) x`, allParams);
    return { data, meta: { total: Number(total[0]?.count ?? 0), page, limit } };
  },

  async lowStock(query: ReportQueryDto) {
    const { page, limit, offset } = paginate(query);
    const clauses: string[] = [`ib.quantity::numeric < p."reorderLevel"::numeric`];
    const params: unknown[] = [];
    if (query.branchId) {
      clauses.push(`ib."branchId" = $${params.length + 1}`);
      params.push(query.branchId);
    }
    if (query.categoryId) {
      clauses.push(`p."categoryId" = $${params.length + 1}`);
      params.push(query.categoryId);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const base = `
      SELECT p.name AS "productName",
             ib.quantity::numeric AS "currentStock",
             p."reorderLevel"::numeric AS "minimumLevel",
             CASE
               WHEN ib.quantity::numeric <= (p."reorderLevel"::numeric / 2) THEN 'Critical'
               ELSE 'Low'
             END AS status
      FROM inventory_balances ib
      JOIN products p ON p.id = ib."productId"
      ${where}
    `;
    const data = await AppDataSource.query(`${base} ORDER BY "currentStock" ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const total = await AppDataSource.query(`SELECT COUNT(*)::int AS count FROM (${base}) x`, params);
    return { data, meta: { total: Number(total[0]?.count ?? 0), page, limit } };
  },

  async paymentMethods(query: ReportQueryDto) {
    const { page, limit, offset } = paginate(query);
    const { where, params } = whereDateAndBranch(query, 's."createdAt"', 's."branchId"');
    const base = `
      SELECT COALESCE(s."paymentMethod"::text, 'UNKNOWN') AS "paymentMethod",
             COUNT(*)::int AS "totalTransactions",
             SUM(s."totalAmount"::numeric) AS "totalAmount"
      FROM sales s
      ${where}
      GROUP BY COALESCE(s."paymentMethod"::text, 'UNKNOWN')
    `;
    const data = await AppDataSource.query(`${base} ORDER BY "totalAmount" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const total = await AppDataSource.query(`SELECT COUNT(*)::int AS count FROM (${base}) x`, params);
    return { data, meta: { total: Number(total[0]?.count ?? 0), page, limit } };
  },
};

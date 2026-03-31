import { AppDataSource } from "../config/data-source";
import { parsePagination, ApiError } from "../common/http";
import { PaymentMethod, Sale, SaleCertificationStatus } from "../entities/Sale";
import { SaleItem } from "../entities/SaleItem";
import { StockMovementType } from "../entities/StockMovement";
import { applyStockChange } from "./inventory.service";
import { writeAudit } from "./audit.service";
import { CreateSaleDto } from "../dto/sales.dto";
import { PaginationQueryDto } from "../dto/common.dto";

export const salesService = {
  async list(query: PaginationQueryDto) {
    const { page, pageSize, skip } = parsePagination(query);
    const repo = AppDataSource.getRepository(Sale);
    const qb = repo.createQueryBuilder("sale").leftJoinAndSelect("sale.items", "items");
    if (query.branchId) qb.andWhere("sale.branchId = :branchId", { branchId: query.branchId });
    if (query.cashierId) qb.andWhere("sale.cashierId = :cashierId", { cashierId: query.cashierId });
    if (query.paymentMethod) qb.andWhere("sale.paymentMethod = :paymentMethod", { paymentMethod: query.paymentMethod });
    if (query.fromDate) qb.andWhere("sale.createdAt >= :fromDate", { fromDate: query.fromDate });
    if (query.toDate) qb.andWhere("sale.createdAt <= :toDate", { toDate: query.toDate });
    if (query.search) {
      qb.andWhere("(sale.invoiceNo ILIKE :q OR sale.reference ILIKE :q)", { q: `%${String(query.search)}%` });
    }
    const [data, total] = await qb.orderBy("sale.createdAt", "DESC").skip(skip).take(pageSize).getManyAndCount();
    return { data, page, pageSize, total };
  },

  async create(input: CreateSaleDto, actorId?: string) {
    return AppDataSource.transaction(async (tx) => {
      const saleRepo = tx.getRepository(Sale);
      const itemRepo = tx.getRepository(SaleItem);
      const generatedInvoiceNo = input.invoiceNo?.trim() || `INV-${Date.now()}`;
      const sale = await saleRepo.save(
        saleRepo.create({
          branchId: input.branchId,
          customerId: input.customerId,
          invoiceNo: generatedInvoiceNo,
          invoiceNumber: generatedInvoiceNo,
          certificationStatus: SaleCertificationStatus.PENDING_CERTIFICATION,
          paymentMethod: input.paymentMethod as PaymentMethod,
          cashierId: input.cashierId || actorId,
          reference: input.reference,
          totalAmount: "0",
        }),
      );
      let total = 0;
      for (const line of input.items) {
        total += line.quantity * line.unitPrice;
        await itemRepo.save(itemRepo.create({ saleId: sale.id, productId: line.productId, quantity: String(line.quantity), unitPrice: String(line.unitPrice) }));
        await applyStockChange(
          {
            branchId: input.branchId,
            productId: line.productId,
            qtyDelta: -line.quantity,
            movementType: StockMovementType.SALE_OUT,
            referenceType: "Sale",
            referenceId: sale.id,
          },
          tx,
        );
      }
      sale.totalAmount = total.toFixed(2);
      await saleRepo.save(sale);
      await writeAudit({ action: "CREATE_SALE", entityType: "Sale", entityId: sale.id, actorId });
      return sale;
    });
  },

  async cancel(id: string, actorId?: string) {
    const repo = AppDataSource.getRepository(Sale);
    const sale = await repo.findOne({ where: { id } });
    if (!sale) throw new ApiError("NOT_FOUND", 404, "Sale not found");
    sale.certificationStatus = SaleCertificationStatus.CANCELLED;
    await repo.save(sale);
    await writeAudit({ action: "CANCEL_SALE", entityType: "Sale", entityId: sale.id, actorId });
    return sale;
  },
};

import { Column, Entity, Index } from "typeorm";
import { TimestampedEntity } from "./base";

export enum StockMovementType {
  PURCHASE_IN = "PURCHASE_IN",
  SALE_OUT = "SALE_OUT",
  ADJUSTMENT = "ADJUSTMENT",
}

@Entity("stock_movements")
@Index(["branchId", "productId", "createdAt"])
export class StockMovement extends TimestampedEntity {
  @Column()
  branchId!: string;

  @Column()
  productId!: string;

  @Column({ type: "enum", enum: StockMovementType })
  type!: StockMovementType;

  @Column("decimal", { precision: 18, scale: 3 })
  quantityDelta!: string;

  @Column()
  referenceType!: string;

  @Column()
  referenceId!: string;

  @Column({ nullable: true })
  reason?: string;
}

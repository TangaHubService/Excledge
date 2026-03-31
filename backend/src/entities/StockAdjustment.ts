import { Column, Entity } from "typeorm";
import { TimestampedEntity } from "./base";

@Entity("stock_adjustments")
export class StockAdjustment extends TimestampedEntity {
  @Column()
  branchId!: string;

  @Column()
  productId!: string;

  @Column("decimal", { precision: 18, scale: 3 })
  quantityDelta!: string;

  @Column()
  reason!: string;

  @Column({ nullable: true })
  performedBy?: string;
}

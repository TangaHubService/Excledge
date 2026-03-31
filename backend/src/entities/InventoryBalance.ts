import { Column, Entity, Index } from "typeorm";
import { TimestampedEntity } from "./base";

@Entity("inventory_balances")
@Index(["branchId", "productId"], { unique: true })
export class InventoryBalance extends TimestampedEntity {
  @Column()
  branchId!: string;

  @Column()
  productId!: string;

  @Column("decimal", { precision: 18, scale: 3, default: 0 })
  quantity!: string;
}

import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { TimestampedEntity } from "./base";
import { Purchase } from "./Purchase";
import { Product } from "./Product";

@Entity("purchase_items")
export class PurchaseItem extends TimestampedEntity {
  @Column()
  purchaseId!: string;

  @ManyToOne(() => Purchase, (purchase) => purchase.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "purchaseId" })
  purchase!: Purchase;

  @Column()
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: "productId" })
  product!: Product;

  @Column("decimal", { precision: 18, scale: 3 })
  quantity!: string;

  @Column("decimal", { precision: 18, scale: 2 })
  unitCost!: string;
}

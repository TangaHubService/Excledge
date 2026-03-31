import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { TimestampedEntity } from "./base";
import { Sale } from "./Sale";
import { Product } from "./Product";

@Entity("sale_items")
export class SaleItem extends TimestampedEntity {
  @Column()
  saleId!: string;

  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "saleId" })
  sale!: Sale;

  @Column()
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: "productId" })
  product!: Product;

  @Column("decimal", { precision: 18, scale: 3 })
  quantity!: string;

  @Column("decimal", { precision: 18, scale: 2 })
  unitPrice!: string;
}

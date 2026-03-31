import { Column, DeleteDateColumn, Entity, Index, ManyToOne, JoinColumn } from "typeorm";
import { TimestampedEntity } from "./base";
import { Category } from "./Category";

@Entity("products")
@Index(["sku"], { unique: true })
export class Product extends TimestampedEntity {
  @Column()
  name!: string;

  @Column()
  sku!: string;

  @Column()
  categoryId!: string;

  @ManyToOne(() => Category)
  @JoinColumn({ name: "categoryId" })
  category!: Category;

  @Column({ default: "VAT_18" })
  taxCategory!: string;

  @Column("decimal", { precision: 18, scale: 2, default: 0 })
  unitPrice!: string;

  @Column("decimal", { precision: 18, scale: 3, default: 0 })
  reorderLevel!: string;

  @Column({ default: true })
  isActive!: boolean;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}

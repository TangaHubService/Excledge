import { Column, Entity, Index, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { TimestampedEntity } from "./base";
import { Branch } from "./Branch";
import { Supplier } from "./Supplier";
import { PurchaseItem } from "./PurchaseItem";

@Entity("purchases")
@Index(["branchId", "createdAt"])
export class Purchase extends TimestampedEntity {
  @Column()
  branchId!: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: "branchId" })
  branch!: Branch;

  @Column()
  supplierId!: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: "supplierId" })
  supplier!: Supplier;

  @Column()
  referenceNo!: string;

  @Column("decimal", { precision: 18, scale: 2, default: 0 })
  totalAmount!: string;

  @OneToMany(() => PurchaseItem, (item) => item.purchase, { cascade: true })
  items!: PurchaseItem[];
}

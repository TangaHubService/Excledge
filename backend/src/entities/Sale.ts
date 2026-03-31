import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { TimestampedEntity } from "./base";
import { Branch } from "./Branch";
import { Customer } from "./Customer";
import { SaleItem } from "./SaleItem";

export enum SaleCertificationStatus {
  PENDING_CERTIFICATION = "PENDING_CERTIFICATION",
  CERTIFIED = "CERTIFIED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum PosSaleStatus {
  COMPLETED = "COMPLETED",
  HELD = "HELD",
}

export enum PaymentMethod {
  CASH = "CASH",
  MOBILE_MONEY = "MOBILE_MONEY",
}

@Entity("sales")
@Index(["branchId", "createdAt"])
export class Sale extends TimestampedEntity {
  @Column()
  branchId!: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: "branchId" })
  branch!: Branch;

  @Column({ nullable: true })
  customerId?: string;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: "customerId" })
  customer?: Customer;

  @Column()
  invoiceNo!: string;

  @Column({ nullable: true })
  invoiceNumber?: string;

  @Column({ type: "enum", enum: SaleCertificationStatus, default: SaleCertificationStatus.PENDING_CERTIFICATION })
  certificationStatus!: SaleCertificationStatus;

  @Column({ type: "enum", enum: PosSaleStatus, default: PosSaleStatus.COMPLETED })
  posStatus!: PosSaleStatus;

  @Column({ type: "enum", enum: PaymentMethod, nullable: true })
  paymentMethod?: PaymentMethod;

  @Column({ nullable: true })
  cashierId?: string;

  @Column({ nullable: true })
  reference?: string;

  @Column({ nullable: true })
  complianceReference?: string;

  @Column({ nullable: true })
  externalReceiptId?: string;

  @Column({ nullable: true })
  cancelledSaleId?: string;

  @Column("decimal", { precision: 18, scale: 2, default: 0 })
  totalAmount!: string;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
  items!: SaleItem[];
}

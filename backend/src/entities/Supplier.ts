import { Column, DeleteDateColumn, Entity } from "typeorm";
import { TimestampedEntity } from "./base";

@Entity("suppliers")
export class Supplier extends TimestampedEntity {
  @Column()
  name!: string;

  @Column({ nullable: true })
  tin?: string;

  @Column({ nullable: true })
  phone?: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}

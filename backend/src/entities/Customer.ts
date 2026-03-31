import { Column, DeleteDateColumn, Entity } from "typeorm";
import { TimestampedEntity } from "./base";

@Entity("customers")
export class Customer extends TimestampedEntity {
  @Column()
  name!: string;

  @Column({ nullable: true })
  tin?: string;

  @Column({ nullable: true })
  phone?: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}

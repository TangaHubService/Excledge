import { Column, DeleteDateColumn, Entity } from "typeorm";
import { TimestampedEntity } from "./base";

@Entity("categories")
export class Category extends TimestampedEntity {
  @Column({ unique: true })
  name!: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}

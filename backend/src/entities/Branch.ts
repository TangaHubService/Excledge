import { Column, Entity, OneToMany } from "typeorm";
import { TimestampedEntity } from "./base";
import { User } from "./User";

@Entity("branches")
export class Branch extends TimestampedEntity {
  @Column()
  name!: string;

  @Column({ nullable: true })
  code?: string;

  @Column({ default: "RWF" })
  currency!: string;

  @OneToMany(() => User, (user) => user.branch)
  users!: User[];
}

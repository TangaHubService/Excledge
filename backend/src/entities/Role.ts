import { Column, Entity, OneToMany } from "typeorm";
import { TimestampedEntity } from "./base";
import { User } from "./User";

@Entity("roles")
export class Role extends TimestampedEntity {
  @Column({ unique: true })
  name!: string;

  @Column("simple-array", { default: "" })
  permissions!: string[];

  @OneToMany(() => User, (user) => user.role)
  users!: User[];
}

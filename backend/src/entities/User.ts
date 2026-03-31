import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { TimestampedEntity } from "./base";
import { Role } from "./Role";
import { Branch } from "./Branch";

@Entity("users")
export class User extends TimestampedEntity {
  @Column({ unique: true })
  email!: string;

  @Column()
  fullName!: string;

  @Column()
  passwordHash!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column()
  roleId!: string;

  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({ name: "roleId" })
  role!: Role;

  @Column({ nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, (branch) => branch.users, { nullable: true })
  @JoinColumn({ name: "branchId" })
  branch?: Branch;

  @Column({ nullable: true })
  resetPasswordToken?: string;

  @Column({ type: "timestamp", nullable: true })
  resetPasswordExpiresAt?: Date;
}

import { Column, Entity, Index } from "typeorm";
import { TimestampedEntity } from "./base";

@Entity("audit_logs")
@Index(["entityType", "entityId"])
export class AuditLog extends TimestampedEntity {
  @Column()
  action!: string;

  @Column()
  entityType!: string;

  @Column()
  entityId!: string;

  @Column({ nullable: true })
  actorId?: string;

  @Column({ type: "jsonb", nullable: true })
  before?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  after?: Record<string, unknown>;
}

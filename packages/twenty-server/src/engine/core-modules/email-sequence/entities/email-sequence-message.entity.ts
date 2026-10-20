import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';

import { type EmailSequenceStepKey } from 'twenty-shared/types';

import { EmailSequenceEnrollmentEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-enrollment.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity.type';

@Entity({ name: 'emailSequenceMessage', schema: 'core' })
@Index('IDX_EMAIL_SEQUENCE_MESSAGE_ENROLLMENT_ID', ['enrollmentId'])
export class EmailSequenceMessageEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: false })
  enrollmentId: string;

  @ManyToOne(
    () => EmailSequenceEnrollmentEntity,
    (enrollment) => enrollment.messages,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'enrollmentId' })
  enrollment: Relation<EmailSequenceEnrollmentEntity>;

  @Column({ type: 'varchar', nullable: false })
  stepKey: EmailSequenceStepKey;

  @Column({ type: 'varchar', nullable: false })
  subject: string;

  @Column({ type: 'timestamptz', nullable: false })
  sentAt: Date;

  @Column({ type: 'varchar', nullable: true })
  headerMessageId: string | null;

  @Column({ type: 'uuid', nullable: true })
  messageThreadId: string | null;

  @Column({ type: 'int', nullable: false, default: 0 })
  openCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  firstOpenedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastOpenedAt: Date | null;
}

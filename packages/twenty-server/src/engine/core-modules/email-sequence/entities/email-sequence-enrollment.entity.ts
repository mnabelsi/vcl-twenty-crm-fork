import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';

import {
  type EmailSequenceEnrollmentStatus,
  type EmailSequenceIndustry,
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';

import { EmailSequenceMessageEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-message.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity.type';

@Entity({ name: 'emailSequenceEnrollment', schema: 'core' })
@Index('IDX_EMAIL_SEQUENCE_ENROLLMENT_STATUS_NEXT_SEND_AT', [
  'status',
  'nextSendAt',
])
@Index('IDX_EMAIL_SEQUENCE_ENROLLMENT_WORKSPACE_PERSON', [
  'workspaceId',
  'personId',
])
@Index(
  'IDX_EMAIL_SEQUENCE_ENROLLMENT_ACTIVE_PERSON_UNIQUE',
  ['workspaceId', 'personId'],
  { unique: true, where: `"status" = 'ACTIVE'` },
)
export class EmailSequenceEnrollmentEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: false })
  personId: string;

  @Column({ type: 'varchar', nullable: false })
  personName: string;

  @Column({ type: 'varchar', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', nullable: false })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  companyName: string | null;

  @Column({ type: 'varchar', nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', nullable: false })
  track: EmailSequenceTrack;

  @Column({ type: 'varchar', nullable: false })
  industry: EmailSequenceIndustry;

  @Column({ type: 'varchar', nullable: false })
  status: EmailSequenceEnrollmentStatus;

  // 1 to 4; null once the sequence has ended
  @Column({ type: 'int', nullable: true })
  nextStage: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextSendAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastStepKey: EmailSequenceStepKey | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSentAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastHeaderMessageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  threadSubject: string | null;

  @Column({ type: 'uuid', nullable: false })
  connectedAccountId: string;

  @Column({ type: 'uuid', nullable: true })
  enrolledByUserWorkspaceId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'int', nullable: false, default: 0 })
  failedAttemptCount: number;

  @OneToMany(
    () => EmailSequenceMessageEntity,
    (emailSequenceMessage) => emailSequenceMessage.enrollment,
  )
  messages: Relation<EmailSequenceMessageEntity[]>;
}

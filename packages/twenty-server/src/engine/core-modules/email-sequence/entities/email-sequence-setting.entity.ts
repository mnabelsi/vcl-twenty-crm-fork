import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { type EmailSequenceIndustry } from 'twenty-shared/types';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity.type';

@Entity({ name: 'emailSequenceSetting', schema: 'core' })
@Unique('IDX_EMAIL_SEQUENCE_SETTING_WORKSPACE_ID_UNIQUE', ['workspaceId'])
export class EmailSequenceSettingEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'text', nullable: false })
  signature: string;

  @Column({ type: 'jsonb', nullable: false })
  industryLines: Record<EmailSequenceIndustry, string>;

  @Column({ type: 'varchar', nullable: false })
  timeZone: string;

  @Column({ type: 'jsonb', nullable: false })
  sendDays: number[];

  @Column({ type: 'int', nullable: false })
  sendWindowStartHour: number;

  @Column({ type: 'int', nullable: false })
  sendWindowEndHour: number;

  @Column({ type: 'int', nullable: false })
  dailySendLimit: number;

  @Column({ type: 'jsonb', nullable: false })
  stepDelaysInDays: number[];

  @Column({ type: 'boolean', nullable: false, default: true })
  isOpenTrackingEnabled: boolean;
}

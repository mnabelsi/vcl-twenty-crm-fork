import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import {
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity.type';

@Entity({ name: 'emailSequenceTemplate', schema: 'core' })
@Unique('IDX_EMAIL_SEQUENCE_TEMPLATE_WORKSPACE_TRACK_STEP_UNIQUE', [
  'workspaceId',
  'track',
  'stepKey',
])
export class EmailSequenceTemplateEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: false })
  track: EmailSequenceTrack;

  @Column({ type: 'varchar', nullable: false })
  stepKey: EmailSequenceStepKey;

  @Column({ type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'text', nullable: false })
  body: string;
}

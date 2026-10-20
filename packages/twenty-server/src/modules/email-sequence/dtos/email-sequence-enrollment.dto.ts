import { Field, Int, ObjectType } from '@nestjs/graphql';

import {
  type EmailSequenceEnrollmentStatus,
  type EmailSequenceIndustry,
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { EmailSequenceMessageDTO } from 'src/modules/email-sequence/dtos/email-sequence-message.dto';

@ObjectType('EmailSequenceEnrollment')
export class EmailSequenceEnrollmentDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => UUIDScalarType)
  personId: string;

  @Field(() => String)
  personName: string;

  @Field(() => String)
  email: string;

  @Field(() => String, { nullable: true })
  companyName: string | null;

  @Field(() => String, { nullable: true })
  jobTitle: string | null;

  @Field(() => String)
  track: EmailSequenceTrack;

  @Field(() => String)
  industry: EmailSequenceIndustry;

  @Field(() => String)
  status: EmailSequenceEnrollmentStatus;

  @Field(() => Int, { nullable: true })
  nextStage: number | null;

  @Field(() => Date, { nullable: true })
  nextSendAt: Date | null;

  @Field(() => String, { nullable: true })
  lastStepKey: EmailSequenceStepKey | null;

  @Field(() => Date, { nullable: true })
  lastSentAt: Date | null;

  @Field(() => Date, { nullable: true })
  endedAt: Date | null;

  @Field(() => String, { nullable: true })
  lastError: string | null;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => [EmailSequenceMessageDTO])
  messages: EmailSequenceMessageDTO[];
}

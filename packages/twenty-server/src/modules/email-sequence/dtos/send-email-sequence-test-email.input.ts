import { Field, InputType } from '@nestjs/graphql';

import { IsIn } from 'class-validator';
import {
  EMAIL_SEQUENCE_INDUSTRIES,
  EMAIL_SEQUENCE_STEP_KEYS,
  EMAIL_SEQUENCE_TRACKS,
  type EmailSequenceIndustry,
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';

@InputType('SendEmailSequenceTestEmailInput')
export class SendEmailSequenceTestEmailInput {
  @Field(() => String)
  @IsIn(EMAIL_SEQUENCE_TRACKS)
  track: EmailSequenceTrack;

  @Field(() => String)
  @IsIn(EMAIL_SEQUENCE_STEP_KEYS)
  stepKey: EmailSequenceStepKey;

  @Field(() => String)
  @IsIn(EMAIL_SEQUENCE_INDUSTRIES)
  industry: EmailSequenceIndustry;
}

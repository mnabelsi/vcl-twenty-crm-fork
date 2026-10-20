import { Field, InputType } from '@nestjs/graphql';

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EMAIL_SEQUENCE_STEP_KEYS,
  EMAIL_SEQUENCE_TRACKS,
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';

@InputType('UpdateEmailSequenceTemplateInput')
export class UpdateEmailSequenceTemplateInput {
  @Field(() => String)
  @IsIn(EMAIL_SEQUENCE_TRACKS)
  track: EmailSequenceTrack;

  @Field(() => String)
  @IsIn(EMAIL_SEQUENCE_STEP_KEYS)
  stepKey: EmailSequenceStepKey;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @Field(() => String)
  @IsString()
  @MaxLength(10000)
  body: string;
}

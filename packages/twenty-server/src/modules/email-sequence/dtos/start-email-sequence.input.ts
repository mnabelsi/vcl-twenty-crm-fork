import { Field, InputType } from '@nestjs/graphql';

import { IsIn, IsUUID } from 'class-validator';
import {
  EMAIL_SEQUENCE_INDUSTRIES,
  EMAIL_SEQUENCE_TRACKS,
  type EmailSequenceIndustry,
  type EmailSequenceTrack,
} from 'twenty-shared/types';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType('StartEmailSequenceInput')
export class StartEmailSequenceInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  personId: string;

  @Field(() => String)
  @IsIn(EMAIL_SEQUENCE_TRACKS)
  track: EmailSequenceTrack;

  @Field(() => String)
  @IsIn(EMAIL_SEQUENCE_INDUSTRIES)
  industry: EmailSequenceIndustry;
}

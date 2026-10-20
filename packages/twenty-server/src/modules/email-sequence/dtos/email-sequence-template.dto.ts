import { Field, ObjectType } from '@nestjs/graphql';

import {
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('EmailSequenceTemplate')
export class EmailSequenceTemplateDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String)
  track: EmailSequenceTrack;

  @Field(() => String)
  stepKey: EmailSequenceStepKey;

  @Field(() => String, { nullable: true })
  subject: string | null;

  @Field(() => String)
  body: string;

  @Field(() => Date)
  updatedAt: Date;
}

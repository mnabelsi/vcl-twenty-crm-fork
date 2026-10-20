import { Field, Int, ObjectType } from '@nestjs/graphql';

import { type EmailSequenceStepKey } from 'twenty-shared/types';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('EmailSequenceMessage')
export class EmailSequenceMessageDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String)
  stepKey: EmailSequenceStepKey;

  @Field(() => String)
  subject: string;

  @Field(() => Date)
  sentAt: Date;

  @Field(() => Int)
  openCount: number;

  @Field(() => Date, { nullable: true })
  firstOpenedAt: Date | null;

  @Field(() => UUIDScalarType, { nullable: true })
  messageThreadId: string | null;
}

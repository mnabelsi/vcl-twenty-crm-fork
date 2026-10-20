import { Field, InputType } from '@nestjs/graphql';

import { IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType('StopEmailSequenceInput')
export class StopEmailSequenceInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  enrollmentId: string;
}

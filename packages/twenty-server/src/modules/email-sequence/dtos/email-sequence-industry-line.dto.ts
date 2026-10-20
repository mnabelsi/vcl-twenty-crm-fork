import { Field, ObjectType } from '@nestjs/graphql';

import { type EmailSequenceIndustry } from 'twenty-shared/types';

@ObjectType('EmailSequenceIndustryLine')
export class EmailSequenceIndustryLineDTO {
  @Field(() => String)
  industry: EmailSequenceIndustry;

  @Field(() => String)
  line: string;
}

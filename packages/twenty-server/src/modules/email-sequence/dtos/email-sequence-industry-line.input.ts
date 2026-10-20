import { Field, InputType } from '@nestjs/graphql';

import { IsIn, IsString, MaxLength } from 'class-validator';
import {
  EMAIL_SEQUENCE_INDUSTRIES,
  type EmailSequenceIndustry,
} from 'twenty-shared/types';

@InputType('EmailSequenceIndustryLineInput')
export class EmailSequenceIndustryLineInput {
  @Field(() => String)
  @IsIn(EMAIL_SEQUENCE_INDUSTRIES)
  industry: EmailSequenceIndustry;

  @Field(() => String)
  @IsString()
  @MaxLength(1000)
  line: string;
}

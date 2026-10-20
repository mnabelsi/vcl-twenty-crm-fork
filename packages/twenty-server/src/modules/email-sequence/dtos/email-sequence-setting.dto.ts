import { Field, Int, ObjectType } from '@nestjs/graphql';

import { EmailSequenceIndustryLineDTO } from 'src/modules/email-sequence/dtos/email-sequence-industry-line.dto';

@ObjectType('EmailSequenceSetting')
export class EmailSequenceSettingDTO {
  @Field(() => String)
  signature: string;

  @Field(() => String)
  timeZone: string;

  @Field(() => [Int])
  sendDays: number[];

  @Field(() => Int)
  sendWindowStartHour: number;

  @Field(() => Int)
  sendWindowEndHour: number;

  @Field(() => Int)
  dailySendLimit: number;

  @Field(() => [Int])
  stepDelaysInDays: number[];

  @Field(() => Boolean)
  isOpenTrackingEnabled: boolean;

  @Field(() => [EmailSequenceIndustryLineDTO])
  industryLines: EmailSequenceIndustryLineDTO[];

  @Field(() => String, { nullable: true })
  sendingMailbox: string | null;
}

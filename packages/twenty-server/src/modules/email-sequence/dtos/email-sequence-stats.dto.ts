import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('EmailSequenceStats')
export class EmailSequenceStatsDTO {
  @Field(() => Int)
  active: number;

  @Field(() => Int)
  completed: number;

  @Field(() => Int)
  replied: number;

  @Field(() => Int)
  bounced: number;

  @Field(() => Int)
  stopped: number;

  @Field(() => Int)
  failed: number;

  @Field(() => Int)
  emailsSent: number;

  @Field(() => Int)
  emailsOpened: number;

  @Field(() => Int)
  emailsSentToday: number;
}

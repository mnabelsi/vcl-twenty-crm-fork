import { Field, InputType, Int } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { EmailSequenceIndustryLineInput } from 'src/modules/email-sequence/dtos/email-sequence-industry-line.input';

@InputType('UpdateEmailSequenceSettingInput')
export class UpdateEmailSequenceSettingInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signature?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsTimeZone()
  timeZone?: string;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  sendDays?: number[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  sendWindowStartHour?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  sendWindowEndHour?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  dailySendLimit?: number;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  stepDelaysInDays?: number[];

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isOpenTrackingEnabled?: boolean;

  @Field(() => [EmailSequenceIndustryLineInput], { nullable: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EmailSequenceIndustryLineInput)
  industryLines?: EmailSequenceIndustryLineInput[];
}

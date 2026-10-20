import { Field, ObjectType } from '@nestjs/graphql';

import { EmailSequenceEnrollmentDTO } from 'src/modules/email-sequence/dtos/email-sequence-enrollment.dto';
import { EmailSequenceStatsDTO } from 'src/modules/email-sequence/dtos/email-sequence-stats.dto';

@ObjectType('EmailSequenceDashboard')
export class EmailSequenceDashboardDTO {
  @Field(() => EmailSequenceStatsDTO)
  stats: EmailSequenceStatsDTO;

  @Field(() => [EmailSequenceEnrollmentDTO])
  enrollments: EmailSequenceEnrollmentDTO[];
}

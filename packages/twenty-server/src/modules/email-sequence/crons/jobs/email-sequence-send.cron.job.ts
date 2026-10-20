import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { EmailSequenceEnrollmentEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-enrollment.entity';
import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { EMAIL_SEQUENCE_SEND_CRON_PATTERN } from 'src/modules/email-sequence/constants/email-sequence-send-cron-pattern.constant';
import { EmailSequenceSenderService } from 'src/modules/email-sequence/services/email-sequence-sender.service';

@Processor(MessageQueue.cronQueue)
export class EmailSequenceSendCronJob {
  private readonly logger = new Logger(EmailSequenceSendCronJob.name);

  constructor(
    // Instance-wide sweep over every workspace with an active sequence.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(EmailSequenceEnrollmentEntity)
    private readonly enrollmentRepository: Repository<EmailSequenceEnrollmentEntity>,
    private readonly emailSequenceSenderService: EmailSequenceSenderService,
  ) {}

  @Process(EmailSequenceSendCronJob.name)
  @SentryCronMonitor(
    EmailSequenceSendCronJob.name,
    EMAIL_SEQUENCE_SEND_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const workspaceRows = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .select('DISTINCT enrollment.workspaceId', 'workspaceId')
      .where('enrollment.status = :status', { status: 'ACTIVE' })
      .getRawMany<{ workspaceId: string }>();

    for (const { workspaceId } of workspaceRows) {
      await this.emailSequenceSenderService
        .processWorkspace(workspaceId)
        .catch((error) => {
          this.logger.error(
            `Cannot process email sequences of workspace ${workspaceId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }
  }
}

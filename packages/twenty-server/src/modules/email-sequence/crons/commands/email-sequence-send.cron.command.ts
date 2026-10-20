import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { EMAIL_SEQUENCE_SEND_CRON_PATTERN } from 'src/modules/email-sequence/constants/email-sequence-send-cron-pattern.constant';
import { EmailSequenceSendCronJob } from 'src/modules/email-sequence/crons/jobs/email-sequence-send.cron.job';

@Command({
  name: 'cron:email-sequence:send',
  description: 'Starts a cron job that sends due email sequence steps',
})
export class EmailSequenceSendCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: EmailSequenceSendCronJob.name,
      data: undefined,
      options: {
        repeat: { pattern: EMAIL_SEQUENCE_SEND_CRON_PATTERN },
      },
    });
  }
}

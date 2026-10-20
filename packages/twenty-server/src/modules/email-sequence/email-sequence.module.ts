import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailSequenceEnrollmentEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-enrollment.entity';
import { EmailSequenceMessageEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-message.entity';
import { EmailSequenceSettingEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-setting.entity';
import { EmailSequenceTemplateEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-template.entity';
import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { EmailSequenceTrackingController } from 'src/modules/email-sequence/controllers/email-sequence-tracking.controller';
import { EmailSequenceSendCronCommand } from 'src/modules/email-sequence/crons/commands/email-sequence-send.cron.command';
import { EmailSequenceSendCronJob } from 'src/modules/email-sequence/crons/jobs/email-sequence-send.cron.job';
import { EmailSequenceResolver } from 'src/modules/email-sequence/resolvers/email-sequence.resolver';
import { EmailSequenceEnrollmentService } from 'src/modules/email-sequence/services/email-sequence-enrollment.service';
import { EmailSequenceOpenTrackingService } from 'src/modules/email-sequence/services/email-sequence-open-tracking.service';
import { EmailSequenceReplyDetectionService } from 'src/modules/email-sequence/services/email-sequence-reply-detection.service';
import { EmailSequenceSenderService } from 'src/modules/email-sequence/services/email-sequence-sender.service';
import { EmailSequenceSettingService } from 'src/modules/email-sequence/services/email-sequence-setting.service';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';

@Module({
  imports: [
    ToolModule,
    MessagingSendManagerModule,
    PermissionsModule,
    TypeOrmModule.forFeature([
      EmailSequenceSettingEntity,
      EmailSequenceTemplateEntity,
      EmailSequenceEnrollmentEntity,
      EmailSequenceMessageEntity,
      ConnectedAccountEntity,
    ]),
  ],
  controllers: [EmailSequenceTrackingController],
  providers: [
    provideWorkspaceScopedRepository(EmailSequenceSettingEntity),
    provideWorkspaceScopedRepository(EmailSequenceTemplateEntity),
    provideWorkspaceScopedRepository(EmailSequenceEnrollmentEntity),
    provideWorkspaceScopedRepository(EmailSequenceMessageEntity),
    EmailSequenceSettingService,
    EmailSequenceEnrollmentService,
    EmailSequenceReplyDetectionService,
    EmailSequenceSenderService,
    EmailSequenceOpenTrackingService,
    EmailSequenceResolver,
    EmailSequenceSendCronJob,
    EmailSequenceSendCronCommand,
  ],
  exports: [EmailSequenceSendCronCommand],
})
export class EmailSequenceModule {}

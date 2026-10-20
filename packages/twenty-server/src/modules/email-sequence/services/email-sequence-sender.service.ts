import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import {
  EmailOperation,
  type EmailSequenceIndustry,
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { LessThanOrEqual } from 'typeorm';
import { v4 } from 'uuid';

import { EmailSequenceEnrollmentEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-enrollment.entity';
import { type EmailSequenceSettingEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-setting.entity';
import { EmailSequenceMessageEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-message.entity';
import { I18nService } from 'src/engine/core-modules/i18n/i18n.service';
import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { EMAIL_SEQUENCE_BATCH_SIZE } from 'src/modules/email-sequence/constants/email-sequence-batch-size.constant';
import { EMAIL_SEQUENCE_CLAIM_LEASE_MS } from 'src/modules/email-sequence/constants/email-sequence-claim-lease-ms.constant';
import { EMAIL_SEQUENCE_OPEN_TRACKING_PATH } from 'src/modules/email-sequence/constants/email-sequence-open-tracking-path.constant';
import {
  EmailSequenceException,
  EmailSequenceExceptionCode,
} from 'src/modules/email-sequence/email-sequence.exception';
import { EmailSequenceEnrollmentService } from 'src/modules/email-sequence/services/email-sequence-enrollment.service';
import { EmailSequenceReplyDetectionService } from 'src/modules/email-sequence/services/email-sequence-reply-detection.service';
import { EmailSequenceSettingService } from 'src/modules/email-sequence/services/email-sequence-setting.service';
import { type EmailSequenceTemplateVariables } from 'src/modules/email-sequence/types/email-sequence-template-variables.type';
import { fillEmailSequenceTemplateVariables } from 'src/modules/email-sequence/utils/fill-email-sequence-template-variables.util';
import {
  EMAIL_SEQUENCE_LAST_STAGE,
  getEmailSequenceStepKey,
} from 'src/modules/email-sequence/utils/get-email-sequence-step-key.util';
import {
  getNextSendWindowStart,
  isWithinSendWindow,
} from 'src/modules/email-sequence/utils/get-next-send-window-start.util';
import { getZonedDateParts } from 'src/modules/email-sequence/utils/get-zoned-date-parts.util';
import { renderEmailSequenceEmail } from 'src/modules/email-sequence/utils/render-email-sequence-email.util';
import { zonedTimeToUtc } from 'src/modules/email-sequence/utils/zoned-time-to-utc.util';
import { SendEmailService } from 'src/modules/messaging/message-outbound-manager/services/send-email.service';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 3;
const REPLY_SUBJECT_PREFIX_PATTERN = /^(re|aw|sv|rv)\s*:/i;

type SentEmail = {
  subject: string;
  headerMessageId: string;
  messageThreadId: string | null;
};

@Injectable()
export class EmailSequenceSenderService {
  private readonly logger = new Logger(EmailSequenceSenderService.name);

  constructor(
    @InjectWorkspaceScopedRepository(EmailSequenceEnrollmentEntity)
    private readonly enrollmentRepository: WorkspaceScopedRepository<EmailSequenceEnrollmentEntity>,
    @InjectWorkspaceScopedRepository(EmailSequenceMessageEntity)
    private readonly messageRepository: WorkspaceScopedRepository<EmailSequenceMessageEntity>,
    private readonly emailSequenceSettingService: EmailSequenceSettingService,
    private readonly emailSequenceEnrollmentService: EmailSequenceEnrollmentService,
    private readonly emailSequenceReplyDetectionService: EmailSequenceReplyDetectionService,
    private readonly emailComposerService: EmailComposerService,
    private readonly sendEmailService: SendEmailService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly i18nService: I18nService,
  ) {}

  async processWorkspace(workspaceId: string): Promise<void> {
    await this.emailSequenceReplyDetectionService.detectRepliesAndBounces(
      workspaceId,
    );

    const now = new Date();

    const dueEnrollments = await this.enrollmentRepository.find(workspaceId, {
      where: { status: 'ACTIVE', nextSendAt: LessThanOrEqual(now) },
      order: { nextSendAt: 'ASC' },
      take: EMAIL_SEQUENCE_BATCH_SIZE,
    });

    if (dueEnrollments.length === 0) {
      return;
    }

    const setting =
      await this.emailSequenceSettingService.getOrCreateSetting(workspaceId);

    if (!isWithinSendWindow(now, setting)) {
      await this.rescheduleEnrollments(
        workspaceId,
        dueEnrollments,
        getNextSendWindowStart(now, setting),
      );

      return;
    }

    let remainingSendsToday =
      setting.dailySendLimit -
      (await this.emailSequenceEnrollmentService.countEmailsSentToday(
        workspaceId,
        setting.timeZone,
      ));

    for (const enrollment of dueEnrollments) {
      if (remainingSendsToday <= 0) {
        await this.rescheduleEnrollments(
          workspaceId,
          [enrollment],
          this.getNextDayWindowStart(now, setting),
        );

        continue;
      }

      const isClaimed = await this.claimEnrollment(workspaceId, enrollment);

      if (!isClaimed) {
        continue;
      }

      const isSent = await this.sendNextStage({
        workspaceId,
        enrollment,
        setting,
      });

      if (isSent) {
        remainingSendsToday--;
      }
    }
  }

  async sendTestEmail({
    workspaceId,
    userWorkspaceId,
    track,
    stepKey,
    industry,
  }: {
    workspaceId: string;
    userWorkspaceId?: string;
    track: EmailSequenceTrack;
    stepKey: EmailSequenceStepKey;
    industry: EmailSequenceIndustry;
  }): Promise<string> {
    const setting =
      await this.emailSequenceSettingService.getOrCreateSetting(workspaceId);
    const template = await this.emailSequenceSettingService.findTemplateOrThrow(
      { workspaceId, track, stepKey },
    );
    const connectedAccountId =
      await this.emailSequenceEnrollmentService.findSendingMailboxIdOrThrow({
        workspaceId,
        userWorkspaceId,
      });
    const mailboxHandle =
      await this.emailSequenceEnrollmentService.findSendingMailboxHandle({
        workspaceId,
        userWorkspaceId,
      });

    if (!isNonEmptyString(mailboxHandle)) {
      throw new EmailSequenceException(
        'Sending mailbox has no handle',
        EmailSequenceExceptionCode.NO_SENDING_MAILBOX,
      );
    }

    const variables: EmailSequenceTemplateVariables = {
      firstName: 'Sara',
      company: 'Example Company',
      industryLine: setting.industryLines[industry] ?? '',
    };

    const subject = isDefined(template.subject)
      ? fillEmailSequenceTemplateVariables(template.subject, variables)
      : `Re: ${stepKey} (sent as a reply in the same thread)`;

    await this.sendEmail({
      workspaceId,
      to: mailboxHandle,
      connectedAccountId,
      subject: `[Test] ${subject}`,
      html: renderEmailSequenceEmail({
        body: template.body,
        signature: setting.signature,
        variables,
      }).html,
    });

    return mailboxHandle;
  }

  private async sendNextStage({
    workspaceId,
    enrollment,
    setting,
  }: {
    workspaceId: string;
    enrollment: EmailSequenceEnrollmentEntity;
    setting: EmailSequenceSettingEntity;
  }): Promise<boolean> {
    const stage = enrollment.nextStage;

    if (!isDefined(stage)) {
      return false;
    }

    try {
      const sentMessages = await this.messageRepository.find(workspaceId, {
        where: { enrollmentId: enrollment.id },
      });

      const stepKey = getEmailSequenceStepKey({
        stage,
        hasOpenedFirstEmail: sentMessages.some(
          (message) => message.stepKey === 'STEP_1' && message.openCount > 0,
        ),
      });

      const template =
        await this.emailSequenceSettingService.findTemplateOrThrow({
          workspaceId,
          track: enrollment.track,
          stepKey,
        });

      const variables: EmailSequenceTemplateVariables = {
        firstName: enrollment.firstName ?? 'there',
        company: enrollment.companyName ?? 'your organisation',
        industryLine: setting.industryLines[enrollment.industry] ?? '',
      };

      const isThreadReply =
        !isDefined(template.subject) &&
        isNonEmptyString(enrollment.lastHeaderMessageId) &&
        isNonEmptyString(enrollment.threadSubject);

      const subject = isThreadReply
        ? this.toReplySubject(enrollment.threadSubject ?? '')
        : fillEmailSequenceTemplateVariables(
            template.subject ?? enrollment.threadSubject ?? '',
            variables,
          );

      const messageId = v4();

      const { html } = renderEmailSequenceEmail({
        body: template.body,
        signature: setting.signature,
        variables,
        openTrackingPixelUrl: setting.isOpenTrackingEnabled
          ? `${this.twentyConfigService.get('SERVER_URL')}/emailing/${EMAIL_SEQUENCE_OPEN_TRACKING_PATH}/${messageId}`
          : undefined,
      });

      const sentEmail = await this.sendEmail({
        workspaceId,
        to: enrollment.email,
        connectedAccountId: enrollment.connectedAccountId,
        subject,
        html,
        inReplyTo: isThreadReply
          ? (enrollment.lastHeaderMessageId ?? undefined)
          : undefined,
      });

      const sentAt = new Date();

      await this.messageRepository.insert(workspaceId, {
        id: messageId,
        enrollmentId: enrollment.id,
        stepKey,
        subject: sentEmail.subject,
        sentAt,
        headerMessageId: sentEmail.headerMessageId,
        messageThreadId: sentEmail.messageThreadId,
      });

      const isLastStage = stage >= EMAIL_SEQUENCE_LAST_STAGE;
      const delayInDays = setting.stepDelaysInDays[stage - 1] ?? 3;

      await this.enrollmentRepository.update(
        workspaceId,
        { id: enrollment.id },
        {
          lastStepKey: stepKey,
          lastSentAt: sentAt,
          lastHeaderMessageId: sentEmail.headerMessageId,
          threadSubject: isThreadReply
            ? enrollment.threadSubject
            : sentEmail.subject,
          failedAttemptCount: 0,
          lastError: null,
          ...(isLastStage
            ? {
                status: 'COMPLETED',
                nextStage: null,
                nextSendAt: null,
                endedAt: sentAt,
              }
            : {
                nextStage: stage + 1,
                nextSendAt: getNextSendWindowStart(
                  new Date(sentAt.getTime() + delayInDays * DAY_IN_MS),
                  setting,
                ),
              }),
        },
      );

      this.logger.log(
        `Email sequence ${enrollment.id} sent ${stepKey} in workspace ${workspaceId}`,
      );

      return true;
    } catch (error) {
      await this.handleSendFailure({ workspaceId, enrollment, error });

      return false;
    }
  }

  private async sendEmail({
    workspaceId,
    to,
    connectedAccountId,
    subject,
    html,
    inReplyTo,
  }: {
    workspaceId: string;
    to: string;
    connectedAccountId: string;
    subject: string;
    html: string;
    inReplyTo?: string;
  }): Promise<SentEmail> {
    const composeResult = await this.emailComposerService.composeEmail({
      parameters: {
        recipients: { to, cc: '', bcc: '' },
        subject,
        body: html,
        connectedAccountId,
        files: [],
        inReplyTo,
      },
      context: { workspaceId },
      operation: EmailOperation.SEND,
    });

    if (!composeResult.success) {
      throw new EmailSequenceException(
        this.i18nService.getI18nInstance(SOURCE_LOCALE)._(composeResult.error),
        EmailSequenceExceptionCode.SEND_FAILED,
      );
    }

    const { data } = composeResult;

    const sendResult = await this.sendEmailService.sendComposedEmail(data);

    const persistedMessage = data.shouldPersistMessage
      ? await this.sendEmailService.persistSentMessage(
          sendResult,
          data,
          workspaceId,
        )
      : undefined;

    return {
      subject: data.sanitizedSubject,
      headerMessageId: sendResult.headerMessageId,
      messageThreadId: persistedMessage?.messageThreadId ?? null,
    };
  }

  private async handleSendFailure({
    workspaceId,
    enrollment,
    error,
  }: {
    workspaceId: string;
    enrollment: EmailSequenceEnrollmentEntity;
    error: unknown;
  }): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedAttemptCount = enrollment.failedAttemptCount + 1;

    this.logger.warn(
      `Email sequence ${enrollment.id} failed to send (attempt ${failedAttemptCount}): ${errorMessage}`,
    );

    if (failedAttemptCount >= MAX_FAILED_ATTEMPTS) {
      await this.emailSequenceEnrollmentService.endEnrollment({
        workspaceId,
        enrollmentId: enrollment.id,
        status: 'FAILED',
        lastError: errorMessage,
      });

      return;
    }

    await this.enrollmentRepository.update(
      workspaceId,
      { id: enrollment.id },
      {
        failedAttemptCount,
        lastError: errorMessage,
        nextSendAt: new Date(Date.now() + RETRY_DELAY_MS),
      },
    );
  }

  private async claimEnrollment(
    workspaceId: string,
    enrollment: EmailSequenceEnrollmentEntity,
  ): Promise<boolean> {
    const result = await this.enrollmentRepository.update(
      workspaceId,
      {
        id: enrollment.id,
        status: 'ACTIVE',
        nextSendAt: LessThanOrEqual(new Date()),
      },
      { nextSendAt: new Date(Date.now() + EMAIL_SEQUENCE_CLAIM_LEASE_MS) },
    );

    return (result.affected ?? 0) === 1;
  }

  private async rescheduleEnrollments(
    workspaceId: string,
    enrollments: EmailSequenceEnrollmentEntity[],
    nextSendAt: Date,
  ): Promise<void> {
    for (const enrollment of enrollments) {
      await this.enrollmentRepository.update(
        workspaceId,
        { id: enrollment.id, status: 'ACTIVE' },
        { nextSendAt },
      );
    }
  }

  private getNextDayWindowStart(
    now: Date,
    setting: EmailSequenceSettingEntity,
  ): Date {
    const { year, month, day } = getZonedDateParts(now, setting.timeZone);

    const endOfTodayWindow = zonedTimeToUtc({
      year,
      month,
      day,
      hour: setting.sendWindowEndHour,
      timeZone: setting.timeZone,
    });

    return getNextSendWindowStart(endOfTodayWindow, setting);
  }

  private toReplySubject(threadSubject: string): string {
    return REPLY_SUBJECT_PREFIX_PATTERN.test(threadSubject)
      ? threadSubject
      : `Re: ${threadSubject}`;
  }
}

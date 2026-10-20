import { Injectable, Logger } from '@nestjs/common';

import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { ILike, In, MoreThan, Not, IsNull } from 'typeorm';

import { EmailSequenceEnrollmentEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-enrollment.entity';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { EmailSequenceEnrollmentService } from 'src/modules/email-sequence/services/email-sequence-enrollment.service';
import { isAutomaticReply } from 'src/modules/email-sequence/utils/is-automatic-reply.util';
import { isBounceNotification } from 'src/modules/email-sequence/utils/is-bounce-notification.util';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';

const BOUNCE_SENDER_HANDLE_FRAGMENTS = [
  'mailer-daemon',
  'postmaster',
  'microsoftexchange',
];

// Relies on Twenty's mailbox sync having imported the contact's reply into the workspace
@Injectable()
export class EmailSequenceReplyDetectionService {
  private readonly logger = new Logger(EmailSequenceReplyDetectionService.name);

  constructor(
    @InjectWorkspaceScopedRepository(EmailSequenceEnrollmentEntity)
    private readonly enrollmentRepository: WorkspaceScopedRepository<EmailSequenceEnrollmentEntity>,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly emailSequenceEnrollmentService: EmailSequenceEnrollmentService,
  ) {}

  async detectRepliesAndBounces(workspaceId: string): Promise<void> {
    const contactedEnrollments = await this.enrollmentRepository.find(
      workspaceId,
      { where: { status: 'ACTIVE', lastSentAt: Not(IsNull()) } },
    );

    if (contactedEnrollments.length === 0) {
      return;
    }

    const enrollmentsByEmail = new Map(
      contactedEnrollments.map((enrollment) => [
        enrollment.email.toLowerCase(),
        enrollment,
      ]),
    );

    const earliestEnrollmentDate = new Date(
      Math.min(
        ...contactedEnrollments.map((enrollment) =>
          enrollment.createdAt.getTime(),
        ),
      ),
    );

    const { replyParticipants, bounceParticipants } =
      await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
        const participantRepository =
          this.workspaceOrmManager.getRepository<MessageParticipantWorkspaceEntity>(
            'messageParticipant',
            { shouldBypassPermissionChecks: true },
          );

        const emailHandles = [
          ...new Set(
            contactedEnrollments.flatMap((enrollment) => [
              enrollment.email,
              enrollment.email.toLowerCase(),
            ]),
          ),
        ];

        const [replies, bounces] = await Promise.all([
          participantRepository.find({
            where: {
              role: MessageParticipantRole.FROM,
              handle: In(emailHandles),
              message: { receivedAt: MoreThan(earliestEnrollmentDate) },
            },
            relations: { message: true },
          }),
          participantRepository.find({
            where: BOUNCE_SENDER_HANDLE_FRAGMENTS.map((fragment) => ({
              role: MessageParticipantRole.FROM,
              handle: ILike(`%${fragment}%`),
              message: { receivedAt: MoreThan(earliestEnrollmentDate) },
            })),
            relations: { message: true },
          }),
        ]);

        return { replyParticipants: replies, bounceParticipants: bounces };
      }, buildSystemAuthContext(workspaceId));

    const endedEnrollmentIds = new Set<string>();

    for (const participant of replyParticipants) {
      const enrollment = enrollmentsByEmail.get(
        participant.handle?.toLowerCase() ?? '',
      );
      const receivedAt = participant.message?.receivedAt;

      if (
        !isDefined(enrollment) ||
        !isDefined(receivedAt) ||
        receivedAt <= enrollment.createdAt ||
        endedEnrollmentIds.has(enrollment.id) ||
        isAutomaticReply(participant.message?.subject ?? null)
      ) {
        continue;
      }

      endedEnrollmentIds.add(enrollment.id);

      await this.emailSequenceEnrollmentService.endEnrollment({
        workspaceId,
        enrollmentId: enrollment.id,
        status: 'REPLIED',
      });

      this.logger.log(
        `Email sequence ${enrollment.id} stopped: contact replied`,
      );
    }

    for (const participant of bounceParticipants) {
      const message = participant.message;

      if (
        !isDefined(message) ||
        !isBounceNotification({
          senderHandle: participant.handle,
          senderDisplayName: participant.displayName,
          subject: message.subject,
        })
      ) {
        continue;
      }

      const bounceText =
        `${message.subject ?? ''}\n${message.text ?? ''}`.toLowerCase();

      for (const [email, enrollment] of enrollmentsByEmail) {
        if (
          endedEnrollmentIds.has(enrollment.id) ||
          !bounceText.includes(email) ||
          !isDefined(message.receivedAt) ||
          message.receivedAt <= enrollment.createdAt
        ) {
          continue;
        }

        endedEnrollmentIds.add(enrollment.id);

        await this.emailSequenceEnrollmentService.endEnrollment({
          workspaceId,
          enrollmentId: enrollment.id,
          status: 'BOUNCED',
          lastError: message.subject ?? 'Delivery failed',
        });

        this.logger.log(`Email sequence ${enrollment.id} stopped: bounced`);
      }
    }
  }
}

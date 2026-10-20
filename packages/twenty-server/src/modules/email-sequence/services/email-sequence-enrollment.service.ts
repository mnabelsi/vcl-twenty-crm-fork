import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import {
  EmailOperation,
  type EmailSequenceEnrollmentStatus,
  type EmailSequenceIndustry,
  type EmailSequenceTrack,
} from 'twenty-shared/types';
import {
  canConnectedAccountPerformEmailOperation,
  getEmailProvidersForOperation,
  isDefined,
} from 'twenty-shared/utils';
import { In, IsNull, MoreThanOrEqual, Not, type Repository } from 'typeorm';

import { EmailSequenceEnrollmentEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-enrollment.entity';
import { EmailSequenceMessageEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-message.entity';
import { selectConnectedAccountIdForCaller } from 'src/engine/core-modules/tool/tools/email-tool/utils/select-connected-account-id-for-caller.util';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { type EmailSequenceStatsDTO } from 'src/modules/email-sequence/dtos/email-sequence-stats.dto';
import {
  EmailSequenceException,
  EmailSequenceExceptionCode,
} from 'src/modules/email-sequence/email-sequence.exception';
import { EmailSequenceSettingService } from 'src/modules/email-sequence/services/email-sequence-setting.service';
import { getNextSendWindowStart } from 'src/modules/email-sequence/utils/get-next-send-window-start.util';
import { getStartOfZonedDay } from 'src/modules/email-sequence/utils/get-start-of-zoned-day.util';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

const DASHBOARD_ENROLLMENT_LIMIT = 500;
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';

@Injectable()
export class EmailSequenceEnrollmentService {
  constructor(
    @InjectWorkspaceScopedRepository(EmailSequenceEnrollmentEntity)
    private readonly enrollmentRepository: WorkspaceScopedRepository<EmailSequenceEnrollmentEntity>,
    @InjectWorkspaceScopedRepository(EmailSequenceMessageEntity)
    private readonly messageRepository: WorkspaceScopedRepository<EmailSequenceMessageEntity>,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly emailSequenceSettingService: EmailSequenceSettingService,
  ) {}

  async startSequence({
    workspaceId,
    userWorkspaceId,
    personId,
    track,
    industry,
  }: {
    workspaceId: string;
    userWorkspaceId?: string;
    personId: string;
    track: EmailSequenceTrack;
    industry: EmailSequenceIndustry;
  }): Promise<EmailSequenceEnrollmentEntity> {
    const person = await this.findPersonOrThrow(workspaceId, personId);
    const email = person.emails?.primaryEmail?.trim();

    if (!isNonEmptyString(email)) {
      throw new EmailSequenceException(
        `Person ${personId} has no primary email`,
        EmailSequenceExceptionCode.PERSON_HAS_NO_EMAIL,
      );
    }

    const hasActiveEnrollment = await this.enrollmentRepository.existsBy(
      workspaceId,
      { personId, status: 'ACTIVE' },
    );

    if (hasActiveEnrollment) {
      throw new EmailSequenceException(
        `Person ${personId} is already in an active sequence`,
        EmailSequenceExceptionCode.ENROLLMENT_ALREADY_ACTIVE,
      );
    }

    const connectedAccountId = await this.findSendingMailboxIdOrThrow({
      workspaceId,
      userWorkspaceId,
    });

    const setting =
      await this.emailSequenceSettingService.getOrCreateSetting(workspaceId);

    const firstName = person.name?.firstName?.trim() ?? '';
    const lastName = person.name?.lastName?.trim() ?? '';

    try {
      return await this.enrollmentRepository.insertAndReturnOne(workspaceId, {
        personId,
        personName:
          [firstName, lastName].filter(isNonEmptyString).join(' ') || email,
        firstName: isNonEmptyString(firstName) ? firstName : null,
        email,
        companyName: person.company?.name ?? null,
        jobTitle: person.jobTitle ?? null,
        track,
        industry,
        status: 'ACTIVE',
        nextStage: 1,
        nextSendAt: getNextSendWindowStart(new Date(), setting),
        connectedAccountId,
        enrolledByUserWorkspaceId: userWorkspaceId ?? null,
      });
    } catch (error) {
      // The partial unique index catches a concurrent start for the same person
      if (
        (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION_CODE
      ) {
        throw new EmailSequenceException(
          `Person ${personId} is already in an active sequence`,
          EmailSequenceExceptionCode.ENROLLMENT_ALREADY_ACTIVE,
        );
      }

      throw error;
    }
  }

  async stopSequence({
    workspaceId,
    enrollmentId,
  }: {
    workspaceId: string;
    enrollmentId: string;
  }): Promise<EmailSequenceEnrollmentEntity> {
    const enrollment = await this.findEnrollmentOrThrow(
      workspaceId,
      enrollmentId,
    );

    if (enrollment.status === 'ACTIVE') {
      await this.endEnrollment({
        workspaceId,
        enrollmentId,
        status: 'STOPPED',
      });
    }

    return this.findEnrollmentOrThrow(workspaceId, enrollmentId);
  }

  async endEnrollment({
    workspaceId,
    enrollmentId,
    status,
    lastError,
  }: {
    workspaceId: string;
    enrollmentId: string;
    status: Exclude<EmailSequenceEnrollmentStatus, 'ACTIVE'>;
    lastError?: string;
  }): Promise<void> {
    await this.enrollmentRepository.update(
      workspaceId,
      { id: enrollmentId, status: 'ACTIVE' },
      {
        status,
        nextStage: null,
        nextSendAt: null,
        endedAt: new Date(),
        ...(isDefined(lastError) && { lastError }),
      },
    );
  }

  async findEnrollmentOrThrow(
    workspaceId: string,
    enrollmentId: string,
  ): Promise<EmailSequenceEnrollmentEntity> {
    const enrollment = await this.enrollmentRepository.findOne(workspaceId, {
      where: { id: enrollmentId },
      relations: { messages: true },
      order: { messages: { sentAt: 'ASC' } },
    });

    if (!isDefined(enrollment)) {
      throw new EmailSequenceException(
        `Enrollment ${enrollmentId} not found`,
        EmailSequenceExceptionCode.ENROLLMENT_NOT_FOUND,
      );
    }

    return enrollment;
  }

  async findEnrollments({
    workspaceId,
    personId,
  }: {
    workspaceId: string;
    personId?: string;
  }): Promise<EmailSequenceEnrollmentEntity[]> {
    return this.enrollmentRepository.find(workspaceId, {
      where: isDefined(personId) ? { personId } : {},
      relations: { messages: true },
      order: { createdAt: 'DESC', messages: { sentAt: 'ASC' } },
      take: DASHBOARD_ENROLLMENT_LIMIT,
    });
  }

  async computeStats(workspaceId: string): Promise<EmailSequenceStatsDTO> {
    const setting =
      await this.emailSequenceSettingService.getOrCreateSetting(workspaceId);

    const statusCounts = await this.enrollmentRepository
      .createScopedQueryBuilder(workspaceId, 'enrollment')
      .select('enrollment.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('enrollment.status')
      .getRawMany<{ status: EmailSequenceEnrollmentStatus; count: number }>();

    const countByStatus = (status: EmailSequenceEnrollmentStatus) =>
      statusCounts.find((row) => row.status === status)?.count ?? 0;

    const [emailsSent, emailsOpened, emailsSentToday] = await Promise.all([
      this.messageRepository.count(workspaceId),
      this.messageRepository.count(workspaceId, {
        where: { firstOpenedAt: Not(IsNull()) },
      }),
      this.countEmailsSentToday(workspaceId, setting.timeZone),
    ]);

    return {
      active: countByStatus('ACTIVE'),
      completed: countByStatus('COMPLETED'),
      replied: countByStatus('REPLIED'),
      bounced: countByStatus('BOUNCED'),
      stopped: countByStatus('STOPPED'),
      failed: countByStatus('FAILED'),
      emailsSent,
      emailsOpened,
      emailsSentToday,
    };
  }

  async countEmailsSentToday(
    workspaceId: string,
    timeZone: string,
  ): Promise<number> {
    return this.messageRepository.count(workspaceId, {
      where: {
        sentAt: MoreThanOrEqual(getStartOfZonedDay(new Date(), timeZone)),
      },
    });
  }

  async findSendingMailboxIdOrThrow({
    workspaceId,
    userWorkspaceId,
  }: {
    workspaceId: string;
    userWorkspaceId?: string;
  }): Promise<string> {
    const sendableMailboxes = await this.findSendableMailboxes(workspaceId);

    const connectedAccountId = isDefined(userWorkspaceId)
      ? selectConnectedAccountIdForCaller({
          connectedAccounts: sendableMailboxes,
          userWorkspaceId,
        })
      : sendableMailboxes[0]?.id;

    if (!isDefined(connectedAccountId)) {
      throw new EmailSequenceException(
        `No mailbox can send email in workspace ${workspaceId}`,
        EmailSequenceExceptionCode.NO_SENDING_MAILBOX,
      );
    }

    return connectedAccountId;
  }

  async findSendingMailboxHandle({
    workspaceId,
    userWorkspaceId,
  }: {
    workspaceId: string;
    userWorkspaceId?: string;
  }): Promise<string | null> {
    const sendableMailboxes = await this.findSendableMailboxes(workspaceId);

    const connectedAccountId = isDefined(userWorkspaceId)
      ? selectConnectedAccountIdForCaller({
          connectedAccounts: sendableMailboxes,
          userWorkspaceId,
        })
      : sendableMailboxes[0]?.id;

    return (
      sendableMailboxes.find((mailbox) => mailbox.id === connectedAccountId)
        ?.handle ?? null
    );
  }

  private async findSendableMailboxes(
    workspaceId: string,
  ): Promise<ConnectedAccountEntity[]> {
    const mailboxes = await this.connectedAccountRepository.find({
      where: {
        workspaceId,
        archivedAt: IsNull(),
        provider: In(getEmailProvidersForOperation(EmailOperation.SEND)),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return mailboxes.filter((connectedAccount) =>
      canConnectedAccountPerformEmailOperation({
        connectedAccount,
        operation: EmailOperation.SEND,
      }),
    );
  }

  private async findPersonOrThrow(
    workspaceId: string,
    personId: string,
  ): Promise<PersonWorkspaceEntity> {
    const person = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const personRepository =
          this.workspaceOrmManager.getRepository<PersonWorkspaceEntity>(
            'person',
            { shouldBypassPermissionChecks: true },
          );

        return personRepository.findOne({
          where: { id: personId },
          relations: { company: true },
        });
      },
      buildSystemAuthContext(workspaceId),
    );

    if (!isDefined(person)) {
      throw new EmailSequenceException(
        `Person ${personId} not found`,
        EmailSequenceExceptionCode.PERSON_NOT_FOUND,
      );
    }

    return person;
  }
}

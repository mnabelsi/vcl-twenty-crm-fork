import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import {
  EMAIL_SEQUENCE_INDUSTRIES,
  type EmailSequenceIndustry,
} from 'twenty-shared/types';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { type EmailSequenceEnrollmentEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-enrollment.entity';
import { type EmailSequenceSettingEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-setting.entity';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { EmailSequenceDashboardDTO } from 'src/modules/email-sequence/dtos/email-sequence-dashboard.dto';
import { EmailSequenceEnrollmentDTO } from 'src/modules/email-sequence/dtos/email-sequence-enrollment.dto';
import { EmailSequenceSettingDTO } from 'src/modules/email-sequence/dtos/email-sequence-setting.dto';
import { EmailSequenceTemplateDTO } from 'src/modules/email-sequence/dtos/email-sequence-template.dto';
import { SendEmailSequenceTestEmailInput } from 'src/modules/email-sequence/dtos/send-email-sequence-test-email.input';
import { StartEmailSequenceInput } from 'src/modules/email-sequence/dtos/start-email-sequence.input';
import { StopEmailSequenceInput } from 'src/modules/email-sequence/dtos/stop-email-sequence.input';
import { UpdateEmailSequenceSettingInput } from 'src/modules/email-sequence/dtos/update-email-sequence-setting.input';
import { UpdateEmailSequenceTemplateInput } from 'src/modules/email-sequence/dtos/update-email-sequence-template.input';
import { EmailSequenceGraphqlApiExceptionFilter } from 'src/modules/email-sequence/email-sequence-graphql-api-exception.filter';
import { EmailSequenceEnrollmentService } from 'src/modules/email-sequence/services/email-sequence-enrollment.service';
import { EmailSequenceSenderService } from 'src/modules/email-sequence/services/email-sequence-sender.service';
import { EmailSequenceSettingService } from 'src/modules/email-sequence/services/email-sequence-setting.service';

const toEnrollmentDTO = (
  enrollment: EmailSequenceEnrollmentEntity,
): EmailSequenceEnrollmentDTO => ({
  id: enrollment.id,
  personId: enrollment.personId,
  personName: enrollment.personName,
  email: enrollment.email,
  companyName: enrollment.companyName,
  jobTitle: enrollment.jobTitle,
  track: enrollment.track,
  industry: enrollment.industry,
  status: enrollment.status,
  nextStage: enrollment.nextStage,
  nextSendAt: enrollment.nextSendAt,
  lastStepKey: enrollment.lastStepKey,
  lastSentAt: enrollment.lastSentAt,
  endedAt: enrollment.endedAt,
  lastError: enrollment.lastError,
  createdAt: enrollment.createdAt,
  messages: (enrollment.messages ?? []).map((message) => ({
    id: message.id,
    stepKey: message.stepKey,
    subject: message.subject,
    sentAt: message.sentAt,
    openCount: message.openCount,
    firstOpenedAt: message.firstOpenedAt,
    messageThreadId: message.messageThreadId,
  })),
});

const toSettingDTO = (
  setting: EmailSequenceSettingEntity,
  sendingMailbox: string | null,
): EmailSequenceSettingDTO => ({
  signature: setting.signature,
  timeZone: setting.timeZone,
  sendDays: setting.sendDays,
  sendWindowStartHour: setting.sendWindowStartHour,
  sendWindowEndHour: setting.sendWindowEndHour,
  dailySendLimit: setting.dailySendLimit,
  stepDelaysInDays: setting.stepDelaysInDays,
  isOpenTrackingEnabled: setting.isOpenTrackingEnabled,
  industryLines: EMAIL_SEQUENCE_INDUSTRIES.map(
    (industry: EmailSequenceIndustry) => ({
      industry,
      line: setting.industryLines[industry] ?? '',
    }),
  ),
  sendingMailbox,
});

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(EmailSequenceGraphqlApiExceptionFilter)
@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: true,
      playground: true,
      workspaceAgnostic: false,
    },
    apiKey: true,
    oauthClient: false,
    application: false,
  }),
  SettingsPermissionGuard(PermissionFlagType.SEND_EMAIL_TOOL),
)
export class EmailSequenceResolver {
  constructor(
    private readonly emailSequenceSettingService: EmailSequenceSettingService,
    private readonly emailSequenceEnrollmentService: EmailSequenceEnrollmentService,
    private readonly emailSequenceSenderService: EmailSequenceSenderService,
  ) {}

  @Query(() => EmailSequenceDashboardDTO)
  async emailSequenceDashboard(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<EmailSequenceDashboardDTO> {
    const [stats, enrollments] = await Promise.all([
      this.emailSequenceEnrollmentService.computeStats(workspace.id),
      this.emailSequenceEnrollmentService.findEnrollments({
        workspaceId: workspace.id,
      }),
    ]);

    return { stats, enrollments: enrollments.map(toEnrollmentDTO) };
  }

  @Query(() => [EmailSequenceEnrollmentDTO])
  async emailSequenceEnrollmentsForPerson(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('personId', { type: () => UUIDScalarType }) personId: string,
  ): Promise<EmailSequenceEnrollmentDTO[]> {
    const enrollments =
      await this.emailSequenceEnrollmentService.findEnrollments({
        workspaceId: workspace.id,
        personId,
      });

    return enrollments.map(toEnrollmentDTO);
  }

  @Query(() => EmailSequenceSettingDTO)
  async emailSequenceSetting(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string | undefined,
  ): Promise<EmailSequenceSettingDTO> {
    const [setting, sendingMailbox] = await Promise.all([
      this.emailSequenceSettingService.getOrCreateSetting(workspace.id),
      this.emailSequenceEnrollmentService.findSendingMailboxHandle({
        workspaceId: workspace.id,
        userWorkspaceId,
      }),
    ]);

    return toSettingDTO(setting, sendingMailbox);
  }

  @Query(() => [EmailSequenceTemplateDTO])
  async emailSequenceTemplates(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<EmailSequenceTemplateDTO[]> {
    return this.emailSequenceSettingService.findTemplates(workspace.id);
  }

  @Mutation(() => EmailSequenceEnrollmentDTO)
  async startEmailSequence(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string | undefined,
    @Args('input') input: StartEmailSequenceInput,
  ): Promise<EmailSequenceEnrollmentDTO> {
    const enrollment = await this.emailSequenceEnrollmentService.startSequence({
      workspaceId: workspace.id,
      userWorkspaceId,
      personId: input.personId,
      track: input.track,
      industry: input.industry,
    });

    return toEnrollmentDTO({ ...enrollment, messages: [] });
  }

  @Mutation(() => EmailSequenceEnrollmentDTO)
  async stopEmailSequence(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('input') input: StopEmailSequenceInput,
  ): Promise<EmailSequenceEnrollmentDTO> {
    const enrollment = await this.emailSequenceEnrollmentService.stopSequence({
      workspaceId: workspace.id,
      enrollmentId: input.enrollmentId,
    });

    return toEnrollmentDTO(enrollment);
  }

  @Mutation(() => EmailSequenceTemplateDTO)
  async updateEmailSequenceTemplate(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('input') input: UpdateEmailSequenceTemplateInput,
  ): Promise<EmailSequenceTemplateDTO> {
    return this.emailSequenceSettingService.updateTemplate(workspace.id, input);
  }

  @Mutation(() => EmailSequenceSettingDTO)
  async updateEmailSequenceSetting(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string | undefined,
    @Args('input') input: UpdateEmailSequenceSettingInput,
  ): Promise<EmailSequenceSettingDTO> {
    const [setting, sendingMailbox] = await Promise.all([
      this.emailSequenceSettingService.updateSetting(workspace.id, input),
      this.emailSequenceEnrollmentService.findSendingMailboxHandle({
        workspaceId: workspace.id,
        userWorkspaceId,
      }),
    ]);

    return toSettingDTO(setting, sendingMailbox);
  }

  @Mutation(() => String)
  async sendEmailSequenceTestEmail(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string | undefined,
    @Args('input') input: SendEmailSequenceTestEmailInput,
  ): Promise<string> {
    return this.emailSequenceSenderService.sendTestEmail({
      workspaceId: workspace.id,
      userWorkspaceId,
      track: input.track,
      stepKey: input.stepKey,
      industry: input.industry,
    });
  }
}

import { Injectable } from '@nestjs/common';

import {
  EMAIL_SEQUENCE_STEP_KEYS,
  EMAIL_SEQUENCE_TRACKS,
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { EmailSequenceSettingEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-setting.entity';
import { EmailSequenceTemplateEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-template.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { EMAIL_SEQUENCE_DEFAULT_INDUSTRY_LINES } from 'src/modules/email-sequence/constants/email-sequence-default-industry-lines.constant';
import { EMAIL_SEQUENCE_DEFAULT_SETTINGS } from 'src/modules/email-sequence/constants/email-sequence-default-settings.constant';
import { EMAIL_SEQUENCE_DEFAULT_TEMPLATES } from 'src/modules/email-sequence/constants/email-sequence-default-templates.constant';
import { type UpdateEmailSequenceSettingInput } from 'src/modules/email-sequence/dtos/update-email-sequence-setting.input';
import { type UpdateEmailSequenceTemplateInput } from 'src/modules/email-sequence/dtos/update-email-sequence-template.input';
import {
  EmailSequenceException,
  EmailSequenceExceptionCode,
} from 'src/modules/email-sequence/email-sequence.exception';

@Injectable()
export class EmailSequenceSettingService {
  constructor(
    @InjectWorkspaceScopedRepository(EmailSequenceSettingEntity)
    private readonly settingRepository: WorkspaceScopedRepository<EmailSequenceSettingEntity>,
    @InjectWorkspaceScopedRepository(EmailSequenceTemplateEntity)
    private readonly templateRepository: WorkspaceScopedRepository<EmailSequenceTemplateEntity>,
  ) {}

  async getOrCreateSetting(
    workspaceId: string,
  ): Promise<EmailSequenceSettingEntity> {
    const existingSetting = await this.settingRepository.findOneBy(
      workspaceId,
      {},
    );

    if (isDefined(existingSetting)) {
      return existingSetting;
    }

    await this.settingRepository
      .createQueryBuilder()
      .insert()
      .values({
        workspaceId,
        signature: EMAIL_SEQUENCE_DEFAULT_SETTINGS.signature,
        industryLines: EMAIL_SEQUENCE_DEFAULT_INDUSTRY_LINES,
        timeZone: EMAIL_SEQUENCE_DEFAULT_SETTINGS.timeZone,
        sendDays: [...EMAIL_SEQUENCE_DEFAULT_SETTINGS.sendDays],
        sendWindowStartHour:
          EMAIL_SEQUENCE_DEFAULT_SETTINGS.sendWindowStartHour,
        sendWindowEndHour: EMAIL_SEQUENCE_DEFAULT_SETTINGS.sendWindowEndHour,
        dailySendLimit: EMAIL_SEQUENCE_DEFAULT_SETTINGS.dailySendLimit,
        stepDelaysInDays: [...EMAIL_SEQUENCE_DEFAULT_SETTINGS.stepDelaysInDays],
        isOpenTrackingEnabled:
          EMAIL_SEQUENCE_DEFAULT_SETTINGS.isOpenTrackingEnabled,
      })
      .orIgnore()
      .execute();

    await this.seedMissingTemplates(workspaceId);

    return this.settingRepository.findOneOrFail(workspaceId, { where: {} });
  }

  async updateSetting(
    workspaceId: string,
    input: UpdateEmailSequenceSettingInput,
  ): Promise<EmailSequenceSettingEntity> {
    const { industryLines, ...scalarFields } = input;
    const currentSetting = await this.getOrCreateSetting(workspaceId);

    if (
      (scalarFields.sendWindowStartHour ??
        currentSetting.sendWindowStartHour) >=
      (scalarFields.sendWindowEndHour ?? currentSetting.sendWindowEndHour)
    ) {
      throw new EmailSequenceException(
        'The send window must start before it ends',
        EmailSequenceExceptionCode.INVALID_SETTING,
      );
    }

    if (
      isDefined(scalarFields.sendDays) &&
      scalarFields.sendDays.length === 0
    ) {
      throw new EmailSequenceException(
        'Pick at least one sending day',
        EmailSequenceExceptionCode.INVALID_SETTING,
      );
    }

    if (
      isDefined(scalarFields.stepDelaysInDays) &&
      (scalarFields.stepDelaysInDays.length !== 3 ||
        scalarFields.stepDelaysInDays.some((delay) => delay < 1))
    ) {
      throw new EmailSequenceException(
        'Provide three follow-up delays of at least one day each',
        EmailSequenceExceptionCode.INVALID_SETTING,
      );
    }

    await this.settingRepository.update(
      workspaceId,
      { id: currentSetting.id },
      {
        ...Object.fromEntries(
          Object.entries(scalarFields).filter(([, value]) => isDefined(value)),
        ),
        ...(isDefined(industryLines) && {
          industryLines: {
            ...currentSetting.industryLines,
            ...Object.fromEntries(
              industryLines.map(({ industry, line }) => [industry, line]),
            ),
          },
        }),
      },
    );

    return this.settingRepository.findOneOrFail(workspaceId, { where: {} });
  }

  async findTemplates(
    workspaceId: string,
  ): Promise<EmailSequenceTemplateEntity[]> {
    await this.getOrCreateSetting(workspaceId);

    return this.templateRepository.find(workspaceId, {
      order: { track: 'ASC', stepKey: 'ASC' },
    });
  }

  async findTemplateOrThrow({
    workspaceId,
    track,
    stepKey,
  }: {
    workspaceId: string;
    track: EmailSequenceTrack;
    stepKey: EmailSequenceStepKey;
  }): Promise<EmailSequenceTemplateEntity> {
    const template = await this.templateRepository.findOneBy(workspaceId, {
      track,
      stepKey,
    });

    if (!isDefined(template)) {
      throw new EmailSequenceException(
        `No template found for ${track} ${stepKey}`,
        EmailSequenceExceptionCode.TEMPLATE_NOT_FOUND,
      );
    }

    return template;
  }

  async updateTemplate(
    workspaceId: string,
    input: UpdateEmailSequenceTemplateInput,
  ): Promise<EmailSequenceTemplateEntity> {
    const template = await this.findTemplateOrThrow({
      workspaceId,
      track: input.track,
      stepKey: input.stepKey,
    });

    const isFreshThreadStep = isDefined(template.subject);

    if (isFreshThreadStep && input.subject?.trim().length === 0) {
      throw new EmailSequenceException(
        'This step needs a subject',
        EmailSequenceExceptionCode.INVALID_TEMPLATE,
      );
    }

    if (input.body.trim().length === 0) {
      throw new EmailSequenceException(
        'The email body cannot be empty',
        EmailSequenceExceptionCode.INVALID_TEMPLATE,
      );
    }

    await this.templateRepository.update(
      workspaceId,
      { id: template.id },
      {
        body: input.body,
        subject: isFreshThreadStep ? (input.subject ?? template.subject) : null,
      },
    );

    return this.findTemplateOrThrow({
      workspaceId,
      track: input.track,
      stepKey: input.stepKey,
    });
  }

  private async seedMissingTemplates(workspaceId: string): Promise<void> {
    const templatesToSeed = EMAIL_SEQUENCE_TRACKS.flatMap((track) =>
      EMAIL_SEQUENCE_STEP_KEYS.map((stepKey) => ({
        workspaceId,
        track,
        stepKey,
        subject: EMAIL_SEQUENCE_DEFAULT_TEMPLATES[track][stepKey].subject,
        body: EMAIL_SEQUENCE_DEFAULT_TEMPLATES[track][stepKey].body,
      })),
    );

    await this.templateRepository
      .createQueryBuilder()
      .insert()
      .values(templatesToSeed)
      .orIgnore()
      .execute();
  }
}

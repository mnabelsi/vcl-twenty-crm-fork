import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { type EmailSequenceIndustry } from 'twenty-shared/types';
import { useToast } from 'twenty-ui/components';
import { Button, Switch } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { EMAIL_SEQUENCE_INDUSTRY_LABELS } from '@/email-sequence/constants/EmailSequenceIndustryLabels';
import { EMAIL_SEQUENCE_WEEKDAY_LABELS } from '@/email-sequence/constants/EmailSequenceWeekdayLabels';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { TextArea } from '@/ui/input/components/TextArea';
import {
  type EmailSequenceSettingFragmentFragment,
  UpdateEmailSequenceSettingDocument,
} from '~/generated-metadata/graphql';
import { getErrorMessageFromApolloError } from '~/utils/get-error-message-from-apollo-error.util';

const StyledForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  max-width: 760px;
`;

const StyledSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledSectionTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledRow = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
`;

const StyledDays = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledDayButton = styled.button<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected ? themeCssVariables.color.blue : 'transparent'};
  border: 1px solid
    ${({ isSelected }) =>
      isSelected
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

const StyledToggleRow = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const toNumberOrFallback = (value: string, fallback: number) => {
  const parsedValue = Number.parseInt(value, 10);

  return Number.isNaN(parsedValue) ? fallback : parsedValue;
};

type EmailSequenceSettingsFormProps = {
  setting: EmailSequenceSettingFragmentFragment;
};

export const EmailSequenceSettingsForm = ({
  setting,
}: EmailSequenceSettingsFormProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();

  const [signature, setSignature] = useState(setting.signature);
  const [timeZone, setTimeZone] = useState(setting.timeZone);
  const [sendDays, setSendDays] = useState<number[]>(setting.sendDays);
  const [sendWindowStartHour, setSendWindowStartHour] = useState(
    setting.sendWindowStartHour,
  );
  const [sendWindowEndHour, setSendWindowEndHour] = useState(
    setting.sendWindowEndHour,
  );
  const [dailySendLimit, setDailySendLimit] = useState(setting.dailySendLimit);
  const [stepDelaysInDays, setStepDelaysInDays] = useState<number[]>(
    setting.stepDelaysInDays,
  );
  const [isOpenTrackingEnabled, setIsOpenTrackingEnabled] = useState(
    setting.isOpenTrackingEnabled,
  );
  const [industryLines, setIndustryLines] = useState(setting.industryLines);

  const [updateSetting, { loading: isSaving }] = useMutation(
    UpdateEmailSequenceSettingDocument,
  );

  const handleToggleDay = (dayIndex: number) =>
    setSendDays((currentDays) =>
      currentDays.includes(dayIndex)
        ? currentDays.filter((day) => day !== dayIndex)
        : [...currentDays, dayIndex].sort(),
    );

  const handleDelayChange = (delayIndex: number, value: string) =>
    setStepDelaysInDays((currentDelays) =>
      currentDelays.map((delay, index) =>
        index === delayIndex ? toNumberOrFallback(value, delay) : delay,
      ),
    );

  const handleIndustryLineChange = (
    industry: EmailSequenceIndustry,
    line: string,
  ) =>
    setIndustryLines((currentLines) =>
      currentLines.map((industryLine) =>
        industryLine.industry === industry
          ? { ...industryLine, line }
          : industryLine,
      ),
    );

  const handleSave = async () => {
    try {
      await updateSetting({
        variables: {
          input: {
            signature,
            timeZone,
            sendDays,
            sendWindowStartHour,
            sendWindowEndHour,
            dailySendLimit,
            stepDelaysInDays,
            isOpenTrackingEnabled,
            industryLines: industryLines.map(({ industry, line }) => ({
              industry,
              line,
            })),
          },
        },
      });

      enqueueToast({ status: 'success', children: t`Settings saved.` });
    } catch (error) {
      enqueueToast({
        status: 'error',
        children: getErrorMessageFromApolloError(error as Error),
      });
    }
  };

  const sendingMailbox = setting.sendingMailbox;

  return (
    <StyledForm>
      <StyledSection>
        <StyledSectionTitle>{t`Sending mailbox`}</StyledSectionTitle>
        <StyledHint>
          {isNonEmptyString(sendingMailbox)
            ? t`Sequences you start are sent from ${sendingMailbox}, through your connected account.`
            : t`No mailbox can send yet. Connect your Microsoft 365 account in Settings > Accounts.`}
        </StyledHint>
      </StyledSection>

      <StyledSection>
        <StyledSectionTitle>{t`Sending window`}</StyledSectionTitle>
        <StyledHint>
          {t`Emails only go out on these days and hours, in the time zone below. Delays are counted from the previous email.`}
        </StyledHint>
        <StyledDays>
          {EMAIL_SEQUENCE_WEEKDAY_LABELS.map((dayLabel, dayIndex) => (
            <StyledDayButton
              key={dayIndex}
              type="button"
              isSelected={sendDays.includes(dayIndex)}
              onClick={() => handleToggleDay(dayIndex)}
            >
              {t(dayLabel)}
            </StyledDayButton>
          ))}
        </StyledDays>
        <StyledRow>
          <SettingsTextInput
            instanceId="email-sequence-time-zone"
            label={t`Time zone`}
            value={timeZone}
            onChange={setTimeZone}
            fullWidth
          />
          <SettingsTextInput
            instanceId="email-sequence-window-start"
            label={t`Start hour (0-23)`}
            type="number"
            value={String(sendWindowStartHour)}
            onChange={(value) =>
              setSendWindowStartHour(
                toNumberOrFallback(value, sendWindowStartHour),
              )
            }
            fullWidth
          />
          <SettingsTextInput
            instanceId="email-sequence-window-end"
            label={t`End hour (1-24)`}
            type="number"
            value={String(sendWindowEndHour)}
            onChange={(value) =>
              setSendWindowEndHour(toNumberOrFallback(value, sendWindowEndHour))
            }
            fullWidth
          />
          <SettingsTextInput
            instanceId="email-sequence-daily-limit"
            label={t`Max emails per day`}
            type="number"
            value={String(dailySendLimit)}
            onChange={(value) =>
              setDailySendLimit(toNumberOrFallback(value, dailySendLimit))
            }
            fullWidth
          />
        </StyledRow>
        <StyledRow>
          <SettingsTextInput
            instanceId="email-sequence-delay-1"
            label={t`Days before email 2`}
            type="number"
            value={String(stepDelaysInDays[0] ?? '')}
            onChange={(value) => handleDelayChange(0, value)}
            fullWidth
          />
          <SettingsTextInput
            instanceId="email-sequence-delay-2"
            label={t`Days before email 3`}
            type="number"
            value={String(stepDelaysInDays[1] ?? '')}
            onChange={(value) => handleDelayChange(1, value)}
            fullWidth
          />
          <SettingsTextInput
            instanceId="email-sequence-delay-3"
            label={t`Days before email 4`}
            type="number"
            value={String(stepDelaysInDays[2] ?? '')}
            onChange={(value) => handleDelayChange(2, value)}
            fullWidth
          />
        </StyledRow>
        <StyledToggleRow>
          <Switch
            aria-label={t`Track opens`}
            size="sm"
            checked={isOpenTrackingEnabled}
            onCheckedChange={(checked) => setIsOpenTrackingEnabled(checked)}
          />
          {t`Track opens (adds a 1-pixel image to each email)`}
        </StyledToggleRow>
      </StyledSection>

      <StyledSection>
        <StyledSectionTitle>{t`Signature`}</StyledSectionTitle>
        <TextArea
          textAreaId="email-sequence-signature"
          value={signature}
          onChange={setSignature}
          minRows={4}
        />
      </StyledSection>

      <StyledSection>
        <StyledSectionTitle>{t`Industry lines`}</StyledSectionTitle>
        <StyledHint>
          {t`One sentence per industry, inserted where the email uses the industry line variable.`}
        </StyledHint>
        {industryLines.map((industryLine) => (
          <TextArea
            key={industryLine.industry}
            textAreaId={`email-sequence-industry-${industryLine.industry}`}
            label={t(
              EMAIL_SEQUENCE_INDUSTRY_LABELS[
                industryLine.industry as EmailSequenceIndustry
              ],
            )}
            value={industryLine.line}
            onChange={(line) =>
              handleIndustryLineChange(
                industryLine.industry as EmailSequenceIndustry,
                line,
              )
            }
            minRows={2}
          />
        ))}
      </StyledSection>

      <StyledActions>
        <Button
          variant="solid"
          color="accent"
          loading={isSaving}
          disabled={isSaving}
          onClick={handleSave}
        >{t`Save settings`}</Button>
      </StyledActions>
    </StyledForm>
  );
};

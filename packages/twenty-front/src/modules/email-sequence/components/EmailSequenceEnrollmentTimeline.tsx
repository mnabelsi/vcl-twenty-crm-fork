import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { type EmailSequenceStepKey } from 'twenty-shared/types';
import { IconEye, IconMail } from 'twenty-ui/icon';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';

import { EMAIL_SEQUENCE_STEP_LABELS } from '@/email-sequence/constants/EmailSequenceStepLabels';
import { type EmailSequenceEnrollmentFragmentFragment } from '~/generated-metadata/graphql';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const StyledTimeline = styled.ol`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledItem = styled.li`
  align-items: flex-start;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledIconContainer = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  padding-top: 2px;
`;

const StyledText = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledSubject = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledNextStep = styled.li`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding-left: ${themeCssVariables.spacing[6]};
`;

type EmailSequenceEnrollmentTimelineProps = {
  enrollment: EmailSequenceEnrollmentFragmentFragment;
};

export const EmailSequenceEnrollmentTimeline = ({
  enrollment,
}: EmailSequenceEnrollmentTimelineProps) => {
  const { t } = useLingui();
  const theme = useTheme();

  const nextSendLabel =
    enrollment.status === 'ACTIVE' && isDefined(enrollment.nextSendAt)
      ? beautifyPastDateRelativeToNow(enrollment.nextSendAt)
      : null;

  return (
    <StyledTimeline>
      {enrollment.messages.map((message) => {
        const sentLabel = beautifyPastDateRelativeToNow(message.sentAt);
        const openedLabel = isDefined(message.firstOpenedAt)
          ? beautifyPastDateRelativeToNow(message.firstOpenedAt)
          : null;
        const openCount = message.openCount;

        return (
          <StyledItem key={message.id}>
            <StyledIconContainer>
              <IconMail size={theme.icon.size.sm} />
            </StyledIconContainer>
            <StyledText>
              <StyledTitle>
                {t(
                  EMAIL_SEQUENCE_STEP_LABELS[
                    message.stepKey as EmailSequenceStepKey
                  ],
                )}
              </StyledTitle>
              <StyledSubject title={message.subject}>
                {message.subject}
              </StyledSubject>
              <StyledMeta>
                {t`Sent ${sentLabel}`}
                {isDefined(openedLabel) && (
                  <>
                    {' · '}
                    <IconEye size={theme.icon.size.sm} />
                    {t`Opened ${openedLabel} (${openCount}x)`}
                  </>
                )}
              </StyledMeta>
            </StyledText>
          </StyledItem>
        );
      })}
      {isDefined(nextSendLabel) && (
        <StyledNextStep>{t`Next email ${nextSendLabel}`}</StyledNextStep>
      )}
    </StyledTimeline>
  );
};

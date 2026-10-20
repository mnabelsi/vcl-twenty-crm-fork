import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme';

import { type EmailSequenceDashboardQuery } from '~/generated-metadata/graphql';

const StyledStats = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
`;

const StyledStat = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledStatValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledStatLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type EmailSequenceStatsBarProps = {
  stats: EmailSequenceDashboardQuery['emailSequenceDashboard']['stats'];
  dailySendLimit?: number;
};

export const EmailSequenceStatsBar = ({
  stats,
  dailySendLimit,
}: EmailSequenceStatsBarProps) => {
  const { t } = useLingui();

  const openRate =
    stats.emailsSent > 0
      ? `${Math.round((stats.emailsOpened / stats.emailsSent) * 100)}%`
      : '–';
  const finishedCount = stats.replied + stats.completed + stats.stopped;
  const replyRate =
    finishedCount > 0
      ? `${Math.round((stats.replied / finishedCount) * 100)}%`
      : '–';
  const problemCount = stats.bounced + stats.failed;

  const statItems = [
    { label: t`Active`, value: String(stats.active) },
    { label: t`Replied`, value: String(stats.replied) },
    { label: t`Reply rate`, value: replyRate },
    { label: t`Completed, no reply`, value: String(stats.completed) },
    { label: t`Emails sent`, value: String(stats.emailsSent) },
    { label: t`Open rate`, value: openRate },
    {
      label: t`Sent today`,
      value:
        dailySendLimit !== undefined
          ? `${stats.emailsSentToday} / ${dailySendLimit}`
          : String(stats.emailsSentToday),
    },
    { label: t`Bounced or failed`, value: String(problemCount) },
  ];

  return (
    <StyledStats>
      {statItems.map((statItem) => (
        <StyledStat key={statItem.label}>
          <StyledStatValue>{statItem.value}</StyledStatValue>
          <StyledStatLabel>{statItem.label}</StyledStatLabel>
        </StyledStat>
      ))}
    </StyledStats>
  );
};

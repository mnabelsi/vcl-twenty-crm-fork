import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import {
  IconMail,
  IconRefresh,
  IconSend,
  IconSettings,
  IconUsers,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';

import { EmailSequenceEnrollmentTable } from '@/email-sequence/components/EmailSequenceEnrollmentTable';
import { EmailSequenceSettingsForm } from '@/email-sequence/components/EmailSequenceSettingsForm';
import { EmailSequenceStatsBar } from '@/email-sequence/components/EmailSequenceStatsBar';
import { EmailSequenceTemplateEditor } from '@/email-sequence/components/EmailSequenceTemplateEditor';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { TabList } from '@/ui/layout/tab-list/components/TabList';
import { TabListRoot } from '@/ui/layout/tab-list/components/TabListRoot';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import {
  EmailSequenceDashboardDocument,
  EmailSequenceSettingDocument,
} from '~/generated-metadata/graphql';

const DASHBOARD_POLL_INTERVAL_MS = 60_000;
const EMAIL_SEQUENCES_TABS_INSTANCE_ID = 'email-sequences-tabs';

type EmailSequencesTabId = 'activity' | 'emails' | 'settings';

const StyledContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledTabs = styled.div`
  padding: 0 ${themeCssVariables.spacing[3]};
`;

export const EmailSequencesPage = () => {
  const { t } = useLingui();
  const theme = useTheme();
  const [activeTabId, setActiveTabId] =
    useState<EmailSequencesTabId>('activity');

  const {
    data: dashboardData,
    loading: isDashboardLoading,
    refetch: refetchDashboard,
  } = useQuery(EmailSequenceDashboardDocument, {
    pollInterval: DASHBOARD_POLL_INTERVAL_MS,
    fetchPolicy: 'cache-and-network',
  });
  const { data: settingData } = useQuery(EmailSequenceSettingDocument);

  const tabs = [
    { id: 'activity', title: t`Activity`, Icon: IconUsers },
    { id: 'emails', title: t`Emails`, Icon: IconMail },
    { id: 'settings', title: t`Settings`, Icon: IconSettings },
  ];

  return (
    <>
      <PageTitle title={t`Email Sequences`} />
      <PageCardLayout
        header={
          <PageCardHeader
            icon={
              <IconSend
                size={theme.icon.size.md}
                stroke={theme.icon.stroke.sm}
              />
            }
            title={t`Email Sequences`}
            actionButton={
              <Button
                size="sm"
                variant="outline"
                startIcon={<IconRefresh size={14} />}
                loading={isDashboardLoading}
                disabled={isDashboardLoading}
                onClick={() => refetchDashboard()}
              >
                {t`Refresh`}
              </Button>
            }
          />
        }
      >
        <TabListRoot componentInstanceId={EMAIL_SEQUENCES_TABS_INSTANCE_ID}>
          <StyledTabs>
            <TabList
              aria-label={t`Email sequence sections`}
              tabs={tabs}
              behaveAsLinks={false}
              componentInstanceId={EMAIL_SEQUENCES_TABS_INSTANCE_ID}
              defaultActiveTabId="activity"
              onChangeTab={(tabId) =>
                setActiveTabId(tabId as EmailSequencesTabId)
              }
            />
          </StyledTabs>
          <StyledContent>
            {activeTabId === 'activity' && isDefined(dashboardData) && (
              <>
                <EmailSequenceStatsBar
                  stats={dashboardData.emailSequenceDashboard.stats}
                  dailySendLimit={
                    settingData?.emailSequenceSetting.dailySendLimit
                  }
                />
                <EmailSequenceEnrollmentTable
                  enrollments={dashboardData.emailSequenceDashboard.enrollments}
                />
              </>
            )}
            {activeTabId === 'emails' && <EmailSequenceTemplateEditor />}
            {activeTabId === 'settings' &&
              isDefined(settingData?.emailSequenceSetting) && (
                <EmailSequenceSettingsForm
                  setting={settingData.emailSequenceSetting}
                />
              )}
          </StyledContent>
        </TabListRoot>
      </PageCardLayout>
    </>
  );
};

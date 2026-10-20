import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import {
  CoreObjectNameSingular,
  EMAIL_SEQUENCE_INDUSTRIES,
  EMAIL_SEQUENCE_TRACKS,
  type EmailSequenceEnrollmentStatus,
  type EmailSequenceIndustry,
  type EmailSequenceTrack,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components';
import { IconPlayerStop, IconSend } from 'twenty-ui/icon';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { EmailSequenceEnrollmentTimeline } from '@/email-sequence/components/EmailSequenceEnrollmentTimeline';
import { EMAIL_SEQUENCE_INDUSTRY_LABELS } from '@/email-sequence/constants/EmailSequenceIndustryLabels';
import { EMAIL_SEQUENCE_STATUS_DISPLAY } from '@/email-sequence/constants/EmailSequenceStatusLabels';
import { EMAIL_SEQUENCE_TRACK_LABELS } from '@/email-sequence/constants/EmailSequenceTrackLabels';
import { useStopEmailSequence } from '@/email-sequence/hooks/useStopEmailSequence';
import { type EmailSequencePersonRecord } from '@/email-sequence/types/EmailSequencePersonRecord';
import { getCompanyIndustryHints } from '@/email-sequence/utils/getCompanyIndustryHints';
import { getDefaultEmailSequenceIndustry } from '@/email-sequence/utils/getDefaultEmailSequenceIndustry';
import { getDefaultEmailSequenceTrack } from '@/email-sequence/utils/getDefaultEmailSequenceTrack';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { startEmailSequencePersonIdComponentState } from '@/side-panel/pages/start-email-sequence/states/startEmailSequencePersonIdComponentState';
import { Select } from '@/ui/input/components/Select';
import { SidePanelFooter } from '@/ui/layout/side-panel/components/SidePanelFooter';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import {
  EmailSequenceDashboardDocument,
  EmailSequenceEnrollmentsForPersonDocument,
  EmailSequenceSettingDocument,
  StartEmailSequenceDocument,
} from '~/generated-metadata/graphql';
import { getErrorMessageFromApolloError } from '~/utils/get-error-message-from-apollo-error.util';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledPersonName = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledMuted = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledWarning = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledSectionTitle = styled.div`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  text-transform: uppercase;
`;

const StyledEnrollmentCard = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledEnrollmentHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledEnrollmentHeaderLeft = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const SidePanelStartEmailSequencePageContent = ({
  personId,
}: {
  personId: string;
}) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { closeSidePanelMenu } = useSidePanelMenu();

  const { record: person } = useFindOneRecord<EmailSequencePersonRecord>({
    objectNameSingular: CoreObjectNameSingular.Person,
    objectRecordId: personId,
  });

  const { data: settingData } = useQuery(EmailSequenceSettingDocument);
  const { data: enrollmentsData } = useQuery(
    EmailSequenceEnrollmentsForPersonDocument,
    { variables: { personId }, fetchPolicy: 'cache-and-network' },
  );

  const [selectedTrack, setSelectedTrack] = useState<EmailSequenceTrack | null>(
    null,
  );
  const [selectedIndustry, setSelectedIndustry] =
    useState<EmailSequenceIndustry | null>(null);

  const [startEmailSequenceMutation, { loading: isStarting }] = useMutation(
    StartEmailSequenceDocument,
    {
      refetchQueries: [
        EmailSequenceDashboardDocument,
        EmailSequenceEnrollmentsForPersonDocument,
      ],
    },
  );
  const { stopEmailSequence, isStopping } = useStopEmailSequence();

  const track = selectedTrack ?? getDefaultEmailSequenceTrack(person?.jobTitle);
  const industry =
    selectedIndustry ??
    getDefaultEmailSequenceIndustry(
      ...getCompanyIndustryHints(person?.company),
    );

  const enrollments = enrollmentsData?.emailSequenceEnrollmentsForPerson ?? [];
  const activeEnrollment = enrollments.find(
    (enrollment) => enrollment.status === 'ACTIVE',
  );
  const sendingMailbox = settingData?.emailSequenceSetting.sendingMailbox;
  const primaryEmail = person?.emails?.primaryEmail;
  const personName = [person?.name?.firstName, person?.name?.lastName]
    .filter(isNonEmptyString)
    .join(' ');
  const personSubtitle = [person?.jobTitle, person?.company?.name]
    .filter(isNonEmptyString)
    .join(' · ');

  const canStart =
    !isDefined(activeEnrollment) &&
    isNonEmptyString(primaryEmail) &&
    isNonEmptyString(sendingMailbox);

  const handleStart = async () => {
    try {
      await startEmailSequenceMutation({
        variables: { input: { personId, track, industry } },
      });

      enqueueToast({
        status: 'success',
        children: t`Sequence started. The first email goes out in the next sending window.`,
      });
    } catch (error) {
      enqueueToast({
        status: 'error',
        children: getErrorMessageFromApolloError(error as Error),
      });
    }
  };

  return (
    <StyledContainer>
      <StyledContent>
        <div>
          <StyledPersonName>{personName || primaryEmail}</StyledPersonName>
          {isNonEmptyString(personSubtitle) && (
            <StyledMuted>{personSubtitle}</StyledMuted>
          )}
          {!isNonEmptyString(primaryEmail) && isDefined(person) && (
            <StyledWarning>{t`This contact has no email address.`}</StyledWarning>
          )}
        </div>

        {!isDefined(activeEnrollment) && (
          <>
            <Select
              dropdownId="start-email-sequence-track"
              label={t`Track (position)`}
              fullWidth
              value={track}
              options={EMAIL_SEQUENCE_TRACKS.map((trackOption) => ({
                value: trackOption,
                label: t(EMAIL_SEQUENCE_TRACK_LABELS[trackOption]),
              }))}
              onChange={setSelectedTrack}
            />
            <Select
              dropdownId="start-email-sequence-industry"
              label={t`Industry`}
              fullWidth
              value={industry}
              options={EMAIL_SEQUENCE_INDUSTRIES.map((industryOption) => ({
                value: industryOption,
                label: t(EMAIL_SEQUENCE_INDUSTRY_LABELS[industryOption]),
              }))}
              onChange={setSelectedIndustry}
            />
            {isNonEmptyString(sendingMailbox) ? (
              <StyledMuted>{t`Sends from ${sendingMailbox}`}</StyledMuted>
            ) : (
              <StyledWarning>
                {t`No mailbox can send yet. Connect your Microsoft 365 account in Settings > Accounts.`}
              </StyledWarning>
            )}
          </>
        )}

        {enrollments.length > 0 && (
          <StyledSectionTitle>{t`Sequences`}</StyledSectionTitle>
        )}
        {enrollments.map((enrollment) => {
          const statusDisplay =
            EMAIL_SEQUENCE_STATUS_DISPLAY[
              enrollment.status as EmailSequenceEnrollmentStatus
            ];

          return (
            <StyledEnrollmentCard key={enrollment.id}>
              <StyledEnrollmentHeader>
                <StyledEnrollmentHeaderLeft>
                  <Tag color={statusDisplay.color}>
                    {t(statusDisplay.label)}
                  </Tag>
                  <StyledMuted>
                    {t(
                      EMAIL_SEQUENCE_TRACK_LABELS[
                        enrollment.track as EmailSequenceTrack
                      ],
                    )}
                    {' · '}
                    {t(
                      EMAIL_SEQUENCE_INDUSTRY_LABELS[
                        enrollment.industry as EmailSequenceIndustry
                      ],
                    )}
                  </StyledMuted>
                </StyledEnrollmentHeaderLeft>
                {enrollment.status === 'ACTIVE' && (
                  <Button
                    size="sm"
                    variant="outline"
                    startIcon={<IconPlayerStop />}
                    loading={isStopping}
                    disabled={isStopping}
                    onClick={() => stopEmailSequence(enrollment.id)}
                  >{t`Stop`}</Button>
                )}
              </StyledEnrollmentHeader>
              <EmailSequenceEnrollmentTimeline enrollment={enrollment} />
              {isNonEmptyString(enrollment.lastError) && (
                <StyledWarning>{enrollment.lastError}</StyledWarning>
              )}
            </StyledEnrollmentCard>
          );
        })}
      </StyledContent>
      <SidePanelFooter
        actions={[
          <Button
            key="close"
            size="sm"
            variant="outline"
            onClick={closeSidePanelMenu}
          >{t`Close`}</Button>,
          ...(isDefined(activeEnrollment)
            ? []
            : [
                <Button
                  key="start-sequence"
                  size="sm"
                  startIcon={<IconSend />}
                  loading={isStarting}
                  disabled={isStarting || !canStart}
                  onClick={handleStart}
                  variant="solid"
                  color="accent"
                >{t`Start Sequence`}</Button>,
              ]),
        ]}
      />
    </StyledContainer>
  );
};

export const SidePanelStartEmailSequencePage = () => {
  const startEmailSequencePersonId = useAtomComponentStateValue(
    startEmailSequencePersonIdComponentState,
  );

  if (!isDefined(startEmailSequencePersonId)) {
    return null;
  }

  return (
    <SidePanelStartEmailSequencePageContent
      personId={startEmailSequencePersonId}
    />
  );
};

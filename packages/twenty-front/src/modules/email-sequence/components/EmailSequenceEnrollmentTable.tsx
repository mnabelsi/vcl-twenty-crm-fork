import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CoreObjectNameSingular,
  EMAIL_SEQUENCE_ENROLLMENT_STATUSES,
  type EmailSequenceEnrollmentStatus,
  type EmailSequenceIndustry,
  type EmailSequenceTrack,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import {
  IconChevronDown,
  IconChevronRight,
  IconPlayerStop,
} from 'twenty-ui/icon';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';

import { EmailSequenceEnrollmentTimeline } from '@/email-sequence/components/EmailSequenceEnrollmentTimeline';
import { EMAIL_SEQUENCE_INDUSTRY_LABELS } from '@/email-sequence/constants/EmailSequenceIndustryLabels';
import { EMAIL_SEQUENCE_STATUS_DISPLAY } from '@/email-sequence/constants/EmailSequenceStatusLabels';
import { EMAIL_SEQUENCE_TRACK_LABELS } from '@/email-sequence/constants/EmailSequenceTrackLabels';
import { useStopEmailSequence } from '@/email-sequence/hooks/useStopEmailSequence';
import { getLinkToShowPage } from '@/object-metadata/utils/getLinkToShowPage';
import { type EmailSequenceEnrollmentFragmentFragment } from '~/generated-metadata/graphql';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const TOTAL_STAGE_COUNT = 4;

const StyledFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledFilterButton = styled.button<{ isActive: boolean }>`
  background: ${({ isActive }) =>
    isActive ? themeCssVariables.background.transparent.medium : 'transparent'};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

const StyledTableWrapper = styled.div`
  overflow-x: auto;
`;

const StyledTable = styled.table`
  border-collapse: collapse;
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 860px;
  width: 100%;
`;

const StyledHeaderCell = styled.th`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
  white-space: nowrap;
`;

const StyledRow = styled.tr`
  cursor: pointer;

  &:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }
`;

const StyledCell = styled.td`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.primary};
  padding: ${themeCssVariables.spacing[2]};
  vertical-align: middle;
`;

const StyledMutedCell = styled(StyledCell)`
  color: ${themeCssVariables.font.color.tertiary};
  white-space: nowrap;
`;

const StyledPersonLink = styled(Link)`
  color: ${themeCssVariables.font.color.primary};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const StyledEmail = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledTimelineCell = styled.td`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[6]};
`;

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
  margin-top: ${themeCssVariables.spacing[2]};
`;

const StyledEmptyState = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  padding: ${themeCssVariables.spacing[6]} 0;
  text-align: center;
`;

type EmailSequenceEnrollmentTableProps = {
  enrollments: EmailSequenceEnrollmentFragmentFragment[];
};

export const EmailSequenceEnrollmentTable = ({
  enrollments,
}: EmailSequenceEnrollmentTableProps) => {
  const { t } = useLingui();
  const theme = useTheme();
  const { stopEmailSequence, isStopping } = useStopEmailSequence();
  const [statusFilter, setStatusFilter] =
    useState<EmailSequenceEnrollmentStatus | null>(null);
  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<
    string | null
  >(null);

  const filteredEnrollments = isDefined(statusFilter)
    ? enrollments.filter((enrollment) => enrollment.status === statusFilter)
    : enrollments;

  const countByStatus = (status: EmailSequenceEnrollmentStatus) =>
    enrollments.filter((enrollment) => enrollment.status === status).length;

  const handleToggleRow = (enrollmentId: string) =>
    setExpandedEnrollmentId((currentId) =>
      currentId === enrollmentId ? null : enrollmentId,
    );

  return (
    <>
      <StyledFilters>
        <StyledFilterButton
          type="button"
          isActive={!isDefined(statusFilter)}
          onClick={() => setStatusFilter(null)}
        >
          {t`All (${enrollments.length})`}
        </StyledFilterButton>
        {EMAIL_SEQUENCE_ENROLLMENT_STATUSES.map((status) => {
          const statusLabel = t(EMAIL_SEQUENCE_STATUS_DISPLAY[status].label);
          const statusCount = countByStatus(status);

          return (
            <StyledFilterButton
              key={status}
              type="button"
              isActive={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {`${statusLabel} (${statusCount})`}
            </StyledFilterButton>
          );
        })}
      </StyledFilters>

      {filteredEnrollments.length === 0 ? (
        <StyledEmptyState>
          {t`No sequences yet. Open a person and use Start Email Sequence.`}
        </StyledEmptyState>
      ) : (
        <StyledTableWrapper>
          <StyledTable>
            <thead>
              <tr>
                <StyledHeaderCell />
                <StyledHeaderCell>{t`Contact`}</StyledHeaderCell>
                <StyledHeaderCell>{t`Company`}</StyledHeaderCell>
                <StyledHeaderCell>{t`Track`}</StyledHeaderCell>
                <StyledHeaderCell>{t`Status`}</StyledHeaderCell>
                <StyledHeaderCell>{t`Progress`}</StyledHeaderCell>
                <StyledHeaderCell>{t`Opens`}</StyledHeaderCell>
                <StyledHeaderCell>{t`Last sent`}</StyledHeaderCell>
                <StyledHeaderCell>{t`Next email`}</StyledHeaderCell>
                <StyledHeaderCell />
              </tr>
            </thead>
            <tbody>
              {filteredEnrollments.map((enrollment) => {
                const isExpanded = expandedEnrollmentId === enrollment.id;
                const statusDisplay =
                  EMAIL_SEQUENCE_STATUS_DISPLAY[
                    enrollment.status as EmailSequenceEnrollmentStatus
                  ];
                const sentCount = enrollment.messages.length;
                const openCount = enrollment.messages.reduce(
                  (total, message) => total + message.openCount,
                  0,
                );
                const ChevronIcon = isExpanded
                  ? IconChevronDown
                  : IconChevronRight;

                return (
                  <Fragment key={enrollment.id}>
                    <StyledRow onClick={() => handleToggleRow(enrollment.id)}>
                      <StyledMutedCell>
                        <ChevronIcon size={theme.icon.size.sm} />
                      </StyledMutedCell>
                      <StyledCell>
                        <StyledPersonLink
                          to={getLinkToShowPage(CoreObjectNameSingular.Person, {
                            id: enrollment.personId,
                          })}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {enrollment.personName}
                        </StyledPersonLink>
                        <StyledEmail>{enrollment.email}</StyledEmail>
                      </StyledCell>
                      <StyledCell>{enrollment.companyName ?? '–'}</StyledCell>
                      <StyledMutedCell>
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
                      </StyledMutedCell>
                      <StyledCell>
                        <Tag color={statusDisplay.color}>
                          {t(statusDisplay.label)}
                        </Tag>
                      </StyledCell>
                      <StyledMutedCell>
                        {t`${sentCount} of ${TOTAL_STAGE_COUNT} sent`}
                      </StyledMutedCell>
                      <StyledMutedCell>{openCount}</StyledMutedCell>
                      <StyledMutedCell>
                        {isDefined(enrollment.lastSentAt)
                          ? beautifyPastDateRelativeToNow(enrollment.lastSentAt)
                          : '–'}
                      </StyledMutedCell>
                      <StyledMutedCell>
                        {enrollment.status === 'ACTIVE' &&
                        isDefined(enrollment.nextSendAt)
                          ? beautifyPastDateRelativeToNow(enrollment.nextSendAt)
                          : '–'}
                      </StyledMutedCell>
                      <StyledCell>
                        {enrollment.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="outline"
                            startIcon={<IconPlayerStop />}
                            disabled={isStopping}
                            onClick={(event) => {
                              event.stopPropagation();
                              stopEmailSequence(enrollment.id);
                            }}
                          >{t`Stop`}</Button>
                        )}
                      </StyledCell>
                    </StyledRow>
                    {isExpanded && (
                      <tr>
                        <StyledTimelineCell colSpan={10}>
                          <EmailSequenceEnrollmentTimeline
                            enrollment={enrollment}
                          />
                          {isNonEmptyString(enrollment.lastError) && (
                            <StyledError>{enrollment.lastError}</StyledError>
                          )}
                        </StyledTimelineCell>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </StyledTable>
        </StyledTableWrapper>
      )}
    </>
  );
};

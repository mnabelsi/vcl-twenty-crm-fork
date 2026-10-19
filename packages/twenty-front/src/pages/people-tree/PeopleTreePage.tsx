import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconRefresh, IconSitemap } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';

import { RecordIndexEmptyStateDisplay } from '@/object-record/record-index/components/RecordIndexEmptyStateDisplay';
import { PeopleTreeFilterBar } from '@/people-tree/components/PeopleTreeFilterBar';
import { PeopleTreeLevelBar } from '@/people-tree/components/PeopleTreeLevelBar';
import { PeopleTreeRecordsLoadEffect } from '@/people-tree/components/PeopleTreeRecordsLoadEffect';
import { PeopleTreeRows } from '@/people-tree/components/PeopleTreeRows';
import { PEOPLE_TREE_AUTO_EXPAND_LIMIT } from '@/people-tree/constants/PeopleTreeAutoExpandLimit';
import { usePeopleTreeData } from '@/people-tree/hooks/usePeopleTreeData';
import { peopleTreeSettingsState } from '@/people-tree/states/peopleTreeSettingsState';
import { filterPeopleTreePeople } from '@/people-tree/utils/filterPeopleTreePeople';
import { isPeopleTreeFilterActive } from '@/people-tree/utils/isPeopleTreeFilterActive';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

const StyledToolbar = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledStatusBar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  min-height: 32px;
  padding: 0 ${themeCssVariables.spacing[3]};
`;

const StyledStatusText = styled.span`
  font-variant-numeric: tabular-nums;
`;

const StyledErrorText = styled.span`
  color: ${themeCssVariables.font.color.danger};
`;

const StyledTreeContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
`;

export const PeopleTreePage = () => {
  const { t } = useLingui();
  const theme = useTheme();
  const {
    people,
    dimensions,
    dimensionsByKey,
    peopleTreeRecords,
    loadPeopleTreeRecords,
  } = usePeopleTreeData();
  const [peopleTreeSettings, setPeopleTreeSettings] = useAtomState(
    peopleTreeSettingsState,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [showAllPaths, setShowAllPaths] = useState<Set<string>>(new Set());

  const levelDimensions = useMemo(
    () =>
      peopleTreeSettings.levels
        .map((level) => dimensionsByKey.get(level))
        .filter(isDefined)
        .filter((dimension) => dimension.isGroupable),
    [peopleTreeSettings.levels, dimensionsByKey],
  );

  const groupableDimensions = useMemo(
    () => dimensions.filter((dimension) => dimension.isGroupable),
    [dimensions],
  );

  const filteredPeople = useMemo(
    () =>
      filterPeopleTreePeople({
        people,
        filters: peopleTreeSettings.filters,
        searchTerm,
      }),
    [people, peopleTreeSettings.filters, searchTerm],
  );

  const hasActiveNarrowing =
    searchTerm.trim().length > 0 ||
    peopleTreeSettings.filters.some(isPeopleTreeFilterActive);
  const isAutoExpanded =
    hasActiveNarrowing &&
    filteredPeople.length <= PEOPLE_TREE_AUTO_EXPAND_LIMIT;

  const { records, totalCount, isLoading, loadedAt, errorMessage } =
    peopleTreeRecords;
  const hasRecords = records.length > 0;

  const resetExpansion = () => {
    setExpandedPaths(new Set());
    setShowAllPaths(new Set());
  };

  const handleToggleGroup = (path: string) => {
    setExpandedPaths((previousPaths) => {
      const nextPaths = new Set(previousPaths);

      if (nextPaths.has(path)) {
        nextPaths.delete(path);
      } else {
        nextPaths.add(path);
      }

      return nextPaths;
    });
  };

  const handleShowAll = (path: string) => {
    setShowAllPaths((previousPaths) => new Set(previousPaths).add(path));
  };

  const loadedCount = people.length.toLocaleString();
  const expectedCount = totalCount.toLocaleString();
  const shownCount = filteredPeople.length.toLocaleString();
  const loadedAtLabel = isDefined(loadedAt)
    ? new Date(loadedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const statusText = isLoading
    ? t`Loading ${loadedCount} of ${expectedCount} people`
    : hasActiveNarrowing
      ? t`${shownCount} of ${loadedCount} people`
      : t`${loadedCount} people`;

  return (
    <>
      <PageTitle title={t`People Tree`} />
      <PeopleTreeRecordsLoadEffect
        hasLoadedOnce={isDefined(loadedAt)}
        isLoading={isLoading}
        onLoad={loadPeopleTreeRecords}
      />
      <PageCardLayout
        header={
          <PageCardHeader
            icon={
              <IconSitemap
                size={theme.icon.size.md}
                stroke={theme.icon.stroke.sm}
              />
            }
            title={t`People Tree`}
            actionButton={
              <Button
                size="sm"
                variant="outline"
                startIcon={<IconRefresh size={14} />}
                loading={isLoading}
                disabled={isLoading}
                onClick={() => loadPeopleTreeRecords()}
              >
                {t`Refresh`}
              </Button>
            }
          />
        }
      >
        <StyledContainer>
          <StyledToolbar>
            <PeopleTreeLevelBar
              levels={levelDimensions.map((dimension) => dimension.key)}
              dimensionsByKey={dimensionsByKey}
              groupableDimensions={groupableDimensions}
              onLevelsChange={(levels) => {
                setPeopleTreeSettings((previous) => ({ ...previous, levels }));
                resetExpansion();
              }}
            />
            <PeopleTreeFilterBar
              filters={peopleTreeSettings.filters}
              dimensions={dimensions}
              dimensionsByKey={dimensionsByKey}
              searchTerm={searchTerm}
              onFiltersChange={(filters) =>
                setPeopleTreeSettings((previous) => ({ ...previous, filters }))
              }
              onSearchTermChange={setSearchTerm}
            />
          </StyledToolbar>
          <StyledStatusBar>
            <StyledStatusText>
              {statusText}
              {!isLoading && isDefined(loadedAtLabel) && (
                <> · {t`updated ${loadedAtLabel}`}</>
              )}
              {isDefined(errorMessage) && (
                <>
                  {' · '}
                  <StyledErrorText>
                    {t`Loading stopped: ${errorMessage}`}
                  </StyledErrorText>
                </>
              )}
            </StyledStatusText>
            {expandedPaths.size > 0 && (
              <Button size="sm" variant="link" onClick={resetExpansion}>
                {t`Collapse all`}
              </Button>
            )}
          </StyledStatusBar>
          <StyledTreeContainer>
            {!hasRecords && isDefined(errorMessage) && (
              <RecordIndexEmptyStateDisplay
                animatedPlaceholderType="errorIndex"
                title={t`Could not load people`}
                subTitle={errorMessage}
                buttonTitle={t`Try again`}
                ButtonIcon={IconRefresh}
                onButtonClick={() => loadPeopleTreeRecords()}
              />
            )}
            {!hasRecords && !isDefined(errorMessage) && !isLoading && (
              <RecordIndexEmptyStateDisplay
                animatedPlaceholderType="noRecord"
                title={t`No people yet`}
                subTitle={t`People you add to the CRM appear here, grouped by city, company and position class.`}
              />
            )}
            {hasRecords && filteredPeople.length === 0 && (
              <RecordIndexEmptyStateDisplay
                animatedPlaceholderType="noMatchRecord"
                title={t`No matches`}
                subTitle={t`No one matches the current search and filters.`}
              />
            )}
            {filteredPeople.length > 0 && (
              <PeopleTreeRows
                people={filteredPeople}
                levelDimensions={levelDimensions}
                expandedPaths={expandedPaths}
                isAutoExpanded={isAutoExpanded}
                showAllPaths={showAllPaths}
                onToggleGroup={handleToggleGroup}
                onShowAll={handleShowAll}
              />
            )}
          </StyledTreeContainer>
        </StyledContainer>
      </PageCardLayout>
    </>
  );
};

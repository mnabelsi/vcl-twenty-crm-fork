import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type ReactNode } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { IconArrowUpRight, IconChevronRight } from 'twenty-ui/icon';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { PEOPLE_TREE_DIMENSION_KEYS } from '@/people-tree/constants/PeopleTreeDimensionKeys';
import { PEOPLE_TREE_NO_TITLE_CLASS } from '@/people-tree/constants/PeopleTreeNoTitleClass';
import { PEOPLE_TREE_OTHER_CLASS } from '@/people-tree/constants/PeopleTreeOtherClass';
import { PEOPLE_TREE_POSITION_CLASSES } from '@/people-tree/constants/PeopleTreePositionClasses';
import { PEOPLE_TREE_PEOPLE_PER_GROUP } from '@/people-tree/constants/PeopleTreePeoplePerGroup';
import { type PeopleTreeDimension } from '@/people-tree/types/PeopleTreeDimension';
import { type PeopleTreeGroup } from '@/people-tree/types/PeopleTreeGroup';
import { type PeopleTreePerson } from '@/people-tree/types/PeopleTreePerson';
import { groupPeopleTreePeople } from '@/people-tree/utils/groupPeopleTreePeople';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';

const INDENT_PER_LEVEL_PX = 20;
const ROW_BASE_PADDING_PX = 12;
const PERSON_EXTRA_INDENT_PX = 22;

const POSITION_CLASS_COLOR_BY_VALUE = new Map(
  PEOPLE_TREE_POSITION_CLASSES.map((positionClass) => [
    positionClass.value,
    positionClass.color ?? 'gray',
  ]),
);

const StyledRow = styled.div<{ indent: number }>`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  min-height: 36px;
  min-width: 0;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
  padding-left: ${({ indent }) => `${indent}px`};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }

  &:focus-visible {
    outline: 1px solid ${themeCssVariables.border.color.blue};
    outline-offset: -1px;
  }
`;

const StyledChevron = styled.span<{ isExpanded: boolean }>`
  color: ${themeCssVariables.font.color.tertiary};
  display: inline-flex;
  flex: none;
  transform: ${({ isExpanded }) => (isExpanded ? 'rotate(90deg)' : 'none')};
  transition: transform 0.15s ease;
`;

const StyledLevelLabel = styled.span`
  color: ${themeCssVariables.font.color.light};
  flex: none;
  font-size: ${themeCssVariables.font.size.xs};
  min-width: 72px;
  text-transform: uppercase;
`;

const StyledGroupLabel = styled.span<{ isTopLevel: boolean }>`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${({ isTopLevel }) =>
    isTopLevel
      ? themeCssVariables.font.weight.semiBold
      : themeCssVariables.font.weight.medium};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledSpacer = styled.span`
  flex: 1 1 auto;
`;

const StyledClassMix = styled.span`
  display: flex;
  flex: none;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex: none;
  font-size: ${themeCssVariables.font.size.sm};
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: right;
`;

const StyledPersonText = styled.span`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
`;

const StyledPersonName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledPersonSubtitle = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledShowAllRow = styled.div<{ indent: number }>`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
  padding-left: ${({ indent }) => `${indent}px`};
`;

type PeopleTreeRowsProps = {
  people: PeopleTreePerson[];
  levelDimensions: PeopleTreeDimension[];
  expandedPaths: Set<string>;
  isAutoExpanded: boolean;
  showAllPaths: Set<string>;
  onToggleGroup: (path: string) => void;
  onShowAll: (path: string) => void;
};

const POSITION_CLASS_ORDER = new Map(
  PEOPLE_TREE_POSITION_CLASSES.map((positionClass, index) => [
    positionClass.value,
    index,
  ]),
);

const comparePeople = (personA: PeopleTreePerson, personB: PeopleTreePerson) =>
  (POSITION_CLASS_ORDER.get(personA.positionClass) ?? 0) -
    (POSITION_CLASS_ORDER.get(personB.positionClass) ?? 0) ||
  personA.name.localeCompare(personB.name);

export const PeopleTreeRows = ({
  people,
  levelDimensions,
  expandedPaths,
  isAutoExpanded,
  showAllPaths,
  onToggleGroup,
  onShowAll,
}: PeopleTreeRowsProps) => {
  const { t } = useLingui();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const isPositionClassALevel = levelDimensions.some(
    (dimension) => dimension.key === PEOPLE_TREE_DIMENSION_KEYS.positionClass,
  );
  const isCompanyALevel = levelDimensions.some(
    (dimension) => dimension.key === PEOPLE_TREE_DIMENSION_KEYS.company,
  );

  const getGroupMeta = (group: PeopleTreeGroup) => {
    const firstPerson = group.people[0];

    if (group.isEmptyValue || !isDefined(firstPerson)) {
      return null;
    }

    if (group.dimensionKey === PEOPLE_TREE_DIMENSION_KEYS.company) {
      return [
        ...(firstPerson.valuesByDimensionKey[PEOPLE_TREE_DIMENSION_KEYS.city] ??
          []),
        ...(firstPerson.valuesByDimensionKey[
          PEOPLE_TREE_DIMENSION_KEYS.country
        ] ?? []),
      ].join(', ');
    }

    if (group.dimensionKey === PEOPLE_TREE_DIMENSION_KEYS.city) {
      return (
        firstPerson.valuesByDimensionKey[PEOPLE_TREE_DIMENSION_KEYS.country] ??
        []
      ).join(', ');
    }

    return null;
  };

  const renderClassMix = (groupPeople: PeopleTreePerson[]) => {
    if (isPositionClassALevel) {
      return null;
    }

    const countByClass = new Map<string, number>();

    for (const person of groupPeople) {
      countByClass.set(
        person.positionClass,
        (countByClass.get(person.positionClass) ?? 0) + 1,
      );
    }

    return (
      <StyledClassMix>
        {PEOPLE_TREE_POSITION_CLASSES.filter(
          (positionClass) =>
            positionClass.value !== PEOPLE_TREE_OTHER_CLASS &&
            positionClass.value !== PEOPLE_TREE_NO_TITLE_CLASS &&
            (countByClass.get(positionClass.value) ?? 0) > 0,
        ).map((positionClass) => (
          <Tag
            key={positionClass.value}
            color={positionClass.color ?? 'gray'}
          >{`${positionClass.label} ${countByClass.get(positionClass.value)}`}</Tag>
        ))}
      </StyledClassMix>
    );
  };

  const renderPeople = (
    groupPeople: PeopleTreePerson[],
    path: string,
    depth: number,
    rows: ReactNode[],
  ) => {
    const indent =
      ROW_BASE_PADDING_PX +
      depth * INDENT_PER_LEVEL_PX +
      PERSON_EXTRA_INDENT_PX;
    const sortedPeople = [...groupPeople].sort(comparePeople);
    const isShowingAll = showAllPaths.has(path);
    const shownPeople = isShowingAll
      ? sortedPeople
      : sortedPeople.slice(0, PEOPLE_TREE_PEOPLE_PER_GROUP);

    for (const person of shownPeople) {
      const subtitle = [
        person.jobTitle || t`No job title`,
        isCompanyALevel ? null : person.companyName,
      ]
        .filter(isDefined)
        .join(' · ');

      rows.push(
        <StyledRow
          key={`${path}#${person.id}`}
          role="treeitem"
          tabIndex={0}
          indent={indent}
          onClick={() =>
            openRecordInSidePanel({
              recordId: person.id,
              objectNameSingular: CoreObjectNameSingular.Person,
            })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              openRecordInSidePanel({
                recordId: person.id,
                objectNameSingular: CoreObjectNameSingular.Person,
              });
            }
          }}
        >
          <StyledPersonText>
            <StyledPersonName>{person.name || t`Unnamed`}</StyledPersonName>
            <StyledPersonSubtitle>{subtitle}</StyledPersonSubtitle>
          </StyledPersonText>
          <Tag
            color={
              POSITION_CLASS_COLOR_BY_VALUE.get(person.positionClass) ?? 'gray'
            }
          >
            {person.positionClass}
          </Tag>
        </StyledRow>,
      );
    }

    if (!isShowingAll && sortedPeople.length > shownPeople.length) {
      const remainingCount = sortedPeople.length.toLocaleString();

      rows.push(
        <StyledShowAllRow key={`${path}#show-all`} indent={indent}>
          <Button size="sm" variant="link" onClick={() => onShowAll(path)}>
            {t`Show all ${remainingCount} people`}
          </Button>
        </StyledShowAllRow>,
      );
    }
  };

  const renderLevel = (
    groupPeople: PeopleTreePerson[],
    parentPath: string,
    depth: number,
    rows: ReactNode[],
  ) => {
    const dimension = levelDimensions[depth];

    if (!isDefined(dimension)) {
      renderPeople(groupPeople, parentPath, depth, rows);

      return;
    }

    const groups = groupPeopleTreePeople({
      people: groupPeople,
      dimension,
      parentPath,
    });

    for (const group of groups) {
      const isExpanded = isAutoExpanded || expandedPaths.has(group.path);
      const groupMeta = getGroupMeta(group);
      const companyId =
        group.dimensionKey === PEOPLE_TREE_DIMENSION_KEYS.company
          ? group.value
          : null;

      rows.push(
        <StyledRow
          key={group.path}
          role="treeitem"
          aria-expanded={isExpanded}
          tabIndex={0}
          indent={ROW_BASE_PADDING_PX + depth * INDENT_PER_LEVEL_PX}
          onClick={() => onToggleGroup(group.path)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggleGroup(group.path);
            }
          }}
        >
          <StyledChevron isExpanded={isExpanded}>
            <IconChevronRight size={14} />
          </StyledChevron>
          <StyledLevelLabel>{dimension.label}</StyledLevelLabel>
          {isDefined(group.option.color) ? (
            <Tag color={group.option.color}>{group.option.label}</Tag>
          ) : (
            <StyledGroupLabel isTopLevel={depth === 0}>
              {group.option.label}
            </StyledGroupLabel>
          )}
          {isDefined(groupMeta) && <StyledMeta>{groupMeta}</StyledMeta>}
          <StyledSpacer />
          {renderClassMix(group.people)}
          {isDefined(companyId) && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t`Open company`}
              startIcon={<IconArrowUpRight size={14} />}
              onClick={(event) => {
                event.stopPropagation();
                openRecordInSidePanel({
                  recordId: companyId,
                  objectNameSingular: CoreObjectNameSingular.Company,
                });
              }}
            />
          )}
          <StyledCount>{group.people.length.toLocaleString()}</StyledCount>
        </StyledRow>,
      );

      if (isExpanded) {
        renderLevel(group.people, group.path, depth + 1, rows);
      }
    }
  };

  const rows: ReactNode[] = [];

  renderLevel(people, '', 0, rows);

  return <div role="tree">{rows}</div>;
};

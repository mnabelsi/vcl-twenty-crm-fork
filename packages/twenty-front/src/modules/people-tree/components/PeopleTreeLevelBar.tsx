import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { Dropdown } from 'twenty-ui/components/navigation';
import {
  IconChevronDown,
  IconChevronRight,
  IconLayoutList,
  IconPlus,
  IconTrash,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { PeopleTreeDimensionDropdown } from '@/people-tree/components/PeopleTreeDimensionDropdown';
import { PEOPLE_TREE_MAX_LEVELS } from '@/people-tree/constants/PeopleTreeMaxLevels';
import { type PeopleTreeDimension } from '@/people-tree/types/PeopleTreeDimension';

const StyledLevelBar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledLabel = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  margin-right: ${themeCssVariables.spacing[1]};
`;

const StyledSeparator = styled.span`
  color: ${themeCssVariables.font.color.light};
  display: inline-flex;
`;

type PeopleTreeLevelBarProps = {
  levels: string[];
  dimensionsByKey: Map<string, PeopleTreeDimension>;
  groupableDimensions: PeopleTreeDimension[];
  onLevelsChange: (levels: string[]) => void;
};

export const PeopleTreeLevelBar = ({
  levels,
  dimensionsByKey,
  groupableDimensions,
  onLevelsChange,
}: PeopleTreeLevelBarProps) => {
  const { t } = useLingui();

  const replaceLevel = (levelIndex: number, dimensionKey: string) => {
    const nextLevels = levels.map((level, index) =>
      index === levelIndex ? dimensionKey : level,
    );

    onLevelsChange(
      nextLevels.filter(
        (level, index) => index === levelIndex || level !== dimensionKey,
      ),
    );
  };

  const removeLevel = (levelIndex: number) => {
    onLevelsChange(levels.filter((_level, index) => index !== levelIndex));
  };

  const unusedDimensions = groupableDimensions.filter(
    (dimension) => !levels.includes(dimension.key),
  );

  return (
    <StyledLevelBar>
      <StyledLabel>
        <IconLayoutList size={14} />
        {t`Group by`}
      </StyledLabel>
      {levels.map((level, levelIndex) => {
        const dimension = dimensionsByKey.get(level);

        if (!isDefined(dimension)) {
          return null;
        }

        return (
          <StyledLevelBar key={level}>
            {levelIndex > 0 && (
              <StyledSeparator>
                <IconChevronRight size={14} />
              </StyledSeparator>
            )}
            <PeopleTreeDimensionDropdown
              ariaLabel={t`Change grouping level`}
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  endIcon={<IconChevronDown size={14} />}
                >
                  {dimension.label}
                </Button>
              }
              dimensions={groupableDimensions}
              selectedDimensionKey={level}
              onSelectDimension={(dimensionKey) =>
                replaceLevel(levelIndex, dimensionKey)
              }
              footer={
                levels.length > 1 && (
                  <>
                    <Dropdown.Separator />
                    <Dropdown.Section>
                      <Dropdown.ActionItem
                        color="danger"
                        startIcon={<IconTrash size={16} />}
                        onClick={() => removeLevel(levelIndex)}
                      >
                        {t`Remove level`}
                      </Dropdown.ActionItem>
                    </Dropdown.Section>
                  </>
                )
              }
            />
          </StyledLevelBar>
        );
      })}
      {levels.length < PEOPLE_TREE_MAX_LEVELS &&
        unusedDimensions.length > 0 && (
          <PeopleTreeDimensionDropdown
            ariaLabel={t`Add grouping level`}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                startIcon={<IconPlus size={14} />}
              >
                {t`Add level`}
              </Button>
            }
            dimensions={unusedDimensions}
            onSelectDimension={(dimensionKey) =>
              onLevelsChange([...levels, dimensionKey])
            }
          />
        )}
    </StyledLevelBar>
  );
};

import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Dropdown } from 'twenty-ui/components/navigation';
import { IconTrash, IconX } from 'twenty-ui/icon';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button, Input } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { type PeopleTreeDimension } from '@/people-tree/types/PeopleTreeDimension';
import {
  type PeopleTreeFilter,
  type PeopleTreeFilterOperand,
} from '@/people-tree/types/PeopleTreeFilter';
import { isPeopleTreeFilterActive } from '@/people-tree/utils/isPeopleTreeFilterActive';

const MAX_VALUES_IN_LIST = 200;
const MAX_VALUES_IN_CHIP = 2;

const StyledChip = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: inline-flex;
  max-width: 360px;
  min-width: 0;
`;

const StyledTextInputContainer = styled.div`
  padding: ${themeCssVariables.spacing[2]};
`;

type PeopleTreeFilterChipProps = {
  filter: PeopleTreeFilter;
  dimension: PeopleTreeDimension;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onChange: (filter: PeopleTreeFilter) => void;
  onRemove: () => void;
};

export const PeopleTreeFilterChip = ({
  filter,
  dimension,
  isOpen,
  onOpenChange,
  onChange,
  onRemove,
}: PeopleTreeFilterChipProps) => {
  const { t } = useLingui();
  const [searchValue, setSearchValue] = useState('');

  const operandLabels: Record<PeopleTreeFilterOperand, string> = {
    isAnyOf: t`is`,
    isNoneOf: t`is not`,
    contains: t`contains`,
    doesNotContain: t`does not contain`,
    isEmpty: t`is empty`,
    isNotEmpty: t`is not empty`,
  };

  const operands: PeopleTreeFilterOperand[] =
    dimension.kind === 'text'
      ? ['contains', 'doesNotContain', 'isEmpty', 'isNotEmpty']
      : ['isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'];

  const needsValues =
    filter.operand === 'isAnyOf' || filter.operand === 'isNoneOf';
  const needsText =
    filter.operand === 'contains' || filter.operand === 'doesNotContain';

  const optionLabelByValue = new Map(
    dimension.options.map((option) => [option.value, option.label]),
  );

  const getChipSummary = () => {
    if (!isPeopleTreeFilterActive(filter)) {
      return t`any`;
    }

    if (needsText) {
      return `${operandLabels[filter.operand]} "${filter.text.trim()}"`;
    }

    if (!needsValues) {
      return operandLabels[filter.operand];
    }

    const valueLabels = filter.values.map(
      (value) => optionLabelByValue.get(value) ?? value,
    );
    const shownLabels = valueLabels.slice(0, MAX_VALUES_IN_CHIP).join(', ');
    const hiddenCount = valueLabels.length - MAX_VALUES_IN_CHIP;
    const valueSummary =
      hiddenCount > 0 ? `${shownLabels} +${hiddenCount}` : shownLabels;

    return filter.operand === 'isNoneOf'
      ? `${operandLabels.isNoneOf} ${valueSummary}`
      : valueSummary;
  };

  const normalizedSearch = searchValue.trim().toLowerCase();
  const matchingOptions = dimension.options.filter((option) =>
    option.label.toLowerCase().includes(normalizedSearch),
  );
  const selectedOptions = matchingOptions.filter((option) =>
    filter.values.includes(option.value),
  );
  const unselectedOptions = matchingOptions
    .filter((option) => !filter.values.includes(option.value))
    .slice(0, MAX_VALUES_IN_LIST);

  const toggleValue = (value: string) => {
    onChange({
      ...filter,
      values: filter.values.includes(value)
        ? filter.values.filter((selectedValue) => selectedValue !== value)
        : [...filter.values, value],
    });
  };

  return (
    <StyledChip>
      <Dropdown.Root
        type="picker"
        multiple
        open={isOpen}
        onOpenChange={(nextIsOpen) => {
          if (!nextIsOpen) {
            setSearchValue('');
          }
          onOpenChange(nextIsOpen);
        }}
      >
        <Dropdown.Trigger
          render={
            <Button size="sm" variant="ghost">
              {`${dimension.label}: ${getChipSummary()}`}
            </Button>
          }
        />
        <Dropdown.Content aria-label={t`Edit filter`} width={280}>
          <Dropdown.Section label={dimension.label}>
            {operands.map((operand) => (
              <Dropdown.OptionItem
                key={operand}
                selected={filter.operand === operand}
                indicator="check"
                closeOnSelect={false}
                onSelect={() => onChange({ ...filter, operand })}
              >
                {operandLabels[operand]}
              </Dropdown.OptionItem>
            ))}
          </Dropdown.Section>
          {needsText && (
            <>
              <Dropdown.Separator />
              <StyledTextInputContainer>
                <Input
                  aria-label={t`Filter text`}
                  placeholder={t`Type text`}
                  value={filter.text}
                  onChange={(event) =>
                    onChange({ ...filter, text: event.target.value })
                  }
                />
              </StyledTextInputContainer>
            </>
          )}
          {needsValues && (
            <>
              <Dropdown.Separator />
              <Dropdown.Search
                aria-label={t`Search values`}
                placeholder={t`Search values`}
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <Dropdown.Section scrollable>
                {[...selectedOptions, ...unselectedOptions].map((option) => (
                  <Dropdown.OptionItem
                    key={option.value}
                    selected={filter.values.includes(option.value)}
                    indicator="checkbox"
                    closeOnSelect={false}
                    onSelect={() => toggleValue(option.value)}
                  >
                    {isDefined(option.color) ? (
                      <Tag color={option.color}>{option.label}</Tag>
                    ) : (
                      option.label
                    )}
                  </Dropdown.OptionItem>
                ))}
                {matchingOptions.length === 0 && (
                  <Dropdown.Empty>{t`No values found`}</Dropdown.Empty>
                )}
              </Dropdown.Section>
            </>
          )}
          <Dropdown.Separator />
          <Dropdown.Section>
            <Dropdown.ActionItem
              color="danger"
              startIcon={<IconTrash size={16} />}
              onClick={onRemove}
            >
              {t`Remove filter`}
            </Dropdown.ActionItem>
          </Dropdown.Section>
        </Dropdown.Content>
      </Dropdown.Root>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t`Remove filter`}
        startIcon={<IconX size={14} />}
        onClick={onRemove}
      />
    </StyledChip>
  );
};

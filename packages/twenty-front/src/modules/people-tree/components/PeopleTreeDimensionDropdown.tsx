import { useLingui } from '@lingui/react/macro';
import { type ReactElement, type ReactNode, useState } from 'react';
import { Dropdown } from 'twenty-ui/components/navigation';

import { type PeopleTreeDimension } from '@/people-tree/types/PeopleTreeDimension';

type PeopleTreeDimensionDropdownProps = {
  trigger: ReactElement;
  ariaLabel: string;
  dimensions: PeopleTreeDimension[];
  selectedDimensionKey?: string;
  onSelectDimension: (dimensionKey: string) => void;
  footer?: ReactNode;
};

export const PeopleTreeDimensionDropdown = ({
  trigger,
  ariaLabel,
  dimensions,
  selectedDimensionKey,
  onSelectDimension,
  footer,
}: PeopleTreeDimensionDropdownProps) => {
  const { t } = useLingui();
  const [searchValue, setSearchValue] = useState('');

  const visibleDimensions = dimensions.filter((dimension) =>
    dimension.label.toLowerCase().includes(searchValue.trim().toLowerCase()),
  );

  return (
    <Dropdown.Root
      type="picker"
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSearchValue('');
        }
      }}
    >
      <Dropdown.Trigger render={trigger} />
      <Dropdown.Content aria-label={ariaLabel} width={240}>
        <Dropdown.Search
          aria-label={t`Search fields`}
          placeholder={t`Search fields`}
          value={searchValue}
          onValueChange={setSearchValue}
        />
        <Dropdown.Section scrollable>
          {visibleDimensions.map((dimension) => (
            <Dropdown.OptionItem
              key={dimension.key}
              selected={dimension.key === selectedDimensionKey}
              indicator="check"
              closeOnSelect
              onSelect={() => onSelectDimension(dimension.key)}
            >
              {dimension.label}
            </Dropdown.OptionItem>
          ))}
          {visibleDimensions.length === 0 && (
            <Dropdown.Empty>{t`No fields found`}</Dropdown.Empty>
          )}
        </Dropdown.Section>
        {footer}
      </Dropdown.Content>
    </Dropdown.Root>
  );
};

import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconFilter, IconSearch } from 'twenty-ui/icon';
import { Button, Input } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';
import { v4 } from 'uuid';

import { PeopleTreeDimensionDropdown } from '@/people-tree/components/PeopleTreeDimensionDropdown';
import { PeopleTreeFilterChip } from '@/people-tree/components/PeopleTreeFilterChip';
import { type PeopleTreeDimension } from '@/people-tree/types/PeopleTreeDimension';
import { type PeopleTreeFilter } from '@/people-tree/types/PeopleTreeFilter';

const StyledFilterBar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSearch = styled.div`
  align-items: center;
  display: flex;
  flex: 1 1 220px;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
  margin-left: auto;
  max-width: 320px;
  min-width: 0;
`;

type PeopleTreeFilterBarProps = {
  filters: PeopleTreeFilter[];
  dimensions: PeopleTreeDimension[];
  dimensionsByKey: Map<string, PeopleTreeDimension>;
  searchTerm: string;
  onFiltersChange: (filters: PeopleTreeFilter[]) => void;
  onSearchTermChange: (searchTerm: string) => void;
};

export const PeopleTreeFilterBar = ({
  filters,
  dimensions,
  dimensionsByKey,
  searchTerm,
  onFiltersChange,
  onSearchTermChange,
}: PeopleTreeFilterBarProps) => {
  const { t } = useLingui();
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  const addFilter = (dimensionKey: string) => {
    const dimension = dimensionsByKey.get(dimensionKey);

    if (!isDefined(dimension)) {
      return;
    }

    const newFilter: PeopleTreeFilter = {
      id: v4(),
      dimensionKey,
      operand: dimension.kind === 'text' ? 'contains' : 'isAnyOf',
      values: [],
      text: '',
    };

    onFiltersChange([...filters, newFilter]);
    // Let the field picker finish closing before the new filter's editor opens.
    window.setTimeout(() => setOpenFilterId(newFilter.id), 0);
  };

  const updateFilter = (updatedFilter: PeopleTreeFilter) => {
    onFiltersChange(
      filters.map((filter) =>
        filter.id === updatedFilter.id ? updatedFilter : filter,
      ),
    );
  };

  const removeFilter = (filterId: string) => {
    onFiltersChange(filters.filter((filter) => filter.id !== filterId));
  };

  return (
    <StyledFilterBar>
      {filters.map((filter) => {
        const dimension = dimensionsByKey.get(filter.dimensionKey);

        if (!isDefined(dimension)) {
          return null;
        }

        return (
          <PeopleTreeFilterChip
            key={filter.id}
            filter={filter}
            dimension={dimension}
            isOpen={openFilterId === filter.id}
            onOpenChange={(isOpen) =>
              setOpenFilterId(isOpen ? filter.id : null)
            }
            onChange={updateFilter}
            onRemove={() => removeFilter(filter.id)}
          />
        );
      })}
      <PeopleTreeDimensionDropdown
        ariaLabel={t`Add filter`}
        trigger={
          <Button
            size="sm"
            variant="ghost"
            startIcon={<IconFilter size={14} />}
          >
            {t`Filter`}
          </Button>
        }
        dimensions={dimensions}
        onSelectDimension={addFilter}
      />
      {filters.length > 0 && (
        <Button size="sm" variant="link" onClick={() => onFiltersChange([])}>
          {t`Clear filters`}
        </Button>
      )}
      <StyledSearch>
        <IconSearch size={16} />
        <Input
          aria-label={t`Search people`}
          placeholder={t`Search name, title, company or city`}
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
        />
      </StyledSearch>
    </StyledFilterBar>
  );
};

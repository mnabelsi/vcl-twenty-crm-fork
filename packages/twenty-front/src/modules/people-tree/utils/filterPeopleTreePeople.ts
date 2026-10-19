import { type PeopleTreeFilter } from '@/people-tree/types/PeopleTreeFilter';
import { type PeopleTreePerson } from '@/people-tree/types/PeopleTreePerson';
import { isPeopleTreeFilterActive } from '@/people-tree/utils/isPeopleTreeFilterActive';

const matchesFilter = (person: PeopleTreePerson, filter: PeopleTreeFilter) => {
  const values = person.valuesByDimensionKey[filter.dimensionKey] ?? [];
  const searchedText = filter.text.trim().toLowerCase();

  switch (filter.operand) {
    case 'isEmpty':
      return values.length === 0;
    case 'isNotEmpty':
      return values.length > 0;
    case 'isAnyOf':
      return values.some((value) => filter.values.includes(value));
    case 'isNoneOf':
      return !values.some((value) => filter.values.includes(value));
    case 'contains':
      return values.some((value) => value.toLowerCase().includes(searchedText));
    case 'doesNotContain':
      return !values.some((value) =>
        value.toLowerCase().includes(searchedText),
      );
  }
};

export const filterPeopleTreePeople = ({
  people,
  filters,
  searchTerm,
}: {
  people: PeopleTreePerson[];
  filters: PeopleTreeFilter[];
  searchTerm: string;
}) => {
  const activeFilters = filters.filter(isPeopleTreeFilterActive);
  const searchWords = searchTerm
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (activeFilters.length === 0 && searchWords.length === 0) {
    return people;
  }

  return people.filter(
    (person) =>
      searchWords.every((word) => person.searchText.includes(word)) &&
      activeFilters.every((filter) => matchesFilter(person, filter)),
  );
};

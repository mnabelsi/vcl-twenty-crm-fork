import { type PeopleTreeDimension } from '@/people-tree/types/PeopleTreeDimension';
import { type PeopleTreePerson } from '@/people-tree/types/PeopleTreePerson';
import { filterPeopleTreePeople } from '@/people-tree/utils/filterPeopleTreePeople';
import { groupPeopleTreePeople } from '@/people-tree/utils/groupPeopleTreePeople';

const buildPerson = (
  id: string,
  valuesByDimensionKey: Record<string, string[]>,
): PeopleTreePerson => ({
  id,
  name: `Person ${id}`,
  jobTitle: valuesByDimensionKey.jobTitle?.[0] ?? '',
  companyId: null,
  companyName: null,
  positionClass: valuesByDimensionKey.positionClass?.[0] ?? 'No title',
  valuesByDimensionKey,
  searchText: `person ${id}`,
});

const PEOPLE = [
  buildPerson('1', { city: ['Riyadh'], tags: ['KSA', 'COMPETITOR'] }),
  buildPerson('2', { city: ['Riyadh'], tags: ['KSA'] }),
  buildPerson('3', { city: ['Dubai'], tags: [] }),
  buildPerson('4', { city: [], tags: ['UAE'] }),
];

const CITY_DIMENSION: PeopleTreeDimension = {
  key: 'city',
  label: 'City',
  kind: 'option',
  isGroupable: true,
  emptyLabel: 'City not set',
  hasFixedOptionOrder: false,
  options: [
    { value: 'Dubai', label: 'Dubai' },
    { value: 'Riyadh', label: 'Riyadh' },
  ],
};

const TAGS_DIMENSION: PeopleTreeDimension = {
  key: 'tags',
  label: 'Tags',
  kind: 'option',
  isGroupable: true,
  emptyLabel: 'No Tags',
  hasFixedOptionOrder: true,
  options: [
    { value: 'UAE', label: 'UAE' },
    { value: 'KSA', label: 'KSA' },
    { value: 'COMPETITOR', label: 'Competitor' },
  ],
};

describe('groupPeopleTreePeople', () => {
  it('sorts groups by size and puts the empty group last', () => {
    const groups = groupPeopleTreePeople({
      people: PEOPLE,
      dimension: CITY_DIMENSION,
      parentPath: '',
    });

    expect(groups.map((group) => group.option.label)).toEqual([
      'Riyadh',
      'Dubai',
      'City not set',
    ]);
    expect(groups.map((group) => group.people.length)).toEqual([2, 1, 1]);
  });

  it('keeps option order for fixed dimensions and counts multi-values in each group', () => {
    const groups = groupPeopleTreePeople({
      people: PEOPLE,
      dimension: TAGS_DIMENSION,
      parentPath: '',
    });

    expect(groups.map((group) => group.option.label)).toEqual([
      'UAE',
      'KSA',
      'Competitor',
      'No Tags',
    ]);
    expect(groups.map((group) => group.people.length)).toEqual([1, 2, 1, 1]);
  });
});

describe('filterPeopleTreePeople', () => {
  it('combines several filters with AND', () => {
    const result = filterPeopleTreePeople({
      people: PEOPLE,
      searchTerm: '',
      filters: [
        {
          id: 'a',
          dimensionKey: 'city',
          operand: 'isAnyOf',
          values: ['Riyadh'],
          text: '',
        },
        {
          id: 'b',
          dimensionKey: 'tags',
          operand: 'isNoneOf',
          values: ['COMPETITOR'],
          text: '',
        },
      ],
    });

    expect(result.map((person) => person.id)).toEqual(['2']);
  });

  it('ignores filters that have no value yet', () => {
    const result = filterPeopleTreePeople({
      people: PEOPLE,
      searchTerm: '',
      filters: [
        {
          id: 'a',
          dimensionKey: 'city',
          operand: 'isAnyOf',
          values: [],
          text: '',
        },
      ],
    });

    expect(result).toHaveLength(PEOPLE.length);
  });

  it('supports empty checks and search', () => {
    expect(
      filterPeopleTreePeople({
        people: PEOPLE,
        searchTerm: 'person 4',
        filters: [
          {
            id: 'a',
            dimensionKey: 'city',
            operand: 'isEmpty',
            values: [],
            text: '',
          },
        ],
      }).map((person) => person.id),
    ).toEqual(['4']);
  });
});

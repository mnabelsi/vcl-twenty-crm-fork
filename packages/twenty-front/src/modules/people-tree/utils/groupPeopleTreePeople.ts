import { isDefined } from 'twenty-shared/utils';

import { type PeopleTreeDimension } from '@/people-tree/types/PeopleTreeDimension';
import { type PeopleTreeGroup } from '@/people-tree/types/PeopleTreeGroup';
import { type PeopleTreePerson } from '@/people-tree/types/PeopleTreePerson';

const EMPTY_GROUP_KEY = '__empty__';

// Multi-select values place a person in every matching group, so child counts can add up to more than the parent.
export const groupPeopleTreePeople = ({
  people,
  dimension,
  parentPath,
}: {
  people: PeopleTreePerson[];
  dimension: PeopleTreeDimension;
  parentPath: string;
}): PeopleTreeGroup[] => {
  const optionIndexByValue = new Map(
    dimension.options.map((option, index) => [option.value, index]),
  );
  const groupsByKey = new Map<string, PeopleTreeGroup>();

  for (const person of people) {
    const values = person.valuesByDimensionKey[dimension.key] ?? [];
    const groupValues: (string | null)[] =
      values.length > 0 ? [...new Set(values)] : [null];

    for (const value of groupValues) {
      const groupKey = value ?? EMPTY_GROUP_KEY;
      let group = groupsByKey.get(groupKey);

      if (!isDefined(group)) {
        const optionIndex = isDefined(value)
          ? optionIndexByValue.get(value)
          : undefined;

        group = {
          path: `${parentPath}|${dimension.key}=${groupKey}`,
          dimensionKey: dimension.key,
          value,
          option: isDefined(optionIndex)
            ? dimension.options[optionIndex]
            : { value: value ?? '', label: value ?? dimension.emptyLabel },
          isEmptyValue: !isDefined(value),
          people: [],
        };
        groupsByKey.set(groupKey, group);
      }

      group.people.push(person);
    }
  }

  const getOptionIndex = (group: PeopleTreeGroup) =>
    optionIndexByValue.get(group.value ?? '') ?? Number.MAX_SAFE_INTEGER;

  return [...groupsByKey.values()].sort((groupA, groupB) => {
    if (groupA.isEmptyValue !== groupB.isEmptyValue) {
      return groupA.isEmptyValue ? 1 : -1;
    }

    if (dimension.hasFixedOptionOrder) {
      return getOptionIndex(groupA) - getOptionIndex(groupB);
    }

    return (
      groupB.people.length - groupA.people.length ||
      groupA.option.label.localeCompare(groupB.option.label)
    );
  });
};

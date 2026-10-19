import { isNonEmptyString } from '@sniptt/guards';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { type PeopleTreeFilter } from '@/people-tree/types/PeopleTreeFilter';

export const isPeopleTreeFilterActive = (filter: PeopleTreeFilter) => {
  switch (filter.operand) {
    case 'isEmpty':
    case 'isNotEmpty':
      return true;
    case 'isAnyOf':
    case 'isNoneOf':
      return isNonEmptyArray(filter.values);
    case 'contains':
    case 'doesNotContain':
      return isNonEmptyString(filter.text.trim());
  }
};

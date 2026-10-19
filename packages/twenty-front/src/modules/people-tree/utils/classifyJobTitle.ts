import { isNonEmptyString } from '@sniptt/guards';

import { PEOPLE_TREE_NO_TITLE_CLASS } from '@/people-tree/constants/PeopleTreeNoTitleClass';
import { PEOPLE_TREE_OTHER_CLASS } from '@/people-tree/constants/PeopleTreeOtherClass';
import { PEOPLE_TREE_POSITION_CLASS_RULES } from '@/people-tree/constants/PeopleTreePositionClassRules';

export const classifyJobTitle = (jobTitle: string | null | undefined) => {
  const trimmedJobTitle = jobTitle?.trim();

  if (!isNonEmptyString(trimmedJobTitle)) {
    return PEOPLE_TREE_NO_TITLE_CLASS;
  }

  const matchingRule = PEOPLE_TREE_POSITION_CLASS_RULES.find(({ pattern }) =>
    pattern.test(trimmedJobTitle),
  );

  return matchingRule?.positionClass ?? PEOPLE_TREE_OTHER_CLASS;
};

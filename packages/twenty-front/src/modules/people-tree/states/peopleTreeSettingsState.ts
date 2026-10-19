import { PEOPLE_TREE_DIMENSION_KEYS } from '@/people-tree/constants/PeopleTreeDimensionKeys';
import { type PeopleTreeFilter } from '@/people-tree/types/PeopleTreeFilter';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type PeopleTreeSettings = {
  levels: string[];
  filters: PeopleTreeFilter[];
};

export const peopleTreeSettingsState = createAtomState<PeopleTreeSettings>({
  key: 'peopleTreeSettingsState',
  defaultValue: {
    levels: [
      PEOPLE_TREE_DIMENSION_KEYS.city,
      PEOPLE_TREE_DIMENSION_KEYS.company,
      PEOPLE_TREE_DIMENSION_KEYS.positionClass,
    ],
    filters: [],
  },
  useLocalStorage: true,
  localStorageOptions: { getOnInit: true },
  validateInitFn: (settings) =>
    Array.isArray(settings.levels) && Array.isArray(settings.filters),
});

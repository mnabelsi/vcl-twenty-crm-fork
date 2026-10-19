import { type PeopleTreeDimensionOption } from '@/people-tree/types/PeopleTreeDimensionOption';

export type PeopleTreeDimension = {
  key: string;
  label: string;
  kind: 'option' | 'text';
  isGroupable: boolean;
  emptyLabel: string;
  // Metadata-backed select fields keep their configured option order; other dimensions sort by group size.
  hasFixedOptionOrder: boolean;
  options: PeopleTreeDimensionOption[];
};

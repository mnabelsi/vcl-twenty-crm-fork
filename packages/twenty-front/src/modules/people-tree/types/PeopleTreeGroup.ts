import { type PeopleTreeDimensionOption } from '@/people-tree/types/PeopleTreeDimensionOption';
import { type PeopleTreePerson } from '@/people-tree/types/PeopleTreePerson';

export type PeopleTreeGroup = {
  path: string;
  dimensionKey: string;
  value: string | null;
  option: PeopleTreeDimensionOption;
  isEmptyValue: boolean;
  people: PeopleTreePerson[];
};

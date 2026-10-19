export type PeopleTreeFilterOperand =
  | 'isAnyOf'
  | 'isNoneOf'
  | 'contains'
  | 'doesNotContain'
  | 'isEmpty'
  | 'isNotEmpty';

export type PeopleTreeFilter = {
  id: string;
  dimensionKey: string;
  operand: PeopleTreeFilterOperand;
  values: string[];
  text: string;
};

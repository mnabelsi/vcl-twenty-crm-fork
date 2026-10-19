export type PeopleTreePerson = {
  id: string;
  name: string;
  jobTitle: string;
  companyId: string | null;
  companyName: string | null;
  positionClass: string;
  valuesByDimensionKey: Record<string, string[]>;
  searchText: string;
};

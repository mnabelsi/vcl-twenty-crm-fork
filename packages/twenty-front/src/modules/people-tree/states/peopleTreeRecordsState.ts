import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type PeopleTreeRecords = {
  records: ObjectRecord[];
  totalCount: number;
  isLoading: boolean;
  loadedAt: number | null;
  errorMessage: string | null;
};

export const peopleTreeRecordsState = createAtomState<PeopleTreeRecords>({
  key: 'peopleTreeRecordsState',
  defaultValue: {
    records: [],
    totalCount: 0,
    isLoading: false,
    loadedAt: null,
    errorMessage: null,
  },
});

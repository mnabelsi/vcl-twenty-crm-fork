import { useCallback } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { type RecordGqlOperationFindManyResult } from '@/object-record/graphql/types/RecordGqlOperationFindManyResult';
import { useFindManyRecordsQuery } from '@/object-record/hooks/useFindManyRecordsQuery';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { PEOPLE_TREE_PAGE_SIZE } from '@/people-tree/constants/PeopleTreePageSize';
import { PEOPLE_TREE_PARALLEL_REQUESTS } from '@/people-tree/constants/PeopleTreeParallelRequests';
import { usePeopleTreeFieldDefinitions } from '@/people-tree/hooks/usePeopleTreeFieldDefinitions';
import { peopleTreeRecordsState } from '@/people-tree/states/peopleTreeRecordsState';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Module-level so a load started before navigating away is dropped by the next one.
let latestPeopleTreeLoadId = 0;

export const usePeopleTreeRecords = () => {
  const apolloCoreClient = useApolloCoreClient();
  const { recordGqlFields, personObjectNamePlural } =
    usePeopleTreeFieldDefinitions();
  const { findManyRecordsQuery } = useFindManyRecordsQuery({
    objectNameSingular: CoreObjectNameSingular.Person,
    recordGqlFields,
  });
  const [peopleTreeRecords, setPeopleTreeRecords] = useAtomState(
    peopleTreeRecordsState,
  );
  const fetchPage = useCallback(
    async (offset: number) => {
      const { data, error } =
        await apolloCoreClient.query<RecordGqlOperationFindManyResult>({
          query: findManyRecordsQuery,
          variables: {
            limit: PEOPLE_TREE_PAGE_SIZE,
            offset,
            orderBy: [{ id: 'AscNullsFirst' }],
          },
          // 13k+ people would bloat the normalized cache that the rest of the app relies on.
          fetchPolicy: 'no-cache',
        });

      if (error) {
        throw error;
      }

      const connection = data?.[personObjectNamePlural];

      return {
        records: (connection?.edges ?? []).map((edge) => edge.node),
        totalCount: connection?.totalCount ?? 0,
      };
    },
    [apolloCoreClient, findManyRecordsQuery, personObjectNamePlural],
  );

  // Offset pages run in parallel; a full cursor walk over 13k people takes far longer.
  const loadPeopleTreeRecords = useCallback(async () => {
    const loadId = ++latestPeopleTreeLoadId;
    const isCurrentLoad = () => loadId === latestPeopleTreeLoadId;

    setPeopleTreeRecords((previous) => ({
      ...previous,
      isLoading: true,
      errorMessage: null,
    }));

    try {
      const firstPage = await fetchPage(0);
      const totalCount = Math.max(
        firstPage.totalCount,
        firstPage.records.length,
      );
      let loadedRecords: ObjectRecord[] = firstPage.records;

      if (!isCurrentLoad()) {
        return;
      }

      setPeopleTreeRecords((previous) => ({
        ...previous,
        records: loadedRecords,
        totalCount,
      }));

      const offsets: number[] = [];

      for (
        let offset = PEOPLE_TREE_PAGE_SIZE;
        offset < totalCount;
        offset += PEOPLE_TREE_PAGE_SIZE
      ) {
        offsets.push(offset);
      }

      let nextOffsetIndex = 0;

      const loadRemainingPages = async () => {
        while (nextOffsetIndex < offsets.length && isCurrentLoad()) {
          const offset = offsets[nextOffsetIndex++];
          const page = await fetchPage(offset);

          if (!isCurrentLoad()) {
            return;
          }

          loadedRecords = loadedRecords.concat(page.records);
          setPeopleTreeRecords((previous) => ({
            ...previous,
            records: loadedRecords,
          }));
        }
      };

      await Promise.all(
        Array.from({ length: PEOPLE_TREE_PARALLEL_REQUESTS }, () =>
          loadRemainingPages(),
        ),
      );

      if (!isCurrentLoad()) {
        return;
      }

      // Records created or deleted mid-load shift offsets, which can repeat a row across pages.
      const uniqueRecords = [
        ...new Map(loadedRecords.map((record) => [record.id, record])).values(),
      ];

      setPeopleTreeRecords({
        records: uniqueRecords,
        totalCount: uniqueRecords.length,
        isLoading: false,
        loadedAt: Date.now(),
        errorMessage: null,
      });
    } catch (error) {
      if (!isCurrentLoad()) {
        return;
      }

      setPeopleTreeRecords((previous) => ({
        ...previous,
        isLoading: false,
        errorMessage: getErrorMessage(error),
      }));
    }
  }, [fetchPage, setPeopleTreeRecords]);

  return { peopleTreeRecords, loadPeopleTreeRecords };
};

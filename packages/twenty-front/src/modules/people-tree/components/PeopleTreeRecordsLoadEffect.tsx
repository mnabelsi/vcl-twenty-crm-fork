import { useEffect } from 'react';

type PeopleTreeRecordsLoadEffectProps = {
  hasLoadedOnce: boolean;
  isLoading: boolean;
  onLoad: () => void;
};

export const PeopleTreeRecordsLoadEffect = ({
  hasLoadedOnce,
  isLoading,
  onLoad,
}: PeopleTreeRecordsLoadEffectProps) => {
  useEffect(() => {
    if (!hasLoadedOnce && !isLoading) {
      onLoad();
    }
    // Mount-only: re-running on a failed load would retry in a loop; Refresh retries on demand.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

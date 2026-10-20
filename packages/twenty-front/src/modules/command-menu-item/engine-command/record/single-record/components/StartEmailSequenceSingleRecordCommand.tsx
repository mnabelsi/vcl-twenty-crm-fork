import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { useOpenStartEmailSequenceInSidePanel } from '@/side-panel/hooks/useOpenStartEmailSequenceInSidePanel';

export const StartEmailSequenceSingleRecordCommand = () => {
  const { selectedRecords } = useHeadlessCommandContextApi();
  const { openStartEmailSequenceInSidePanel } =
    useOpenStartEmailSequenceInSidePanel();

  if (selectedRecords.length !== 1) {
    throw new Error('Starting an email sequence needs exactly one person');
  }

  const personId = selectedRecords[0].id;

  return (
    <HeadlessEngineCommandWrapperEffect
      execute={() => openStartEmailSequenceInSidePanel(personId)}
    />
  );
};

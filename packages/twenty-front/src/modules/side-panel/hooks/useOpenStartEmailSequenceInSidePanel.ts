import { useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { SidePanelPages } from 'twenty-shared/types';
import { IconSend } from 'twenty-ui/icon';
import { v4 } from 'uuid';

import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { startEmailSequencePersonIdComponentState } from '@/side-panel/pages/start-email-sequence/states/startEmailSequencePersonIdComponentState';

export const useOpenStartEmailSequenceInSidePanel = () => {
  const { t } = useLingui();
  const store = useStore();
  const { navigateSidePanelMenu } = useSidePanelMenu();

  const openStartEmailSequenceInSidePanel = useCallback(
    (personId: string) => {
      const pageId = v4();

      store.set(
        startEmailSequencePersonIdComponentState.atomFamily({
          instanceId: pageId,
        }),
        personId,
      );

      navigateSidePanelMenu({
        page: SidePanelPages.StartEmailSequence,
        pageTitle: t`Email Sequence`,
        pageIcon: IconSend,
        pageId,
      });
    },
    [navigateSidePanelMenu, store, t],
  );

  return { openStartEmailSequenceInSidePanel };
};

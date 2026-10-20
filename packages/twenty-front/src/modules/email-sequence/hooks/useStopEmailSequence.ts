import { useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useToast } from 'twenty-ui/components';

import {
  EmailSequenceDashboardDocument,
  StopEmailSequenceDocument,
} from '~/generated-metadata/graphql';
import { getErrorMessageFromApolloError } from '~/utils/get-error-message-from-apollo-error.util';

export const useStopEmailSequence = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const [stopEmailSequenceMutation, { loading: isStopping }] = useMutation(
    StopEmailSequenceDocument,
    { refetchQueries: [EmailSequenceDashboardDocument] },
  );

  const stopEmailSequence = async (enrollmentId: string) => {
    try {
      await stopEmailSequenceMutation({
        variables: { input: { enrollmentId } },
      });

      enqueueToast({ status: 'success', children: t`Sequence stopped.` });
    } catch (error) {
      enqueueToast({
        status: 'error',
        children: getErrorMessageFromApolloError(error as Error),
      });
    }
  };

  return { stopEmailSequence, isStopping };
};

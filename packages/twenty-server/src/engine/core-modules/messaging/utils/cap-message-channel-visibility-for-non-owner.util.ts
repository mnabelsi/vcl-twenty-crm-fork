import { MessageChannelVisibility } from 'twenty-shared/types';

export const capMessageChannelVisibilityForNonOwner = ({
  visibility,
  isEmailBodyVisibleToOwnerOnly,
}: {
  visibility: MessageChannelVisibility;
  isEmailBodyVisibleToOwnerOnly: boolean;
}): MessageChannelVisibility =>
  isEmailBodyVisibleToOwnerOnly &&
  visibility === MessageChannelVisibility.SHARE_EVERYTHING
    ? MessageChannelVisibility.SUBJECT
    : visibility;

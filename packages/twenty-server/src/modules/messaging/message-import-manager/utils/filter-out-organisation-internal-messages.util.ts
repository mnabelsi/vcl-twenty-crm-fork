import { isNonEmptyString } from '@sniptt/guards';

import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message.type';
import { isEmailInDomains } from 'src/utils/is-email-in-domains';

// Unlike filterOutInternals, this spans several domains (e.g. two tenants of one group) and ignores isInternalMessagesImportEnabled
export const filterOutOrganisationInternalMessages = (
  messages: MessageWithParticipants[],
  internalEmailDomains: string[],
): MessageWithParticipants[] => {
  if (internalEmailDomains.length === 0) {
    return messages;
  }

  return messages.filter((message) => {
    const participantHandles = (message.participants ?? [])
      .map((participant) => participant.handle)
      .filter(isNonEmptyString);

    if (participantHandles.length === 0) {
      return true;
    }

    return !participantHandles.every((handle) =>
      isEmailInDomains(handle, internalEmailDomains),
    );
  });
};

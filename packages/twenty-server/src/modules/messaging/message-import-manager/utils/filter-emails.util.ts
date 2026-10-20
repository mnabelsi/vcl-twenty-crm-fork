import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message.type';
import { filterOutBlocklistedMessages } from 'src/modules/messaging/message-import-manager/utils/filter-out-blocklisted-messages.util';
import { filterOutIcsAttachments } from 'src/modules/messaging/message-import-manager/utils/filter-out-ics-attachments.util';
import { filterOutInternals } from 'src/modules/messaging/message-import-manager/utils/filter-out-internals.util';
import { filterOutOrganisationInternalMessages } from 'src/modules/messaging/message-import-manager/utils/filter-out-organisation-internal-messages.util';
import { filterOutUnsubscribeRequests } from 'src/modules/messaging/message-import-manager/utils/filter-out-unsubscribe-requests.util';
import { isExcludedGroupEmailMessage } from 'src/modules/messaging/message-import-manager/utils/is-excluded-group-email-message.util';
import { isWorkEmail } from 'src/utils/is-work-email';

export const filterEmails = (
  primaryHandle: string,
  handleAliases: string[],
  messages: MessageWithParticipants[],
  blocklist: string[],
  excludeGroupEmails: boolean = true,
  isInternalMessagesImportEnabled: boolean = false,
  internalEmailDomains: string[] = [],
) => {
  const messagesWithoutIcsAttachments = filterOutIcsAttachments(messages);

  const messagesWithoutUnsubscribeRequests = filterOutUnsubscribeRequests(
    [primaryHandle, ...handleAliases],
    messagesWithoutIcsAttachments,
  );

  const messagesWithoutBlocklisted = filterOutOrganisationInternalMessages(
    filterOutBlocklistedMessages(
      [primaryHandle, ...handleAliases],
      messagesWithoutUnsubscribeRequests,
      blocklist,
    ),
    internalEmailDomains,
  );

  const shouldFilterOutInternals =
    isWorkEmail(primaryHandle) && !isInternalMessagesImportEnabled;

  const messagesWithoutInternals = shouldFilterOutInternals
    ? filterOutInternals(primaryHandle, messagesWithoutBlocklisted)
    : messagesWithoutBlocklisted;

  if (!excludeGroupEmails) {
    return messagesWithoutInternals;
  }

  const userHandles = [primaryHandle, ...handleAliases];

  return messagesWithoutInternals.filter(
    (message) => !isExcludedGroupEmailMessage(message, userHandles),
  );
};

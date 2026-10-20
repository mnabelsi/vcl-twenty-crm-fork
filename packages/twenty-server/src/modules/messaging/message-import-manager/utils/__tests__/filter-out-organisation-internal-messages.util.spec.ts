import { filterEmails } from 'src/modules/messaging/message-import-manager/utils/filter-emails.util';
import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message.type';

const INTERNAL_EMAIL_DOMAINS = ['vcl.solutions', 'ttmassociates.com'];

const buildMessage = (
  externalId: string,
  handles: string[],
): MessageWithParticipants =>
  ({
    externalId,
    participants: handles.map((handle, index) => ({
      role: index === 0 ? 'FROM' : 'TO',
      handle,
      displayName: handle,
    })),
    attachments: [],
  }) as unknown as MessageWithParticipants;

describe('filterEmails with organisation internal domains', () => {
  it('drops emails between the two internal tenants', () => {
    const messages = [
      buildMessage('internal', [
        'mahmoud@vcl.solutions',
        'colleague@ttmassociates.com',
      ]),
      buildMessage('client', ['mahmoud@vcl.solutions', 'sara@acme.com']),
      buildMessage('client-with-colleague-cc', [
        'sara@acme.com',
        'mahmoud@vcl.solutions',
        'colleague@ttmassociates.com',
      ]),
    ];

    const result = filterEmails(
      'mahmoud@vcl.solutions',
      [],
      messages,
      [],
      false,
      true,
      INTERNAL_EMAIL_DOMAINS,
    );

    expect(result.map((message) => message.externalId)).toEqual([
      'client',
      'client-with-colleague-cc',
    ]);
  });

  it('keeps everything when no internal domains are configured', () => {
    const messages = [
      buildMessage('internal', [
        'mahmoud@vcl.solutions',
        'colleague@ttmassociates.com',
      ]),
    ];

    expect(
      filterEmails('mahmoud@vcl.solutions', [], messages, [], false, true, []),
    ).toHaveLength(1);
  });
});

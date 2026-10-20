import { isAutomaticReply } from 'src/modules/email-sequence/utils/is-automatic-reply.util';
import { isBounceNotification } from 'src/modules/email-sequence/utils/is-bounce-notification.util';

describe('isBounceNotification', () => {
  it('recognises an Exchange non-delivery report', () => {
    expect(
      isBounceNotification({
        senderHandle:
          'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@vcl.solutions',
        senderDisplayName: 'Microsoft Outlook',
        subject: 'Undeliverable: AI at Acme: moving past the pilot stage',
      }),
    ).toBe(true);
  });

  it('ignores a normal email from a person', () => {
    expect(
      isBounceNotification({
        senderHandle: 'sara@acme.com',
        senderDisplayName: 'Sara',
        subject: 'Undeliverable ideas',
      }),
    ).toBe(false);
  });
});

describe('isAutomaticReply', () => {
  it('recognises out-of-office replies in English and Arabic', () => {
    expect(isAutomaticReply('Automatic reply: AI at Acme')).toBe(true);
    expect(isAutomaticReply('Out of Office: back on Sunday')).toBe(true);
    expect(isAutomaticReply('رد تلقائي: إجازة')).toBe(true);
  });

  it('treats a real reply as a reply', () => {
    expect(
      isAutomaticReply('Re: AI at Acme: moving past the pilot stage'),
    ).toBe(false);
  });
});

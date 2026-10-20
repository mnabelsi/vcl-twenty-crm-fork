import { isNonEmptyString } from '@sniptt/guards';

const BOUNCE_SENDER_PATTERN =
  /mailer-daemon|postmaster|microsoftexchange|mail delivery (subsystem|system)/i;

const BOUNCE_SUBJECT_PATTERN =
  /undeliverable|undelivered|delivery (status notification|has failed|failure)|returned mail|failure notice|could not be delivered/i;

export const isBounceNotification = ({
  senderHandle,
  senderDisplayName,
  subject,
}: {
  senderHandle: string | null;
  senderDisplayName: string | null;
  subject: string | null;
}): boolean =>
  (BOUNCE_SENDER_PATTERN.test(senderHandle ?? '') ||
    BOUNCE_SENDER_PATTERN.test(senderDisplayName ?? '')) &&
  isNonEmptyString(subject) &&
  BOUNCE_SUBJECT_PATTERN.test(subject);

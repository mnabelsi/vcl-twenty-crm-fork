import { msg } from '@lingui/core/macro';
import { assertUnreachable } from 'twenty-shared/utils';

import { CustomException } from 'src/utils/custom-exception';

export enum EmailSequenceExceptionCode {
  PERSON_NOT_FOUND = 'PERSON_NOT_FOUND',
  PERSON_HAS_NO_EMAIL = 'PERSON_HAS_NO_EMAIL',
  ENROLLMENT_ALREADY_ACTIVE = 'ENROLLMENT_ALREADY_ACTIVE',
  ENROLLMENT_NOT_FOUND = 'ENROLLMENT_NOT_FOUND',
  NO_SENDING_MAILBOX = 'NO_SENDING_MAILBOX',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  INVALID_SETTING = 'INVALID_SETTING',
  SEND_FAILED = 'SEND_FAILED',
}

const getEmailSequenceExceptionUserFriendlyMessage = (
  code: EmailSequenceExceptionCode,
) => {
  switch (code) {
    case EmailSequenceExceptionCode.PERSON_NOT_FOUND:
      return msg`Contact not found.`;
    case EmailSequenceExceptionCode.PERSON_HAS_NO_EMAIL:
      return msg`This contact has no email address.`;
    case EmailSequenceExceptionCode.ENROLLMENT_ALREADY_ACTIVE:
      return msg`This contact is already in an active sequence.`;
    case EmailSequenceExceptionCode.ENROLLMENT_NOT_FOUND:
      return msg`Sequence not found.`;
    case EmailSequenceExceptionCode.NO_SENDING_MAILBOX:
      return msg`Connect a mailbox in Settings > Accounts before starting a sequence.`;
    case EmailSequenceExceptionCode.TEMPLATE_NOT_FOUND:
      return msg`Email template not found.`;
    case EmailSequenceExceptionCode.INVALID_TEMPLATE:
      return msg`Each email needs a body, and emails that start a new thread need a subject.`;
    case EmailSequenceExceptionCode.INVALID_SETTING:
      return msg`Check the settings: the send window must start before it ends, at least one day must be selected, and each follow-up delay must be at least one day.`;
    case EmailSequenceExceptionCode.SEND_FAILED:
      return msg`The email could not be sent. Check the mailbox connection and try again.`;
    default:
      assertUnreachable(code);
  }
};

export class EmailSequenceException extends CustomException<EmailSequenceExceptionCode> {
  constructor(message: string, code: EmailSequenceExceptionCode) {
    super(message, code, {
      userFriendlyMessage: getEmailSequenceExceptionUserFriendlyMessage(code),
    });
  }
}

import { type ArgumentsHost, Catch } from '@nestjs/common';
import { type GqlExceptionFilter } from '@nestjs/graphql';

import {
  InternalServerError,
  NotFoundError,
  UserInputError,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  EmailSequenceException,
  EmailSequenceExceptionCode,
} from 'src/modules/email-sequence/email-sequence.exception';

@Catch(EmailSequenceException)
export class EmailSequenceGraphqlApiExceptionFilter implements GqlExceptionFilter {
  catch(exception: EmailSequenceException, _host: ArgumentsHost) {
    switch (exception.code) {
      case EmailSequenceExceptionCode.PERSON_NOT_FOUND:
      case EmailSequenceExceptionCode.ENROLLMENT_NOT_FOUND:
      case EmailSequenceExceptionCode.TEMPLATE_NOT_FOUND:
        throw new NotFoundError(exception);
      case EmailSequenceExceptionCode.SEND_FAILED:
        throw new InternalServerError(exception);
      default:
        throw new UserInputError(exception);
    }
  }
}

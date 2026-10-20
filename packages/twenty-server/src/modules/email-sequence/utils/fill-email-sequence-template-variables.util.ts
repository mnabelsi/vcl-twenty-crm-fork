import { type EmailSequenceTemplateVariables } from 'src/modules/email-sequence/types/email-sequence-template-variables.type';

const TEMPLATE_VARIABLE_PATTERN = /{{\s*(firstName|company|industryLine)\s*}}/g;

export const fillEmailSequenceTemplateVariables = (
  text: string,
  variables: EmailSequenceTemplateVariables,
): string =>
  text.replace(
    TEMPLATE_VARIABLE_PATTERN,
    (_match, variableName: keyof EmailSequenceTemplateVariables) =>
      variables[variableName],
  );

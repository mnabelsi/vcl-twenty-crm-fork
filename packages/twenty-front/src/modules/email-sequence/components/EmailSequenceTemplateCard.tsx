import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import {
  type EmailSequenceIndustry,
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components';
import { IconSend } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { EMAIL_SEQUENCE_STEP_LABELS } from '@/email-sequence/constants/EmailSequenceStepLabels';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { TextArea } from '@/ui/input/components/TextArea';
import {
  type EmailSequenceTemplatesQuery,
  SendEmailSequenceTestEmailDocument,
  UpdateEmailSequenceTemplateDocument,
} from '~/generated-metadata/graphql';
import { getErrorMessageFromApolloError } from '~/utils/get-error-message-from-apollo-error.util';

const StyledCard = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

type EmailSequenceTemplate =
  EmailSequenceTemplatesQuery['emailSequenceTemplates'][number];

type EmailSequenceTemplateCardProps = {
  template: EmailSequenceTemplate;
  testIndustry: EmailSequenceIndustry;
};

export const EmailSequenceTemplateCard = ({
  template,
  testIndustry,
}: EmailSequenceTemplateCardProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const [subject, setSubject] = useState(template.subject ?? '');
  const [body, setBody] = useState(template.body);

  const [updateTemplate, { loading: isSaving }] = useMutation(
    UpdateEmailSequenceTemplateDocument,
  );
  const [sendTestEmail, { loading: isSendingTest }] = useMutation(
    SendEmailSequenceTestEmailDocument,
  );

  const isThreadReply = !isDefined(template.subject);
  const isDirty =
    body !== template.body || (!isThreadReply && subject !== template.subject);

  const handleSave = async () => {
    try {
      await updateTemplate({
        variables: {
          input: {
            track: template.track,
            stepKey: template.stepKey,
            subject: isThreadReply ? undefined : subject,
            body,
          },
        },
      });

      enqueueToast({ status: 'success', children: t`Email saved.` });
    } catch (error) {
      enqueueToast({
        status: 'error',
        children: getErrorMessageFromApolloError(error as Error),
      });
    }
  };

  const handleSendTest = async () => {
    try {
      const { data } = await sendTestEmail({
        variables: {
          input: {
            track: template.track as EmailSequenceTrack,
            stepKey: template.stepKey as EmailSequenceStepKey,
            industry: testIndustry,
          },
        },
      });
      const recipient = data?.sendEmailSequenceTestEmail ?? '';

      enqueueToast({
        status: 'success',
        children: t`Test email sent to ${recipient}.`,
      });
    } catch (error) {
      enqueueToast({
        status: 'error',
        children: getErrorMessageFromApolloError(error as Error),
      });
    }
  };

  return (
    <StyledCard>
      <StyledHeader>
        <StyledTitle>
          {t(
            EMAIL_SEQUENCE_STEP_LABELS[
              template.stepKey as EmailSequenceStepKey
            ],
          )}
        </StyledTitle>
        {isThreadReply && (
          <StyledHint>{t`Sent as a reply in the same thread`}</StyledHint>
        )}
      </StyledHeader>
      {!isThreadReply && (
        <SettingsTextInput
          instanceId={`email-sequence-subject-${template.id}`}
          label={t`Subject`}
          value={subject}
          onChange={setSubject}
          fullWidth
        />
      )}
      <TextArea
        textAreaId={`email-sequence-body-${template.id}`}
        label={t`Body`}
        value={body}
        onChange={setBody}
        minRows={8}
      />
      <StyledActions>
        <Button
          size="sm"
          variant="outline"
          startIcon={<IconSend />}
          loading={isSendingTest}
          disabled={isSendingTest || isDirty}
          onClick={handleSendTest}
        >{t`Send test to me`}</Button>
        <Button
          size="sm"
          variant="solid"
          color="accent"
          loading={isSaving}
          disabled={isSaving || !isDirty}
          onClick={handleSave}
        >{t`Save`}</Button>
      </StyledActions>
    </StyledCard>
  );
};

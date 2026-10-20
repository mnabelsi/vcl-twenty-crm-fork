import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import {
  EMAIL_SEQUENCE_INDUSTRIES,
  EMAIL_SEQUENCE_STEP_KEYS,
  EMAIL_SEQUENCE_TRACKS,
  type EmailSequenceIndustry,
  type EmailSequenceTrack,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { EmailSequenceTemplateCard } from '@/email-sequence/components/EmailSequenceTemplateCard';
import { EMAIL_SEQUENCE_INDUSTRY_LABELS } from '@/email-sequence/constants/EmailSequenceIndustryLabels';
import { EMAIL_SEQUENCE_TRACK_LABELS } from '@/email-sequence/constants/EmailSequenceTrackLabels';
import { Select } from '@/ui/input/components/Select';
import { EmailSequenceTemplatesDocument } from '~/generated-metadata/graphql';

const TEMPLATE_VARIABLE_TOKENS = [
  '{{firstName}}',
  '{{company}}',
  '{{industryLine}}',
];

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledToolbar = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

export const EmailSequenceTemplateEditor = () => {
  const { t } = useLingui();
  const [track, setTrack] = useState<EmailSequenceTrack>('C_SUITE');
  const [testIndustry, setTestIndustry] =
    useState<EmailSequenceIndustry>('GENERAL');

  const { data } = useQuery(EmailSequenceTemplatesDocument, {
    fetchPolicy: 'cache-and-network',
  });

  const templatesOfTrack = EMAIL_SEQUENCE_STEP_KEYS.map((stepKey) =>
    data?.emailSequenceTemplates.find(
      (template) => template.track === track && template.stepKey === stepKey,
    ),
  ).filter(isDefined);

  return (
    <StyledContainer>
      <StyledToolbar>
        <Select
          dropdownId="email-sequence-template-track"
          label={t`Track`}
          fullWidth
          value={track}
          options={EMAIL_SEQUENCE_TRACKS.map((trackOption) => ({
            value: trackOption,
            label: t(EMAIL_SEQUENCE_TRACK_LABELS[trackOption]),
          }))}
          onChange={setTrack}
        />
        <Select
          dropdownId="email-sequence-template-test-industry"
          label={t`Industry used in test emails`}
          fullWidth
          value={testIndustry}
          options={EMAIL_SEQUENCE_INDUSTRIES.map((industryOption) => ({
            value: industryOption,
            label: t(EMAIL_SEQUENCE_INDUSTRY_LABELS[industryOption]),
          }))}
          onChange={setTestIndustry}
        />
      </StyledToolbar>
      <StyledHint>
        {t`Variables you can use:`} {TEMPLATE_VARIABLE_TOKENS.join(', ')}.{' '}
        {t`Leave an empty line between paragraphs. Your signature is added to every email.`}
      </StyledHint>
      {templatesOfTrack.map((template) => (
        <EmailSequenceTemplateCard
          key={`${template.id}-${template.updatedAt}`}
          template={template}
          testIndustry={testIndustry}
        />
      ))}
    </StyledContainer>
  );
};

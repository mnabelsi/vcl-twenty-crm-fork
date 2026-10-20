import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { escapeHtml } from 'src/engine/core-modules/emailing-domain/utils/escape-html.util';
import { type EmailSequenceTemplateVariables } from 'src/modules/email-sequence/types/email-sequence-template-variables.type';
import { fillEmailSequenceTemplateVariables } from 'src/modules/email-sequence/utils/fill-email-sequence-template-variables.util';

const PARAGRAPH_SEPARATOR_PATTERN = /\n\s*\n/;

const toHtmlParagraph = (paragraph: string): string =>
  `<p style="margin:0 0 14px 0">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`;

export const renderEmailSequenceEmail = ({
  body,
  signature,
  variables,
  openTrackingPixelUrl,
}: {
  body: string;
  signature: string;
  variables: EmailSequenceTemplateVariables;
  openTrackingPixelUrl?: string;
}): { html: string; plainText: string } => {
  // An empty variable (e.g. no industry line) drops its whole paragraph
  const paragraphs = [
    ...fillEmailSequenceTemplateVariables(body, variables)
      .replace(/\r\n?/g, '\n')
      .split(PARAGRAPH_SEPARATOR_PATTERN),
    signature.replace(/\r\n?/g, '\n'),
  ]
    .map((paragraph) => paragraph.trim())
    .filter(isNonEmptyString);

  const pixel = isDefined(openTrackingPixelUrl)
    ? `<img src="${escapeHtml(openTrackingPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`
    : '';

  return {
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222">${paragraphs
      .map(toHtmlParagraph)
      .join('')}${pixel}</div>`,
    plainText: paragraphs.join('\n\n'),
  };
};

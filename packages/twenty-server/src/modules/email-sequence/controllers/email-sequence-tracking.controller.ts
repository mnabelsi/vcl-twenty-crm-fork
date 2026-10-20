import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';

import { type Response } from 'express';
import { ApiPath } from 'twenty-shared/types';
import { isValidUuid } from 'twenty-shared/utils';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { EMAIL_SEQUENCE_OPEN_TRACKING_PATH } from 'src/modules/email-sequence/constants/email-sequence-open-tracking-path.constant';
import { EmailSequenceOpenTrackingService } from 'src/modules/email-sequence/services/email-sequence-open-tracking.service';

const OPEN_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Controller(`${ApiPath.Emailing}/${EMAIL_SEQUENCE_OPEN_TRACKING_PATH}`)
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class EmailSequenceTrackingController {
  constructor(
    private readonly emailSequenceOpenTrackingService: EmailSequenceOpenTrackingService,
  ) {}

  @Get(':messageId')
  async handleOpenPixel(
    @Param('messageId') messageId: string,
    @Res() response: Response,
  ): Promise<void> {
    if (isValidUuid(messageId)) {
      await this.emailSequenceOpenTrackingService
        .recordOpen(messageId)
        .catch(() => undefined);
    }

    response
      .set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Referrer-Policy': 'no-referrer',
        'Content-Type': 'image/gif',
        'Content-Length': String(OPEN_PIXEL_GIF.length),
      })
      .end(OPEN_PIXEL_GIF);
  }
}

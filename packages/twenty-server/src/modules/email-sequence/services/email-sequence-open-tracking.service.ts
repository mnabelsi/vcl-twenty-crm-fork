import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { EmailSequenceMessageEntity } from 'src/engine/core-modules/email-sequence/entities/email-sequence-message.entity';
import { SCANNER_PREFETCH_WINDOW_MS } from 'src/modules/emailing/constants/scanner-prefetch-window-ms.constant';

@Injectable()
export class EmailSequenceOpenTrackingService {
  constructor(
    // The pixel request carries only the message id, so there is no request workspace to scope by.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(EmailSequenceMessageEntity)
    private readonly messageRepository: Repository<EmailSequenceMessageEntity>,
  ) {}

  async recordOpen(messageId: string): Promise<void> {
    // Opens within seconds of sending are almost always security scanners prefetching images
    await this.messageRepository
      .createQueryBuilder()
      .update(EmailSequenceMessageEntity)
      .set({
        openCount: () => '"openCount" + 1',
        firstOpenedAt: () => 'COALESCE("firstOpenedAt", now())',
        lastOpenedAt: () => 'now()',
      })
      .where('id = :messageId', { messageId })
      .andWhere(
        `"sentAt" < now() - (:prefetchWindowMs * interval '1 millisecond')`,
        {
          prefetchWindowMs: SCANNER_PREFETCH_WINDOW_MS,
        },
      )
      .execute();
  }
}

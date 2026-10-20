import { MessageChannelVisibility } from 'twenty-shared/types';

import { capMessageChannelVisibilityForNonOwner } from 'src/engine/core-modules/messaging/utils/cap-message-channel-visibility-for-non-owner.util';

describe('capMessageChannelVisibilityForNonOwner', () => {
  it('hides the body from other members when bodies are owner-only', () => {
    expect(
      capMessageChannelVisibilityForNonOwner({
        visibility: MessageChannelVisibility.SHARE_EVERYTHING,
        isEmailBodyVisibleToOwnerOnly: true,
      }),
    ).toBe(MessageChannelVisibility.SUBJECT);
  });

  it('never widens a narrower visibility', () => {
    expect(
      capMessageChannelVisibilityForNonOwner({
        visibility: MessageChannelVisibility.METADATA,
        isEmailBodyVisibleToOwnerOnly: true,
      }),
    ).toBe(MessageChannelVisibility.METADATA);
  });

  it('keeps the channel setting when the rule is off', () => {
    expect(
      capMessageChannelVisibilityForNonOwner({
        visibility: MessageChannelVisibility.SHARE_EVERYTHING,
        isEmailBodyVisibleToOwnerOnly: false,
      }),
    ).toBe(MessageChannelVisibility.SHARE_EVERYTHING);
  });
});

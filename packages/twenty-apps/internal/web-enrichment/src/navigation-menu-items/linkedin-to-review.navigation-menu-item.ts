import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  LINKEDIN_TO_REVIEW_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  LINKEDIN_TO_REVIEW_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier:
    LINKEDIN_TO_REVIEW_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'LinkedIn to review',
  icon: 'IconBrandLinkedin',
  position: 51,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: LINKEDIN_TO_REVIEW_VIEW_UNIVERSAL_IDENTIFIER,
});

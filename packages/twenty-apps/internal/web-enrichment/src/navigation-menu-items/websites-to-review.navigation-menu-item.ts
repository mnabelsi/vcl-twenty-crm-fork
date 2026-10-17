import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  WEBSITES_TO_REVIEW_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  WEBSITES_TO_REVIEW_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier:
    WEBSITES_TO_REVIEW_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'Websites to review',
  icon: 'IconWorldQuestion',
  position: 50,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: WEBSITES_TO_REVIEW_VIEW_UNIVERSAL_IDENTIFIER,
});

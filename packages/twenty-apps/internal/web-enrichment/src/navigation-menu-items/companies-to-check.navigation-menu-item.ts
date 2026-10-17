import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  COMPANIES_TO_CHECK_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  COMPANIES_TO_CHECK_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier:
    COMPANIES_TO_CHECK_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'Companies to check',
  icon: 'IconBuildingCommunity',
  position: 52,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: COMPANIES_TO_CHECK_VIEW_UNIVERSAL_IDENTIFIER,
});

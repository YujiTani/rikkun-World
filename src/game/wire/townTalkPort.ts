// TOWN-1: 建築士さんの「はなす」口に 街の 人（よろずやさん〔1C〕・かじやさんと やたいの 3 人〔1E〕）を まぜる（1P・2P の ほる係が つかう）。
import type { TalkPort, ShopHub } from '../../town/shop/shopTalk';
import { withShopTalk } from '../../town/shop/shopTalk';
import { withVendorTalk, type VendorTalkHub } from '../../town/vendor/vendorTalk';

export function withTownTalk(base: TalkPort, shared: { readonly shop: ShopHub; readonly townVendors: VendorTalkHub | null }, who: 1 | 2): TalkPort {
  return withVendorTalk(
    withShopTalk(base, () => shared.shop, who),
    () => shared.townVendors,
    who,
  );
}

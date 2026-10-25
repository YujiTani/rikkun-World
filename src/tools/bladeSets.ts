import type { ItemId } from '../contracts';
import { registryBladeIds, registryTrailOnlyIds } from '../content/items/registry';

/**
 * 刀の集まりの「ひとつだけの出どころ」（#305）。ほかの場所で同じ並びを写さず、ここから読む。
 * 型だけを読む葉のファイルなので、fx・ui からも循環なしで読める。
 */

/**
 * 刀（わざ・かまえ・刃の軌跡が ある もの）。なぎなたは入れない（今のパンチのまま）。
 * わざの判定（isBladeItem）・刃の軌跡・手甲の倍率などは、こちらを読む。
 */
export const BLADE_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>(registryBladeIds()); // 登録表（content/items/）で `blade` を もつ 物（ぼくとう・かたな・きらめく カタナ・雷神剣 …）

/**
 * 刀の仲間 = 刀 ＋ なぎなた。
 * なぎなたは わざ・かまえ・軌跡が ないので BLADE_ITEMS には入らないが、
 * 道具の種類（blade）・ブロックをこわす強さ・ツールチップでは 刀と同じ あつかいにするため、こちらに入れる。
 */
export const BLADE_LIKE_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>([...BLADE_ITEMS, ...registryTrailOnlyIds()]); // 「軌跡だけ」(`blade.trailOnly`) = なぎなた

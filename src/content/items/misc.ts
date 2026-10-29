import { GADGET_TUNING } from './gadgetTuning';
import type { GadgetId } from './ids';
import type { ItemDef } from './types';

/**
 * 小物 6 つ（M4）＋ やぶれた おまもり: ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ。値は ここ 1 か所（ルール #304）。
 * 働き（ITEM-FX-1・#342）: ちょうちん=おくと あかるい・たこ=そらに あげる・ふとん=よるに ねると あさ・おまもり=やられても おとさない・
 * わらじ=はくと たかく とべる・はにわ=かざる。働きの 数（光・半径・高さ・時間）は gadgetTuning.ts の 表。説明には 数字を 書かない。
 * ずっと へらない。絵は ui/itemArtM4.ts、手に持つ形は camera/heldTools.ts。
 */
export const GADGETS = {
  lantern: {
    name: 'ちょうちん',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'light',
    placeBlock: 'lantern', // 光の 強さ・湧かない はんい は GADGET_TUNING.lantern
    info: { use: 'おくと たいまつ より あかるい。まわり に ようかい が でない', how: 'てに もって みぎクリック で おく（した・よこ・うえ に かたい ブロック が いるよ）', buttons: ['1-9', 'right'] },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['paper', 2], ['log', 1], ['oil', 1]] },
  },
  kite: {
    name: 'たこ',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'そら に あげて あそべる', how: 'てに もって みぎクリック で あげる。もういちど か、ほかの ものを もつと もどる', buttons: ['1-9', 'right'] },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['paper', 3], ['string', 2], ['log', 1]] },
  },
  futon: {
    name: 'ふとん',
    maxStack: 64, // 置けるブロックなので ブロックと 同じ（PO 判断）
    rarity: 'uncommon',
    category: 'home',
    placeBlock: 'futon',
    info: { use: 'ゆうがた と よる に ねると あさ に なる', how: 'おいて、ふとん に むけて みぎクリック', buttons: ['right'] },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['cloth', 3], ['string', 1]] },
  },
  omamori: {
    name: 'おまもり',
    maxStack: 1,
    maxOwned: GADGET_TUNING.omamori.maxOwned, // もちもの ぜんぶ で 1 こ だけ
    rarity: 'superRare',
    category: 'home',
    info: { use: 'もっていると やられても もちもの と ぼうぐ を おとさない（まもると やぶれる）', how: 'もちもの の どこか に いれておく。ひとつ だけ もてるよ', buttons: [] },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['crystal', 3], ['kin', 1], ['cloth', 2], ['string', 2]] },
  },
  omamori_torn: {
    name: 'やぶれた おまもり',
    maxStack: 64,
    rarity: 'common',
    category: 'home',
    info: { use: 'おまもり が まもって くれた しるし。きねん の しな', how: 'もっていても なにも おこらない', buttons: [] },
    wear: 'permanent',
  },
  waraji: {
    name: 'わらじ',
    maxStack: 1,
    rarity: 'common',
    category: 'home',
    info: { use: 'はくと ジャンプ が すこし たかく なる（あし）', how: 'ダブルクリック か、てに もって みぎクリック で はく。E の そうび の マス に いれても よい', buttons: ['1-9', 'right'] },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['grass', 3], ['string', 1]] },
    armor: { slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: 0 } }, // まもりは 0。ジャンプの 高さは GADGET_TUNING.waraji
  },
  haniwa: {
    name: 'はにわ',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'home',
    placeBlock: 'haniwa',
    info: { use: 'おいて かざれる', how: 'てに もって みぎクリック で おく', buttons: ['1-9', 'right'] },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['clay', 2]], station: 'furnace' }, // かまどで やく
  },
} satisfies Record<GadgetId, ItemDef>;

import { laterRow } from './howText';
import type { GadgetId } from './ids';
import type { ItemDef } from './types';

/**
 * 小物 6 つ（M4）: ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ。値は ここ 1 か所（ルール #304）。
 * 働き（おいて あかるく・そらに あげる・ねると あさ・おとさない・はやく あるく・かざる）は あとで 入る
 * （説明は「働きが あと」の 行。作り方も works: false = カードに 時計の 絵）。ずっと へらない。
 * 絵は ui/itemArtM4.ts、手に持つ形は camera/heldTools.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const GADGETS = {
  lantern: {
    name: 'ちょうちん',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'light',
    info: laterRow('おいて あかるく できるように なるよ（もうすぐ）'),
    wear: 'permanent',
    recipe: { count: 1, inputs: [['paper', 2], ['log', 1], ['oil', 1]], works: false },
  },
  kite: {
    name: 'たこ',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'home',
    info: laterRow('そら に あげて あそべるように なるよ（もうすぐ）'),
    wear: 'permanent',
    recipe: { count: 1, inputs: [['paper', 3], ['string', 2], ['log', 1]], works: false },
  },
  futon: {
    name: 'ふとん',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'home',
    info: laterRow('よる に ねると あさ に なるように なるよ（もうすぐ）'),
    wear: 'permanent',
    recipe: { count: 1, inputs: [['cloth', 3], ['string', 1]], works: false },
  },
  omamori: {
    name: 'おまもり',
    maxStack: 1,
    rarity: 'superRare',
    category: 'home',
    info: laterRow('もっていると やられても もちもの を おとさなく なるよ（もうすぐ）'),
    wear: 'permanent',
    recipe: { count: 1, inputs: [['crystal', 1], ['cloth', 1], ['string', 1]], works: false },
  },
  waraji: {
    name: 'わらじ',
    maxStack: 1,
    rarity: 'common',
    category: 'home',
    info: laterRow('はくと すこし はやく あるけるように なるよ（もうすぐ）'),
    wear: 'permanent',
    recipe: { count: 1, inputs: [['grass', 3], ['string', 1]], works: false },
  },
  haniwa: {
    name: 'はにわ',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'home',
    info: laterRow('おいて かざれるように なるよ（もうすぐ）'),
    wear: 'permanent',
    recipe: { count: 1, inputs: [['clay', 2]], station: 'furnace', works: false }, // かまどで やく
  },
} satisfies Record<GadgetId, ItemDef>;

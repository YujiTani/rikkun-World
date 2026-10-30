import { CRAFT_E } from './howText';
import type { IngotId, MaterialId, OrbId } from './ids';
import type { ItemDef } from './types';

/**
 * ざいりょう（M3・M4）。ようかいだま・かみ・あぶら・いと・ぬの・ねんど・すいしょう・てつの かたまりの 値は ここ 1 か所（ルール #304）。
 * 絵は ui/itemArt.ts（ようかいだまは ui/itemIcon.ts、てつの かたまりは ui/itemArtM4.ts）。
 * ドロップ（yokai/ai/config.ts）・ガシャ（gasha/releaseTuning.ts）・燃料（craft/config.ts の fuelOrder）は 読む側なので id の 一覧のまま。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */

/** ようかいだま: M3 第 1 版の 名残り（いまは 手に入らない。古い保存用） */
export const ORB = {
  yokai_orb: {
    name: 'ようかいだま',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'material',
    info: { use: 'いまは つかえない よ', how: '', buttons: [] },
  },
} satisfies Record<OrbId, ItemDef>;

/** ざいりょう 6 つ（置けない）。ねんどだけ かまどで やく（作り方は かわら・レンガ・はにわ の 側に ある） */
export const MATERIALS = {
  paper: {
    name: 'かみ',
    maxStack: 64,
    rarity: 'common',
    category: 'material',
    info: { use: 'や・ちょうちん・たこ の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  },
  oil: {
    name: 'あぶら',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'material',
    info: { use: 'たいまつ・ちょうちん の ざいりょう。かまど の ねんりょう にも なる', how: `${CRAFT_E}。ねんりょう は かってに つかう`, buttons: ['E'] },
  },
  string: {
    name: 'いと',
    maxStack: 64,
    rarity: 'common',
    category: 'material',
    info: { use: 'ゆみ・よろい・すねあて・たこ・ふとん・おまもり・わらじ の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  },
  cloth: {
    name: 'ぬの',
    maxStack: 64,
    rarity: 'common',
    category: 'material',
    info: { use: 'かぶと・よろい・こて・ふとん・おまもり の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  },
  clay: {
    name: 'ねんど',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'material',
    info: { use: 'かまど で やくと かわら・レンガ・はにわ に なる', how: 'かまど に みぎクリック して やく', buttons: ['right'] },
  },
  crystal: {
    name: 'すいしょう',
    maxStack: 64,
    rarity: 'superRare', // ハイパーレア
    category: 'metal',
    info: { use: 'きらめく カタナ・おまもり の ざいりょう。ハイパーレア', how: CRAFT_E, buttons: ['E'] },
  },
  // TAKO-1: タコはちまきを たおすと かならず 1〜2 こ（ドロップは content/yokai/tako_hachimaki.ts）。ふでの ざいりょう
  sumi: {
    name: 'すみ',
    maxStack: 64,
    rarity: 'common',
    category: 'material',
    info: { use: 'ふで を つくる ざいりょう', how: 'タコはちまき を たおすと でる', buttons: [] },
  },
} satisfies Record<MaterialId, ItemDef>;

/** てつの かたまり: てつこうせきを かまどで やく（works: 本当） */
export const INGOT = {
  iron_ingot: {
    name: 'てつの かたまり',
    maxStack: 64,
    rarity: 'rare',
    category: 'metal',
    info: { use: 'てつの つるはし・ぶき・ぼうぐ・たんす の ざいりょう', how: CRAFT_E, buttons: ['E'] },
    recipe: { count: 1, inputs: [['iron_ore', 1]], station: 'furnace' },
  },
} satisfies Record<IngotId, ItemDef>;

import { vegRow } from './howText';
import type { LiveItemId } from './ids';
import type { ItemDef } from './types';
import type { BlockId } from '../../contracts';

/**
 * 生き物のアイテム（LIVE-1・LIVE-2・LIVE-3）。8 個の値は ここ 1 か所（ルール #304）。
 * たまご・むし・むしとりあみ・こたつ（置ける ブロック）・とりごや・きんの たまご・なま／やいた もも にく。
 * たべた ときの 回復量（たまご・やいた もも にく）は `food` 部品。説明の ハートの 数も ここから 作る。
 * 動物・ふ化・こたつの はたらきの ロジックは animals/・dig/ に ある（ここは 値だけ）。
 * 絵は ui/itemArtLive1.ts・itemArtLive2.ts・itemArtLive3.ts、手に持つ形は camera/heldTools.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */

/** たまごを たべて もどる 体力（2 = ハート 1 こ。LIVE_SETTING_DEFAULTS.animalEggHeal の 初期値） */
const EGG_HEAL = 2;
/** やいた もも にくを たべて もどる 体力（10 = ハート 5 こ。LIVE_SETTING_DEFAULTS.meatHeal の 初期値） */
const MEAT_HEAL = 10;

/** ハート 1 こ = 体力 2 */
const hearts = (heal: number): number => heal / 2;

export const LIVE = {
  egg: {
    name: 'たまご',
    maxStack: 64,
    rarity: 'common',
    category: 'food',
    info: vegRow(hearts(EGG_HEAL)),
    food: { heal: EGG_HEAL },
  },
  mushi: {
    name: 'むし',
    maxStack: 64, // やさい と 同じ
    rarity: 'common',
    category: 'plant',
    info: { use: 'にわとり に あげる と なかよく なる', how: 'もって にわとり に みぎクリック', buttons: ['1-9', 'right'] },
  },
  mushi_ami: {
    name: 'むしとりあみ',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'き から むし を とる', how: 'もって き に みぎクリック', buttons: ['1-9', 'right'] },
    wear: 'permanent', // 6 歳が なくして 泣かない
    recipe: { count: 1, inputs: [['log', 1], ['string', 2]] },
  },
  toriya: {
    name: 'とりごや',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'にわとり の いえ', how: 'おいて、ひよこ を つれて いく', buttons: ['1-9', 'right'] },
    recipe: { count: 1, inputs: [['log', 8], ['grass', 4]] }, // 5×5 の 小屋 を 置く（ブロック では ない）
  },
  kin_tamago: {
    name: 'きん の たまご',
    maxStack: 64,
    rarity: 'epic', // 7 段中 5 つ目（ほし 5・RARITY-7）。たべられない
    category: 'material',
    info: { use: 'だいじ な たから。こたつ で あたためる と マッチョ ひよこ', how: 'こたつ に いれる', buttons: ['1-9', 'right'] },
  },
  momo_nama: {
    name: 'なま もも にく',
    maxStack: 64,
    rarity: 'common', // LIVE-3 仮。たべられない（かまど で やく）
    category: 'food',
    info: { use: 'かまど で やく と たべられる', how: 'かまど に みぎクリック して やく', buttons: ['right'] },
  },
  momo_yaki: {
    name: 'やいた もも にく',
    maxStack: 64,
    rarity: 'common',
    category: 'food',
    info: vegRow(hearts(MEAT_HEAL)),
    recipe: { count: 1, inputs: [['momo_nama', 1]], station: 'furnace' }, // ねんりょう 1・60 ステップ。かまどの いちばん うしろ
    food: { heal: MEAT_HEAL },
  },
} satisfies Record<LiveItemId, ItemDef>;

/** こたつ: 置ける ブロック（BlockId 側の 表は 動かさない。ここは アイテムの 行だけ）。64 こ まで 重ねられる。たまごを あたためる */
export const KOTATSU = {
  nukunuku: {
    name: 'こたつ',
    maxStack: 64,
    placeBlock: 'nukunuku',
    rarity: 'uncommon', // たんす・かまど と 同じ 段
    category: 'home',
    info: { use: 'たまご を あたためる', how: 'おいて、たまご を もって みぎクリック', buttons: ['1-9', 'right'] },
    recipe: { count: 1, inputs: [['grass', 3], ['log', 2], ['torch', 1]] },
  },
} satisfies Partial<Record<BlockId, ItemDef>>;

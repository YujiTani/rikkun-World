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
    zukan: 'ようかいの ［力｜ちから］が ぎゅっと つまった、ふしぎな ［丸｜まる］い たま。［今｜いま］は まだ ［何｜なに］に つかうか わからない。だいじに とって おこう。',
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
    zukan: 'うすくて かるい ［紙｜かみ］。ちょうちんや たこの ざいりょうに なる。ふでで せっけいずを かけば、ゆめの おうちの はじまり。からかさや ちょうちんの ようかいが よく もって いる。',
    maxStack: 64,
    rarity: 'common',
    category: 'material',
    info: { use: 'や・ちょうちん・たこ・せっけいず の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  },
  oil: {
    name: 'あぶら',
    zukan: 'とろりとした あぶら。たいまつや ちょうちんの ［火｜ひ］を ともす。かまどに ［入｜い］れれば よく もえる。からかさの ようかいが しずくを たらして いく。',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'material',
    info: { use: 'たいまつ・ちょうちん の ざいりょう。かまど の ねんりょう にも なる', how: `${CRAFT_E}。ねんりょう は かってに つかう`, buttons: ['E'] },
  },
  string: {
    name: 'いと',
    zukan: 'ほそくて じょうぶな ［糸｜いと］。ゆみの つる、ふとん、たこの ［糸｜いと］。いろんな ものを むすんで つないで くれる。',
    maxStack: 64,
    rarity: 'common',
    category: 'material',
    info: { use: 'ゆみ・よろい・すねあて・たこ・ふとん・おまもり・わらじ の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  },
  cloth: {
    name: 'ぬの',
    zukan: 'やわらかい ぬの。ふとんや かぶとの うらに つかわれる。ろくろくびが まきつけて いる ことが あるらしい。',
    maxStack: 64,
    rarity: 'common',
    category: 'material',
    info: { use: 'かぶと・よろい・こて・ふとん・おまもり の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  },
  clay: {
    name: 'ねんど',
    zukan: 'しめった ところで みつかる やわらかい ねんど。こねて かまどで やけば、かわらや レンガや はにわに へんしん。',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'material',
    info: { use: 'かまど で やくと かわら・レンガ・はにわ に なる', how: 'かまど に みぎクリック して やく', buttons: ['right'] },
    dugFrom: 'nendo', // MINE-1B: ねんどの ブロックを ほる（ぬりかべも おとす）
  },
  crystal: {
    name: 'すいしょう',
    zukan: '［地｜ち］［下｜か］の おくで すきとおった ［光｜ひかり］を はなつ すいしょう。むかしから「まよけの ［石｜いし］」と いわれ、きらめく カタナや おまもりの ざいりょうに なる。',
    maxStack: 64,
    rarity: 'superRare', // ハイパーレア
    category: 'metal',
    info: { use: 'きらめく カタナ・おまもり の ざいりょう。ハイパーレア', how: CRAFT_E, buttons: ['E'] },
    dugFrom: 'suisho_ore', // MINE-1B: すいしょうの いしを ほる（ろくろくびも おとす）
  },
  // TAKO-1: タコはちまきを たおすと かならず 1〜2 こ（ドロップは content/yokai/tako_hachimaki.ts）。ふでの ざいりょう
  sumi: {
    name: 'すみ',
    zukan: '［海｜うみ］に すむ ようかい タコはちまきが ぷしゅっと はく まっ［黒｜くろ］な すみ。ふでの けさきに すいこませると、せっけいずが かけるように なる。',
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
    zukan: 'てつこうせきを かまどで やいて できた てつの かたまり。かたくて おもくて たよりになる。［強｜つよ］い つるはしや かたなの もと。',
    maxStack: 64,
    rarity: 'rare',
    category: 'metal',
    info: { use: 'てつの つるはし・ぶき・ぼうぐ・たんす の ざいりょう', how: CRAFT_E, buttons: ['E'] },
    recipe: { count: 1, inputs: [['iron_ore', 1]], station: 'furnace' },
  },
} satisfies Record<IngotId, ItemDef>;

import { BLADE_HOW, BOW_HOW, KATANA_HOW } from './howText';
import type { BowId, SwordId } from './ids';
import type { ItemDef } from './types';

/**
 * 刀・なぎなた・ゆみ・や（M4）。値は ここ 1 か所（ルール #304）。
 * 強さ・届く長さ・たいきゅうは、その 武器の 行に 単位つきで 書く。
 * 刀（blade）は わざ・かまえ・刃の軌跡が ある 物。なぎなたは 「軌跡だけ」（`trailOnly`。BLADE_ITEMS には 入らず、BLADE_LIKE_ITEMS に 入る）。
 * 絵は ui/itemArtM4.ts、手に持つ形は camera/heldTools.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const SWORDS = {
  bokuto: {
    name: 'ぼくとう',
    zukan: '［木｜き］を けずって ［作｜つく］った ぼくとう。はじめての ぶき。これで ようかいに ゆうきを ［見｜み］せよう。',
    maxStack: 1,
    rarity: 'common',
    category: 'weapon',
    info: { use: 'ようかい を たたく', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' },
    wear: 59, // 59 かい
    recipe: { count: 1, inputs: [['log', 2]] },
    tool: { damage: 2 }, // たたく強さ 2
    // 刃の 届く 長さ 2.2（ブロック）。軌跡は 木の いろ
    blade: { reach: 2.2, trail: { color: 0x9c6b3a, glow: 0xe8c08a, blade: 0xb98b54, bladeShine: 0xe0bc86, style: 'plain' } },
  },
  katana: {
    name: 'かたな',
    zukan: 'てつを なんども うって きたえた ［刀｜かたな］。ようかいを ［強｜つよ］く たたける。ほんものの さむらいの きぶん。',
    maxStack: 1,
    rarity: 'rare',
    category: 'weapon',
    info: { use: 'ようかい を つよく たたく', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' },
    wear: 250,
    recipe: { count: 1, inputs: [['iron_ingot', 2], ['log', 1]] },
    tool: { damage: 4 }, // たたく強さ 4
    blade: { reach: 2.2, trail: { color: 0xe8f1fa, glow: 0xffffff, blade: 0xc8cdd8, bladeShine: 0xffffff, style: 'plain' } },
  },
  naginata: {
    name: 'なぎなた',
    zukan: '［長｜なが］い えの ［先｜さき］に はを つけた なぎなた。［遠｜とお］くまで とどいて、ついたり はらったり かわりばんこに わざが ［出｜で］る。',
    maxStack: 1,
    rarity: 'rare',
    category: 'weapon',
    info: {
      use: 'とおく まで とどく。つく と はらう を かわりばんこ',
      how: `${BLADE_HOW}（おしつづけると つづけて ふる）`,
      buttons: ['1-9', 'left'],
      stats: 'blade',
    },
    wear: 250,
    recipe: { count: 1, inputs: [['iron_ingot', 1], ['log', 3]] },
    tool: { damage: 3, reach: 5.0, ticks: 40 }, // たたく強さ 3・とどく 5.0 ブロック・当たるまで 40 ステップ
    // 軌跡だけ（わざ・かまえは なし。届く長さは tool.reach）
    blade: { trailOnly: true, trail: { color: 0xcfe8ff, glow: 0xffffff, blade: 0xb8cce0, bladeShine: 0xeef6ff, style: 'long' } },
  },
  crystal_katana: {
    name: 'きらめく カタナ',
    zukan: 'すいしょうの ［光｜ひかり］を とじこめた ［刀｜かたな］。つづけて ふると、きらきらの 3 だんわざに なる。ふるたびに ［光｜ひかり］の すじが ［空｜そら］に のこる。',
    maxStack: 1,
    rarity: 'superRare',
    category: 'weapon',
    info: { use: 'れんぞく で ふると 3 だん わざ に なる かたな', how: `${KATANA_HOW}。ひだりクリック を つづけて おすと 3 だん わざ`, buttons: ['1-9', 'left'], stats: 'blade' },
    wear: 400,
    recipe: { count: 1, inputs: [['crystal', 2], ['iron_ingot', 2], ['log', 2]] },
    tool: { damage: 4 }, // たたく強さ 4
    blade: { reach: 2.2, trail: { color: 0x7fdcff, glow: 0xe6faff, blade: 0x6fcdf5, bladeShine: 0xe6faff, style: 'star' } },
  },
} satisfies Record<SwordId, ItemDef>;

export const BOWS = {
  // ゆみ: や の ダメージは 設定 bowDamage（1・2・3 だん）。ゆみごとに かえる ときだけ `bow` を 書く
  yumi: {
    name: 'ゆみ',
    zukan: '［木｜き］と ［糸｜いと］で ［作｜つく］った ［弓｜ゆみ］。［矢｜や］を ［引｜ひ］いて はなせば、［遠｜とお］くの ようかいにも とどく。ねらいを よく さだめて。',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'weapon',
    info: {
      use: 'や を とばして とおく の ようかい を たおす。や が いる',
      how: BOW_HOW,
      buttons: ['1-9', 'left'],
      stats: 'bow',
    },
    wear: 384, // 384 かい
    recipe: { count: 1, inputs: [['log', 3], ['string', 3]] },
  },
  // や: ゆみが つかう。つかうと 1 こ へる（たいきゅうは なし）。1 マス 64 こ（BLOCK_MAX_STACK と 同じ）
  ya: {
    name: 'や',
    zukan: '［弓｜ゆみ］で とばす ［矢｜や］。［先｜さき］に ［石｜いし］、うしろに ［紙｜かみ］の ［羽｜はね］が ついて いて、まっすぐ とんで いく。',
    maxStack: 64,
    rarity: 'common',
    category: 'weapon',
    info: { use: 'ゆみ で とばす', how: 'もちもの に いれて おく だけ。ゆみ が つかう', buttons: [], stats: 'arrow' },
    recipe: { count: 4, inputs: [['log', 1], ['stone', 1], ['paper', 1]] }, // 4 こ できる
  },
} satisfies Record<BowId, ItemDef>;

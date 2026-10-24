import { COUNTRY_TABLE } from '../world/gen/countryTable';
import { CROP_KINDS, type AchievementCategory, type AchievementDef, type CropKind, type MedalTier, type StatKey } from '../contracts';

/**
 * 実績の表 180 こ（M6 §4.2）。表の順に並べる。名前はひらがな・カタカナ。漢字を書くなら ［漢字｜よみ］（WEAPON-7 §2.7。画面に出すときは `withRuby()`）。
 * id は `<シリーズ>.<段階の数>`（例 `break.dirt.10`）。
 */

export const CATEGORY_ORDER: readonly AchievementCategory[] = ['break', 'place', 'craft', 'collect', 'fight', 'level', 'adventure', 'places', 'farm'];

export const CATEGORY_LABEL: Readonly<Record<AchievementCategory, string>> = {
  break: 'こわす',
  place: 'おく',
  craft: 'つくる',
  collect: 'あつめる',
  fight: 'たたかう',
  level: 'レベル',
  adventure: 'ぼうけん',
  places: 'ばしょ',
  // M7（§4.7 の 9 こ目）
  farm: 'そだてる',
};

/** つくる 28（M4 の 20 ＋ たんす ＋ くわ ＋ M7-2 の じょうろ 2・スプリンクラー ＋ BAL-D の おの 3）。`craft.everything` の対象 */
export const CRAFT_RECIPE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['wood_pickaxe', 'きの つるはし'],
  ['stone_pickaxe', 'いしの つるはし'],
  ['iron_pickaxe', 'てつの つるはし'],
  ['wood_axe', 'きの おの'],
  ['stone_axe', 'いしの おの'],
  ['iron_axe', 'てつの おの'],
  ['furnace', 'かまど'],
  ['bokuto', 'ぼくとう'],
  ['katana', 'かたな'],
  ['naginata', 'なぎなた'],
  ['crystal_katana', 'きらめく カタナ'],
  ['yumi', 'ゆみ'],
  ['ya', 'や'],
  ['kabuto', 'かぶと'],
  ['yoroi', 'よろい'],
  ['kote', 'こて'],
  ['suneate', 'すねあて'],
  ['torch', 'たいまつ'],
  ['lantern', 'ちょうちん'],
  ['kite', 'たこ'],
  ['futon', 'ふとん'],
  ['omamori', 'おまもり'],
  ['waraji', 'わらじ'],
  ['tansu', 'たんす'],
  ['kuwa', 'くわ'],
  ['watering_can', 'じょうろ'],
  ['long_watering_can', 'ながい じょうろ'],
  ['sprinkler', 'スプリンクラー'],
];

/** BUCKET-1: バケツ。`craft.everything`（28）には 入れない（数が かわると もう とった メダルの id が 消える） */
const BUCKET_CRAFT_NAME = 'バケツ';

export const BAKE_RECIPE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['iron_ingot', 'てつの かたまり'],
  ['kawara', 'かわら'],
  ['brick', 'レンガ'],
  ['haniwa', 'はにわ'],
];

export const AXE_RECIPES = ['wood_axe', 'stone_axe', 'iron_axe'] as const;
export const PICKAXE_RECIPES = ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe'] as const;
/** WEAPON-7: レジェンダリー武器の 名前（［漢字｜よみ］）。順番 = 実績の 段の 順。PR2 で 風神剣・PR3 で 虹を 足す */
export const LEGEND_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['raijin_ken', '［雷神剣｜らいじんけん］'],
  ['fujin_ken', '［風神剣｜ふうじんけん］'],
  ['niji', '［虹｜にじ］'],
];

export const WEAPON_RECIPES = ['bokuto', 'katana', 'naginata', 'crystal_katana', 'yumi'] as const;
export const ARMOR_RECIPES = ['kabuto', 'yoroi', 'kote', 'suneate'] as const;
export const ARMOR_ITEMS = ARMOR_RECIPES;
/** GOLD-1: きん の そうび 8 こ（実績 `gold.*`。`CRAFT_RECIPE_NAMES` には 入れない） */
export const KIN_RECIPES = ['kin_katana', 'kin_yumi', 'kin_pickaxe', 'kin_axe', 'kin_kabuto', 'kin_yoroi', 'kin_kote', 'kin_suneate'] as const;
/** やさい 4 しゅるいの 名前（実績の文） */
export const CROP_NAME: Readonly<Record<CropKind, string>> = { onion: 'たまねぎ', tomato: 'トマト', pumpkin: 'かぼちゃ', eggplant: 'なす' };

export const VISIT_PLACES = ['mountain', 'forest', 'meadow', 'flat', 'spring', 'pond', 'river', 'sea', 'peak'] as const;

const BLOCK_NAME: Readonly<Record<string, string>> = {
  grass: 'くさ',
  dirt: 'つち',
  stone: 'いし',
  sand: 'すな',
  log: 'き',
  leaves: 'はっぱ',
  coal_ore: 'せきたん',
  iron_ore: 'てつ',
  kawara: 'かわら',
  brick: 'レンガ',
};

interface Tier {
  goal: number;
  small?: boolean;
}

interface SeriesSpec {
  series: string;
  category: AchievementCategory;
  stat: StatKey;
  tiers: Tier[];
  /** 段階 index（0 から）と目標から名前を作る */
  name: (goal: number, index: number) => string;
  /** COUNTRY-1: 新しくは 取れない 古い 実績 */
  legacy?: boolean;
}

function medalFor(index: number, count: number): MedalTier {
  if (count === 1) return 'gold';
  return (['bronze', 'silver', 'gold'] as const)[index] ?? 'rainbow';
}

const t = (goal: number, small = false): Tier => ({ goal, small });

/** 「はじめて 〇〇！」(目標 1) と「〇〇 {n} 〇〇！」を 切りかえる名前 */
const firstOrN = (first: string, many: (n: number) => string) => (goal: number): string => (goal === 1 ? first : many(goal));

function build(): AchievementDef[] {
  const specs: SeriesSpec[] = [];
  const add = (s: SeriesSpec): void => {
    specs.push(s);
  };

  // A. こわす
  for (const b of ['grass', 'dirt', 'stone', 'sand', 'log', 'leaves'] as const) {
    const n = BLOCK_NAME[b];
    add({
      series: `break.${b}`,
      category: 'break',
      stat: `break:${b}`,
      tiers: [t(1, true), t(10, true), t(100)],
      name: firstOrN(`はじめて ${n} ブロック を こわした！`, (g) => `${n} ブロック を ${g} こ こわした！`),
    });
  }
  add({
    series: 'break.coal_ore',
    category: 'break',
    stat: 'break:coal_ore',
    tiers: [t(1, true), t(10, true), t(50)],
    name: firstOrN('はじめて せきたん ブロック を こわした！', (g) => `せきたん ブロック を ${g} こ こわした！`),
  });
  add({
    series: 'break.iron_ore',
    category: 'break',
    stat: 'break:iron_ore',
    tiers: [t(1, true), t(10), t(50)],
    name: firstOrN('はじめて てつ ブロック を こわした！', (g) => `てつ ブロック を ${g} こ こわした！`),
  });
  add({
    series: 'break.all',
    category: 'break',
    stat: 'break:*',
    tiers: [t(100), t(500), t(1000), t(5000)],
    name: (g) => `ブロック を ${g} こ こわした！`,
  });

  // B. おく
  add({
    series: 'place.all',
    category: 'place',
    stat: 'place:*',
    tiers: [t(1, true), t(10, true), t(100), t(500), t(1000)],
    name: firstOrN('はじめて ブロック を おいた！', (g) => `ブロック を ${g} こ おいた！`),
  });
  for (const b of ['dirt', 'stone', 'log', 'sand', 'grass', 'leaves'] as const) {
    add({
      series: `place.${b}`,
      category: 'place',
      stat: `place:${b}`,
      tiers: [t(1, true)],
      name: () => `はじめて ${BLOCK_NAME[b]} ブロック を おいた！`,
    });
  }
  for (const b of ['kawara', 'brick'] as const) {
    add({
      series: `place.${b}`,
      category: 'place',
      stat: `place:${b}`,
      tiers: [t(1, true), t(10), t(100)],
      name: firstOrN(`はじめて ${BLOCK_NAME[b]} を おいた！`, (g) => `${BLOCK_NAME[b]} を ${g} こ おいた！`),
    });
  }
  add({ series: 'place.furnace', category: 'place', stat: 'place:furnace', tiers: [t(1, true)], name: () => 'はじめて かまど を おいた！' });
  add({
    series: 'place.torch',
    category: 'place',
    stat: 'place:torch',
    tiers: [t(1, true), t(10), t(50)],
    name: firstOrN('はじめて たいまつ を おいた！', (g) => `たいまつ を ${g} こ おいた！`),
  });
  add({ series: 'place.tansu', category: 'place', stat: 'place:tansu', tiers: [t(1, true)], name: () => 'はじめて たんす を おいた！' });

  // C. つくる
  for (const [id, name] of CRAFT_RECIPE_NAMES) {
    // BAL-D: おの 3 本 は 「ぜんぶ つくった」の 数に だけ 入れる（ひとつずつの 実績は ふやさない）
    if (AXE_RECIPES.includes(id as never)) continue;
    add({ series: `craft.${id}`, category: 'craft', stat: `craft:${id}`, tiers: [t(1, true)], name: () => `はじめて ${name} を つくった！` });
  }
  add({ series: 'craft.bucket', category: 'craft', stat: 'craft:bucket', tiers: [t(1, true)], name: () => `はじめて ${BUCKET_CRAFT_NAME} を つくった！` });
  // LIVE-1 版 3.2（§4.5）: むしとりあみ。小 ＋1。craft.everything（28）には 入れない（BUCKET-1 と 同じ）
  add({ series: 'craft.mushi_ami', category: 'craft', stat: 'craft:mushi_ami', tiers: [t(1, true)], name: () => 'はじめて むしとりあみ を つくった！' });
  // LIVE-2 版 3（§4.5）: こたつ・とりごや。小 ＋2。craft.everything（28）には 入れない（mushi_ami と 同じ）
  add({ series: 'craft.nukunuku', category: 'craft', stat: 'craft:nukunuku', tiers: [t(1, true)], name: () => 'はじめて こたつ を つくった！' });
  add({ series: 'craft.toriya', category: 'craft', stat: 'craft:toriya', tiers: [t(1, true)], name: () => 'はじめて とりごや を つくった！' });
  add({ series: 'craft.all', category: 'craft', stat: 'craft:*', tiers: [t(10), t(50), t(100), t(500)], name: (g) => `${g} かい つくった！` });
  add({ series: 'craft.pickaxes', category: 'craft', stat: 'craft:pickaxes', tiers: [t(PICKAXE_RECIPES.length)], name: () => 'つるはし を ぜんぶ つくった！' });
  add({ series: 'craft.weapons', category: 'craft', stat: 'craft:weapons', tiers: [t(WEAPON_RECIPES.length)], name: () => 'ぶき を ぜんぶ つくった！' });
  add({ series: 'craft.armors', category: 'craft', stat: 'craft:armors', tiers: [t(ARMOR_RECIPES.length)], name: () => 'ぼうぐ を ぜんぶ つくった！' });
  add({
    series: 'craft.everything',
    category: 'craft',
    stat: 'craft:everything',
    tiers: [t(CRAFT_RECIPE_NAMES.length)],
    name: () => 'つくれる もの を ぜんぶ つくった！',
  });
  add({ series: 'craft.ya', category: 'craft', stat: 'craftItems:ya', tiers: [t(100)], name: (g) => `や を ${g} ぽん つくった！` });

  // D. やく
  for (const [id, name] of BAKE_RECIPE_NAMES) {
    add({ series: `bake.${id}`, category: 'craft', stat: `bake:${id}`, tiers: [t(1, true)], name: () => `はじめて ${name} を やいた！` });
  }
  add({ series: 'bake.all', category: 'craft', stat: 'bake:*', tiers: [t(10), t(50), t(100)], name: (g) => `${g} かい やいた！` });
  add({
    series: 'bake.iron_ingot',
    category: 'craft',
    stat: 'bake:iron_ingot',
    tiers: [t(10), t(50)],
    name: (g) => `てつの かたまり を ${g} こ やいた！`,
  });
  // GOLD-1 §4.8: きん の そうび（大きい 実績）
  add({ series: 'gold.first', category: 'craft', stat: 'craft:kinKinds', tiers: [t(1)], name: () => 'はじめて きん の そうび を つくった！' });
  add({ series: 'gold.all', category: 'craft', stat: 'craft:kinKinds', tiers: [t(KIN_RECIPES.length)], name: (g) => `きん の そうび を ${g} こ ぜんぶ つくった！` });

  // E. あつめる
  for (const [id, name, small] of [
    ['paper', 'かみ', true],
    ['oil', 'あぶら', true],
    ['string', 'いと', true],
    ['cloth', 'ぬの', true],
    ['clay', 'ねんど', true],
    ['crystal', 'すいしょう', false],
  ] as const) {
    add({ series: `obtain.${id}`, category: 'collect', stat: `obtain:${id}`, tiers: [t(1, small)], name: () => `はじめて ${name} を てにいれた！` });
  }
  add({ series: 'obtain.all', category: 'collect', stat: 'pickup:*', tiers: [t(100), t(1000), t(10000)], name: (g) => `アイテム を ${g} こ ひろった！` });
  add({ series: 'obtain.bag', category: 'collect', stat: 'bagBack', tiers: [t(1)], name: () => 'おとしもの ぶくろ を とりもどした！' });
  add({ series: 'store.first', category: 'collect', stat: 'store:*', tiers: [t(1)], name: () => 'はじめて たんす に しまった！' });
  add({ series: 'store.full', category: 'collect', stat: 'storeFull', tiers: [t(1)], name: () => 'たんす を いっぱい に した！' });
  // GOLD-1 §4.8: ちょうど ほし 5（`epic`）の 物 が もちもの に 入った
  add({ series: 'rarity.star5', category: 'collect', stat: 'obtainRarity:epic', tiers: [t(1)], name: () => 'はじめて ほし 5 を ゲット！' });

  // F. たおす・G. まもる・やられる・や
  add({
    series: 'defeat.all',
    category: 'fight',
    stat: 'defeat:*',
    tiers: [t(1), t(10), t(50), t(100), t(500)],
    name: firstOrN('はじめて ようかい を たおした！', (g) => `ようかい を ${g} たい たおした！`),
  });
  for (const [kind, name] of [
    ['karakasa', 'からかさ'],
    ['chochin', 'ちょうちん'],
    ['nurikabe', 'ぬりかべ'],
    ['rokurokubi', 'ろくろくび'],
  ] as const) {
    add({
      series: `defeat.${kind}`,
      category: 'fight',
      stat: `defeat:${kind}`,
      tiers: [t(1), t(10), t(50)],
      name: firstOrN(`はじめて ${name} を たおした！`, (g) => `${name} を ${g} ひき たおした！`),
    });
  }
  add({
    series: 'defeat.low',
    category: 'fight',
    stat: 'defeatLow',
    tiers: [t(1), t(5), t(20)],
    name: firstOrN('ひんし で ようかい を たおした！', (g) => `ひんし で ようかい を ${g} ひき たおした！`),
  });
  for (const [w, text] of [
    ['hand', 'すで で ようかい を たおした！'],
    ['pickaxe', 'つるはし で ようかい を たおした！'],
    ['bokuto', 'ぼくとう で はじめて たおした！'],
    ['katana', 'かたな で はじめて たおした！'],
    ['naginata', 'なぎなた で はじめて たおした！'],
    ['crystal_katana', 'きらめく カタナ で はじめて たおした！'],
    ['yumi', 'ゆみ で はじめて たおした！'],
  ] as const) {
    add({ series: `defeat.with.${w}`, category: 'fight', stat: `defeatWith:${w}`, tiers: [t(1)], name: () => text });
  }
  // WEAPON-6: 3 段攻撃を ぜんぶ 当てた（小・なかま ぼうけん）
  add({ series: 'blade.combo3', category: 'fight', stat: 'bladeCombo3', tiers: [t(1, true)], name: () => 'はじめて 3 だん わざ を ぜんぶ あてた！' });
  add({ series: 'defeat.chain', category: 'fight', stat: 'chain', tiers: [t(1)], name: () => 'つづけて 3 びき たおした！' });
  add({
    series: 'guard.all',
    category: 'fight',
    stat: 'guard',
    tiers: [t(1), t(10), t(100)],
    name: firstOrN('はじめて カキン と ふせいだ！', (g) => `${g} かい ふせいだ！`),
  });
  for (const [id, name] of [
    ['kabuto', 'かぶと'],
    ['yoroi', 'よろい'],
    ['kote', 'こて'],
    ['suneate', 'すねあて'],
  ] as const) {
    add({ series: `wear.${id}`, category: 'fight', stat: `wear:${id}`, tiers: [t(1)], name: () => `はじめて ${name} を きた！` });
  }
  add({ series: 'wear.all', category: 'fight', stat: 'wearAll', tiers: [t(1)], name: () => 'ぼうぐ を ぜんぶ きた！' });
  add({
    series: 'death.all',
    category: 'fight',
    stat: 'death',
    tiers: [t(1), t(5), t(20)],
    name: firstOrN('はじめて やられた！（つぎは がんばろう）', (g) => `${g} かい やられた！（まけない！）`),
  });
  add({
    series: 'arrow.shot',
    category: 'fight',
    stat: 'arrowShot',
    tiers: [t(1), t(100)],
    name: firstOrN('はじめて や を とばした！', (g) => `や を ${g} ぽん とばした！`),
  });
  add({ series: 'arrow.hit', category: 'fight', stat: 'arrowHit', tiers: [t(10)], name: (g) => `や を ${g} かい あてた！` });
  // WEAPON-7 §2.5: レジェンダリー。1 本ごと（はじめて 手に 入れた）と しゅるいの 数。どれも 大きい 実績（小でない）。
  // 名前の 漢字は ［漢字｜よみ］。武器を 足す PR で `get.*` と `legend.kinds` の 段を 1 つずつ 足す
  for (const [id, name] of LEGEND_NAMES) {
    add({ series: `get.${id}`, category: 'fight', stat: `get:${id}`, tiers: [t(1)], name: () => `はじめて ${name} を てにいれた！` });
  }
  add({
    series: 'legend.kinds',
    category: 'fight',
    stat: 'legendKinds',
    tiers: LEGEND_NAMES.map((_, i) => t(i + 1)),
    name: firstOrN('レジェンダリー を てにいれた！', (g) => `レジェンダリー を ${g} つ あつめた！`),
  });

  // NINJA-1 §6 AC18: 忍者装備。はじめて 手に 入れた（大きい 実績・金メダル）と 4 しゅ ぜんぶ。legend.kinds・get.* には 数えない
  add({ series: 'ninja.first', category: 'fight', stat: 'ninjaKinds', tiers: [t(1)], name: () => 'はじめての ［忍者｜にんじゃ］［装備｜そうび］！' });
  add({ series: 'ninja.all', category: 'fight', stat: 'ninjaKinds', tiers: [t(4)], name: () => '［忍者｜にんじゃ］［装備｜そうび］を ぜんぶ あつめた！' });

  // #293: がしゃどくろ（ボス）を たおした。ふだんの ようかい（defeat.all）には 数えず、これ 1 つだけ（大きい 実績・金メダル）
  add({ series: 'defeat.gashadokuro', category: 'fight', stat: 'defeat:gashadokuro', tiers: [t(1)], name: () => 'がしゃどくろ を たおした！' });

  // H. レベル
  add({
    series: 'level',
    category: 'level',
    stat: 'level',
    tiers: [t(2), t(3), t(5), t(10), t(15), t(20), t(30), t(50)],
    name: (g) => `レベル ${g} に なった！`,
  });

  // I. ぼうけん
  const playNames = ['5 ふん あそんだ！', '15 ふん あそんだ！', '30 ぷん あそんだ！', '1 じかん あそんだ！', '3 じかん あそんだ！', '10 じかん あそんだ！'];
  add({
    series: 'play.time',
    category: 'adventure',
    stat: 'playTicks',
    tiers: [t(18000, true), t(54000), t(108000), t(216000), t(648000), t(2160000)],
    name: (_g, i) => playNames[i],
  });
  add({ series: 'night.first', category: 'adventure', stat: 'night', tiers: [t(1, true)], name: () => 'はじめて よる に なった！' });
  add({
    series: 'morning',
    category: 'adventure',
    stat: 'morning',
    tiers: [t(1), t(3), t(7), t(30)],
    name: firstOrN('はじめて あさ を むかえた！', (g) => `あさ を ${g} かい むかえた！`),
  });
  add({ series: 'walk', category: 'adventure', stat: 'walk', tiers: [t(100), t(1000), t(5000), t(20000)], name: (g) => `${g} ブロック あるいた！` });
  add({ series: 'jump', category: 'adventure', stat: 'jump', tiers: [t(100), t(1000)], name: (g) => `${g} かい ジャンプ した！` });
  add({ series: 'full', category: 'adventure', stat: 'full', tiers: [t(1)], name: () => 'もちもの が いっぱい に なった！' });
  add({ series: 'drop.first', category: 'adventure', stat: 'drop:*', tiers: [t(1, true)], name: () => 'はじめて アイテム を すてた！' });
  // WEAPON-2（§4.6 (9)）: 道具が こわれた・へった たいきゅうの 合計・防具が こわれた（「つかいきった」と 前向きに）
  add({
    series: 'tool.broken',
    category: 'adventure',
    stat: 'toolBroken',
    tiers: [t(1, true), t(10)],
    name: firstOrN('はじめて どうぐ を つかいきった！', (g) => `どうぐ を ${g} こ つかいきった！`),
  });
  add({ series: 'tool.wearAll', category: 'adventure', stat: 'wearTotal', tiers: [t(1000)], name: (g) => `どうぐ を ${g} かい つかった！` });
  add({ series: 'armor.broken', category: 'adventure', stat: 'armorBroken', tiers: [t(1)], name: () => 'ぼうぐ が みを まもって くれた！' });

  // J. ばしょ（COUNTRY-1: 12 の国。古い 7 つと ぜんぶの ばしょは legacy = 新しくは 取れない・取った物だけ のこる）
  for (const [id, name] of [
    ['mountain', 'やま'],
    ['forest', 'もり'],
    ['meadow', 'くさはら'],
    ['flat', 'ひらち'],
    ['spring', 'いずみ'],
    ['pond', 'いけ'],
    ['river', 'かわ'],
  ] as const) {
    add({ series: `visit.${id}`, category: 'places', stat: `visit:${id}`, tiers: [t(1)], name: () => `はじめて ${name} に きた！`, legacy: true });
  }
  add({ series: 'visit.sea', category: 'places', stat: 'visit:sea', tiers: [t(1)], name: () => 'はじめて うみ に はいった！' });
  add({ series: 'visit.peak', category: 'places', stat: 'visit:peak', tiers: [t(1)], name: () => 'やま の てっぺん に のぼった！' });
  add({ series: 'visit.all', category: 'places', stat: 'visit:all', tiers: [t(VISIT_PLACES.length)], name: () => 'ぜんぶ の ばしょ に いった！', legacy: true });
  for (const r of COUNTRY_TABLE) {
    add({ series: `visit.country.${r.kind}`, category: 'places', stat: `country:${r.kind}`, tiers: [t(1)], name: () => `はじめて ${r.yomi} に きた！` });
  }
  add({ series: 'visit.countries', category: 'places', stat: 'country:all', tiers: [t(COUNTRY_TABLE.length)], name: () => 'ぜんぶの くに に いった！' });

  // K. そだてる（M7 §4.7）
  add({
    series: 'farm.till',
    category: 'farm',
    stat: 'till',
    tiers: [t(1, true), t(10, true), t(100)],
    name: firstOrN('はじめて はたけ を たがやした！', (g) => `はたけ を ${g} こ たがやした！`),
  });
  add({
    series: 'farm.plant',
    category: 'farm',
    stat: 'plant:*',
    tiers: [t(1, true), t(10), t(100)],
    name: firstOrN('はじめて たね を まいた！', (g) => `たね を ${g} こ まいた！`),
  });
  add({
    series: 'farm.harvest',
    category: 'farm',
    stat: 'harvest:*',
    tiers: [t(1), t(10), t(100)],
    name: firstOrN('はじめて しゅうかく した！', (g) => `${g} かい しゅうかく した！`),
  });
  for (const k of CROP_KINDS) {
    add({
      series: `harvest.${k}`,
      category: 'farm',
      stat: `harvest:${k}`,
      tiers: [t(1, true)],
      name: () => `はじめて ${CROP_NAME[k]} を しゅうかく した！`,
    });
  }
  add({ series: 'harvest.kinds', category: 'farm', stat: 'harvest:kinds', tiers: [t(CROP_KINDS.length)], name: () => 'やさい を ぜんぶ そだてた！' });
  add({ series: 'farm.wet', category: 'farm', stat: 'harvestWet', tiers: [t(1, true)], name: () => 'みず の そば で そだてた！' });
  add({
    series: 'eat.all',
    category: 'farm',
    stat: 'eat:*',
    tiers: [t(1, true), t(10), t(100)],
    name: firstOrN('はじめて やさい を たべた！', (g) => `${g} かい たべた！`),
  });
  add({ series: 'find.oldfarm', category: 'farm', stat: 'visit:oldfarm', tiers: [t(1)], name: () => 'ふるい はたけ を みつけた！' });
  add({ series: 'find.oldfarmSeed', category: 'farm', stat: 'seedFrom:oldfarm', tiers: [t(1)], name: () => 'ふるい たんす で たね を みつけた！' });
  add({
    series: 'find.wild',
    category: 'farm',
    stat: 'wild:*',
    tiers: [t(1), t(10)],
    name: firstOrN('はじめて やせいの やさい を みつけた！', (g) => `やせいの やさい を ${g} こ みつけた！`),
  });
  add({ series: 'find.wildKinds', category: 'farm', stat: 'wild:kinds', tiers: [t(CROP_KINDS.length)], name: () => 'やせいの やさい を 4 しゅるい みつけた！' });
  add({ series: 'find.grass', category: 'farm', stat: 'seedFrom:grass', tiers: [t(1, true)], name: () => 'くさ から たね が でた！' });
  add({ series: 'find.yokai', category: 'farm', stat: 'seedFrom:yokai', tiers: [t(1)], name: () => 'ようかい が たね を おとした！' });
  add({ series: 'find.all', category: 'farm', stat: 'seedFrom:all', tiers: [t(4)], name: () => 'たね の ありか を ぜんぶ みつけた！' });
  // M7-2（§4.7）。M7 の 行 の うしろ に この 順
  add({
    series: 'farm.water',
    category: 'farm',
    stat: 'water:*',
    tiers: [t(1, true), t(10), t(100)],
    name: firstOrN('はじめて みずやり した！', (g) => `${g} かい みずやり した！`),
  });
  add({ series: 'farm.sprinkler', category: 'farm', stat: 'place:sprinkler', tiers: [t(1)], name: () => 'はじめて スプリンクラー を おいた！' });
  add({
    series: 'farm.pet',
    category: 'farm',
    stat: 'pet:*',
    tiers: [t(1, true), t(10), t(100)],
    name: firstOrN('はじめて やさい を なでた！', (g) => `やさい を ${g} かい なでた！`),
  });
  add({ series: 'farm.petHarvest', category: 'farm', stat: 'harvestPet', tiers: [t(1)], name: () => 'ごきげん の やさい を しゅうかく した！' });
  // BUCKET-1: そだてる の いちばん うしろ（小 では ない）
  add({ series: 'farm.bucket', category: 'farm', stat: 'bucketPlace', tiers: [t(1)], name: () => 'はじめて バケツ で みず を おいた！' });
  // LIVE-1（§4.5）。そだてる の 今の 行 の うしろ に この 順（12 こ・小 3）
  add({
    series: 'animal.friend',
    category: 'farm',
    stat: 'friend:*',
    tiers: [t(1), t(5)],
    name: firstOrN('はじめて なかま が できた！', (g) => `なかま が ${g} わ に なった！`),
  });
  add({
    series: 'animal.feed',
    category: 'farm',
    stat: 'feed:*',
    tiers: [t(1, true), t(10), t(50)],
    name: firstOrN('はじめて にわとり に むし を あげた！', (g) => `むし を ${g} かい あげた！`),
  });
  add({
    series: 'animal.pet',
    category: 'farm',
    stat: 'petAnimal:*',
    tiers: [t(1, true), t(10), t(100)],
    name: firstOrN('はじめて なかま を なでた！', (g) => `なかま を ${g} かい なでた！`),
  });
  add({
    series: 'animal.egg',
    category: 'farm',
    stat: 'egg:*',
    tiers: [t(1), t(10), t(50)],
    name: firstOrN('はじめて たまご が うまれた！', (g) => `たまご が ${g} こ うまれた！`),
  });
  add({ series: 'animal.eatEgg', category: 'farm', stat: 'eat:egg', tiers: [t(1, true)], name: () => 'はじめて たまご を たべた！' });
  // LIVE-3（§4.5）: eatEgg の すぐ うしろ。「いただきます」その もの の 実績 は 作らない（命 を ごほうび に しない）
  add({ series: 'animal.eatMeat', category: 'farm', stat: 'eat:momo_yaki', tiers: [t(1, true)], name: () => 'はじめて やいた もも にく を たべた！' });
  // LIVE-4（§4.5）: eatMeat の すぐ うしろ。マッチョ の パンチ で はじめて たおした とき の 小さな おめでとう
  add({ series: 'animal.machoKO', category: 'farm', stat: 'machoKO:*', tiers: [t(1, true)], name: () => 'はじめて マッチョ と いっしょ に ようかい を たおした！' });
  // 版 3.2（§4.5）: eatEgg の うしろ に bug・carry の 順（小 では ない）
  add({
    series: 'animal.bug',
    category: 'farm',
    stat: 'bug:*',
    tiers: [t(1), t(10), t(50)],
    name: firstOrN('はじめて むし を とった！', (g) => `むし を ${g} ひき とった！`),
  });
  add({
    series: 'animal.carry',
    category: 'farm',
    stat: 'carry:*',
    tiers: [t(1), t(10)],
    name: firstOrN('はじめて だっこ した！', (g) => `${g} かい だっこ した！`),
  });
  // LIVE-2 版 3（§4.5）: animal.carry の うしろ に この 順（9 こ・小 1）
  add({ series: 'animal.coop', category: 'farm', stat: 'place:toriya', tiers: [t(1)], name: () => 'はじめて とりごや を たてた！' });
  add({ series: 'animal.home', category: 'farm', stat: 'home:*', tiers: [t(1, true)], name: () => 'はじめて とりごや の こ が できた！' });
  add({
    series: 'animal.hatch',
    category: 'farm',
    stat: 'hatch:*',
    tiers: [t(1), t(5)],
    name: firstOrN('はじめて ひよこ が かえった！', (g) => `ひよこ が ${g} わ かえった！`),
  });
  add({
    series: 'animal.grow',
    category: 'farm',
    stat: 'grow:*',
    tiers: [t(1), t(5)],
    name: firstOrN('はじめて おとな に なった！', (g) => `${g} わ おとな に なった！`),
  });
  add({
    series: 'animal.goldenEgg',
    category: 'farm',
    stat: 'goldenEgg:*',
    tiers: [t(1), t(5)],
    name: firstOrN('はじめて きん の たまご！', (g) => `きん の たまご を ${g} こ！`),
  });
  add({ series: 'animal.macho', category: 'farm', stat: 'hatch:macho', tiers: [t(1)], name: () => 'マッチョ ひよこ が かえった！' });
  // GOLD-1 §4.8: はらぱんみみず を ひろった
  add({ series: 'obtain.harapan_mimizu', category: 'farm', stat: 'obtain:harapan_mimizu', tiers: [t(1)], name: () => 'はじめて はらぱんみみず を てにいれた！' });

  const out: AchievementDef[] = [];
  for (const s of specs) {
    s.tiers.forEach((tier, i) => {
      out.push({
        id: `${s.series}.${tier.goal}`,
        series: s.series,
        category: s.category,
        stat: s.stat,
        goal: tier.goal,
        tier: i + 1,
        medal: medalFor(i, s.tiers.length),
        small: !!tier.small,
        name: s.name(tier.goal, i),
        ...(s.legacy ? { legacy: true } : {}),
      });
    });
  }
  return out;
}

export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = build();

export const DEF_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(ACHIEVEMENT_DEFS.map((d) => [d.id, d]));
export const DEF_INDEX: ReadonlyMap<string, number> = new Map(ACHIEVEMENT_DEFS.map((d, i) => [d.id, i]));

/** 記録のキー → その記録を目標にする実績（目標の小さい順） */
export const DEFS_BY_STAT: ReadonlyMap<string, readonly AchievementDef[]> = (() => {
  const m = new Map<string, AchievementDef[]>();
  for (const d of ACHIEVEMENT_DEFS) {
    const l = m.get(d.stat) ?? [];
    l.push(d);
    m.set(d.stat, l);
  }
  for (const l of m.values()) l.sort((a, b) => a.goal - b.goal);
  return m;
})();

export const MEDAL_RANK: Readonly<Record<MedalTier, number>> = { bronze: 0, silver: 1, gold: 2, rainbow: 3 };

import { CROP_KINDS, type AchievementCategory, type AchievementDef, type CropKind, type MedalTier, type StatKey } from '../contracts';

/**
 * 実績の表 180 こ（M6 §4.2）。表の順に並べる。名前はひらがな・カタカナだけ（漢字なし）。
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

/** つくる 25（M4 の 20 ＋ たんす ＋ くわ ＋ M7-2 の じょうろ 2・スプリンクラー）。`craft.everything` の対象 */
export const CRAFT_RECIPE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['wood_pickaxe', 'きの つるはし'],
  ['stone_pickaxe', 'いしの つるはし'],
  ['iron_pickaxe', 'てつの つるはし'],
  ['furnace', 'かまど'],
  ['bokuto', 'ぼくとう'],
  ['katana', 'かたな'],
  ['naginata', 'なぎなた'],
  ['crystal_katana', 'きらきらの かたな'],
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

export const BAKE_RECIPE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['iron_ingot', 'てつの かたまり'],
  ['kawara', 'かわら'],
  ['brick', 'レンガ'],
  ['haniwa', 'はにわ'],
];

export const PICKAXE_RECIPES = ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe'] as const;
export const WEAPON_RECIPES = ['bokuto', 'katana', 'naginata', 'crystal_katana', 'yumi'] as const;
export const ARMOR_RECIPES = ['kabuto', 'yoroi', 'kote', 'suneate'] as const;
export const ARMOR_ITEMS = ARMOR_RECIPES;
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
    add({ series: `craft.${id}`, category: 'craft', stat: `craft:${id}`, tiers: [t(1, true)], name: () => `はじめて ${name} を つくった！` });
  }
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
    ['crystal_katana', 'きらきらの かたな で はじめて たおした！'],
    ['yumi', 'ゆみ で はじめて たおした！'],
  ] as const) {
    add({ series: `defeat.with.${w}`, category: 'fight', stat: `defeatWith:${w}`, tiers: [t(1)], name: () => text });
  }
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

  // J. ばしょ
  for (const [id, name] of [
    ['mountain', 'やま'],
    ['forest', 'もり'],
    ['meadow', 'くさはら'],
    ['flat', 'ひらち'],
    ['spring', 'いずみ'],
    ['pond', 'いけ'],
    ['river', 'かわ'],
  ] as const) {
    add({ series: `visit.${id}`, category: 'places', stat: `visit:${id}`, tiers: [t(1)], name: () => `はじめて ${name} に きた！` });
  }
  add({ series: 'visit.sea', category: 'places', stat: 'visit:sea', tiers: [t(1)], name: () => 'はじめて うみ に はいった！' });
  add({ series: 'visit.peak', category: 'places', stat: 'visit:peak', tiers: [t(1)], name: () => 'やま の てっぺん に のぼった！' });
  add({ series: 'visit.all', category: 'places', stat: 'visit:all', tiers: [t(VISIT_PLACES.length)], name: () => 'ぜんぶ の ばしょ に いった！' });

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

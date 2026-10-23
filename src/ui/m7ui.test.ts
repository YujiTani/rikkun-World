import { describe, expect, it } from 'vitest';
import type { FarmEvent, ItemId } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { ACHIEVEMENT_DEFS, CRAFT_RECIPE_NAMES } from '../achievements/defs';

import { FarmFx } from '../fx/farmFx';
import { FARM_SOUNDS } from '../fx/farmSounds';
import { HELD_MODELS } from '../camera/heldTools';
import { buildTooltip } from './tooltipModel';
import { farmAimView } from './farmAimModel';
import { FARM_HINT_STEPS, FARM_HINT_VIEW, FarmHintModel } from './farmHintModel';
import { M7_ITEMS, farmExtraPixels, m7ItemPixels } from './itemArtM7';
import { itemIconPixels } from './itemIcon';
import { findUnrubiedKanji } from './text';

const at = { x: 1, y: 2, z: 3, tick: 5 };

describe('M7 アイテムの絵（§3.2 (3)）', () => {
  it('9 こ ぜんぶ ちがう絵で、まわりが こい色 #2A1E14 でふちどられる', () => {
    const keys = new Set<string>();
    for (const id of M7_ITEMS) {
      const px = m7ItemPixels(id);
      expect(px.length).toBe(256);
      keys.add(px.map((p) => p.join(',')).join(';'));
      expect(itemIconPixels(id)).toBe(px);
      const edge = px.filter((p) => p[3] > 0 && p[0] === 0x2a && p[1] === 0x1e && p[2] === 0x14);
      expect(edge.length, id).toBeGreaterThan(10);
      expect(px.filter((p) => p[3] > 0).length, id).toBeGreaterThan(40);
    }
    expect(keys.size).toBe(9);
  });
  it('しずく・月の絵', () => {
    expect(farmExtraPixels('droplet').filter((p) => p[3] > 0).length).toBeGreaterThan(30);
    expect(farmExtraPixels('moon').some((p) => p[0] === 0xff && p[1] === 0xd5 && p[2] === 0x4f)).toBe(true);
  });
  it('手に持つ模型が 9 こある', () => {
    for (const id of M7_ITEMS) expect(HELD_MODELS[id], id).toBeTruthy();
  });
});

describe('ツールチップの「できること」（§4.8）', () => {
  const d = {
    nameOf: (i: string) => i,
    rarityOf: () => 'common' as const,
    placeable: () => false,
    recipes: () => [],
  };
  it('くわ・たね・やさい', () => {
    expect(buildTooltip('kuwa', d).lines).toContain('はたけ を つくる');
    expect(buildTooltip('seed_tomato', d).lines).toContain('はたけ に まく');
    expect(buildTooltip('pumpkin', d).lines).toContain('たべると ハート が もどる');
    expect(buildTooltip('dirt', d).lines).not.toContain('はたけ に まく');
  });
});

describe('合図（§3.3）', () => {
  it('120 ステップで 消え、同じ合図は のこり時間を もどすだけ', () => {
    const m = new FarmHintModel();
    m.feed([{ type: 'hint', hint: 'till', ...at }]);
    for (let i = 0; i < 100; i++) m.step();
    expect(m.current()).toBe('till');
    m.show('till');
    expect(m.stepsLeft()).toBe(FARM_HINT_STEPS);
    for (let i = 0; i < FARM_HINT_STEPS; i++) m.step();
    expect(m.current()).toBeNull();
  });
  it('文は 漢字に ふりがな付き', () => {
    for (const k of ['till', 'full'] as const) expect(findUnrubiedKanji(FARM_HINT_VIEW[k].html)).toEqual([]);
    expect(FARM_HINT_VIEW.till.html).toContain('<ruby>土<rt>つち</rt></ruby>');
    expect(FARM_HINT_VIEW.full.html).toContain('ハート が いっぱい だから いまは たべられないよ');
  });
});

describe('ねらった作物の しるし（§3.4）', () => {
  it('段階 1 は 2 つ みどり、みのったら 4 つ 金色', () => {
    expect(farmAimView({ dots: 2, ripe: false, wet: false, dark: false })!.dots).toEqual(['ok', 'ok', 'empty', 'empty']);
    expect(farmAimView({ dots: 4, ripe: true, wet: true, dark: false })).toMatchObject({ dots: ['gold', 'gold', 'gold', 'gold'], droplet: true });
    expect(farmAimView(null)).toBeNull();
  });
  it('くらい とき: うすく・月・文。みのった作物には 出さない', () => {
    const v = farmAimView({ dots: 1, ripe: false, wet: false, dark: true })!;
    expect(v).toMatchObject({ dim: true, moon: true, darkText: 'くらい と そだたない よ', droplet: false });
    expect(farmAimView({ dots: 4, ripe: true, wet: false, dark: true })).toMatchObject({ dim: false, moon: false, darkText: null });
    expect(farmAimView({ dots: 0, ripe: false, wet: true, dark: false })!.soilOnly).toBe(true);
  });
});

describe('案内の本の そだてる 章（§3.7）', () => {
  it('12 こ（M7-2 で 3 こ・BUCKET-1 で 1 こ・BOOK-1 で 分けて 12）で 漢字は ふりがな付き', () => {
    expect(BOOK_CHAPTERS.find((c) => c.id === 'grow')!.label).toBe('そだてる');
    const items = BOOK_ITEMS.filter((i) => i.chapter === 'grow');
    expect(items.length).toBe(15);
    for (const i of items) expect(findUnrubiedKanji(i.caption)).toEqual([]);
  });
});

describe('農業の出来事 → 音・つぶ・合図・実績', () => {
  const ev = (e: Omit<FarmEvent, 'tick' | 'x' | 'y' | 'z'> & Record<string, unknown>): FarmEvent => ({ ...at, ...e }) as FarmEvent;
  it('音の ふりわけ。段階が変わっても 音なし', () => {
    const tones: unknown[] = [];
    const hints: string[] = [];
    const bursts: number[] = [];
    const fx = new FarmFx({
      sound: { playTones: (t) => tones.push(t) },
      hint: { show: (k) => hints.push(k) },
      particles: { burstHex: (_b, hex) => bursts.push(hex) },
    });
    fx.feed([
      ev({ type: 'till' }),
      ev({ type: 'tillPress', count: 1 }),
      ev({ type: 'plant', kind: 'tomato' }),
      ev({ type: 'stage', kind: 'tomato', from: 0, to: 1 }),
      ev({ type: 'harvest', kind: 'tomato', veg: 1, seeds: 1, wet: false }),
      ev({ type: 'wild', kind: 'pumpkin', seeds: 1 }),
      ev({ type: 'notRipe', kind: 'onion' }),
      ev({ type: 'eat', item: 'tomato', heal: 2 }),
      ev({ type: 'seedFound', from: 'grass', item: 'seed_onion' }),
      ev({ type: 'hint', hint: 'full' }),
    ]);
    expect(fx.played).toEqual(['till', 'tillPress', 'plant', 'harvest', 'wild', 'notRipe', 'eat', 'seedFound']);
    expect(hints).toEqual(['full']);
    expect(bursts.length).toBe(4);
    expect(FARM_SOUNDS.harvest.length).toBe(3); // ポン + チャイム 2
    expect(FARM_SOUNDS.wild.length).toBe(4); // ポン + チャイム 3
    expect(FARM_SOUNDS.tillPress[0].gain).toBeLessThan(FARM_SOUNDS.till[0].gain);
  });
});

describe('実績 そだてる（§4.7）', () => {
  const mk = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
  const ev = (e: Record<string, unknown>): FarmEvent => ({ ...at, ...e }) as FarmEvent;
  it('数: 分類そだてる 62・小 17（LIVE-3 で +1・+1、LIVE-1 で +12・+3、版 3.2 で +5・+0、LIVE-2 で +9・+1）、つくる に くわ（つくれる もの 28）', () => {
    const farm = ACHIEVEMENT_DEFS.filter((d) => d.category === 'farm');
    expect(farm.length).toBe(62); // LIVE-1 §4.5: 35 + 12 + 5 + LIVE-2 の 9 + LIVE-3 の 1
    expect(farm.filter((d) => d.small).length).toBe(17); // 12 + 3 + 1 + LIVE-3 の 1
    expect(CRAFT_RECIPE_NAMES.length).toBe(28);
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'craft.kuwa.1')).toMatchObject({ category: 'craft', small: true });
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'craft.everything.28')).toBeTruthy();
    expect(farm.some((d) => /[一-鿿]/.test(d.name))).toBe(false);
  });
  it('1 回目で 取れる', () => {
    const s = mk();
    s.feedFarm([
      ev({ type: 'till' }),
      ev({ type: 'plant', kind: 'tomato' }),
      ev({ type: 'harvest', kind: 'tomato', veg: 1, seeds: 1, wet: true }),
      ev({ type: 'eat', item: 'tomato', heal: 2 }),
    ]);
    for (const id of ['farm.till.1', 'farm.plant.1', 'farm.harvest.1', 'harvest.tomato.1', 'farm.wet.1', 'eat.all.1']) expect(s.isUnlocked(id), id).toBe(true);
    expect(s.isUnlocked('harvest.kinds.4')).toBe(false);
  });
  it('4 しゅるい しゅうかく・やせいは harvest:* を ふやさない・4 つの ありかで find.all', () => {
    const s = mk();
    for (const kind of ['onion', 'tomato', 'pumpkin', 'eggplant']) s.feedFarm([ev({ type: 'harvest', kind, veg: 1, seeds: 1, wet: false })]);
    expect(s.isUnlocked('harvest.kinds.4')).toBe(true);
    expect(s.stat('harvest:*')).toBe(4);
    for (const kind of ['onion', 'tomato', 'pumpkin', 'eggplant']) s.feedFarm([ev({ type: 'wild', kind, seeds: 1 })]);
    expect(s.stat('harvest:*')).toBe(4);
    expect(s.isUnlocked('find.wild.1')).toBe(true);
    expect(s.isUnlocked('find.wildKinds.4')).toBe(true);
    expect(s.isUnlocked('find.all.4')).toBe(false);
    s.feedFarm([ev({ type: 'visitOldFarm' }), ev({ type: 'seedFound', from: 'oldfarm', item: 'seed_onion' }), ev({ type: 'seedFound', from: 'grass', item: 'seed_onion' })]);
    expect(s.isUnlocked('find.oldfarm.1')).toBe(true);
    expect(s.isUnlocked('find.oldfarmSeed.1')).toBe(true);
    expect(s.isUnlocked('find.grass.1')).toBe(true);
    expect(s.isUnlocked('find.all.4')).toBe(false);
    s.feedFarm([ev({ type: 'seedFound', from: 'yokai', item: 'seed_tomato' })]);
    expect(s.isUnlocked('find.yokai.1')).toBe(true);
    expect(s.isUnlocked('find.all.4')).toBe(true);
  });
});

import { createDefaultItemInfo } from '../craft/info/build';
const bookMod = (await import('./book/bookData')) as any;
const BOOK_CHAPTERS: any[] = bookMod.BOOK_CHAPTERS;
const BOOK_ITEMS: any[] = bookMod.BOOK_ITEMS;

describe('説明の表 M7（どこで・そだつ はやさ）', () => {
  const info = createDefaultItemInfo((i) => i as string);
  it('たね: 手に入れかたと はやさ（トマト 3・たまねぎ／なす 2・かぼちゃ 1）', () => {
    const speed = (id: ItemId) => info.info(id).stats.find((s) => s.key === 'grow');
    expect(speed('seed_tomato')).toMatchObject({ value: 3, max: 3, label: 'そだつ はやさ' });
    expect(speed('seed_onion')!.value).toBe(2);
    expect(speed('seed_eggplant')!.value).toBe(2);
    expect(speed('seed_pumpkin')!.value).toBe(1);
    expect(info.info('seed_onion').source).toContain('くさ を こわす');
    expect(info.info('tomato').source).toContain('しゅうかく');
    expect(info.info('tomato').stats).toEqual([]);
  });
});

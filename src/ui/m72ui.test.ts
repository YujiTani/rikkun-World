import { describe, expect, it } from 'vitest';
import type { FarmEvent } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';

import { FarmFx } from '../fx/farmFx';
import { FARM_SOUNDS } from '../fx/farmSounds';
import { actionHintLines } from './actionHintModel';
import { WET_SOON_OPACITY, farmAimView } from './farmAimModel';
import { FARM_HINT_STEPS, FARM_HINT_VIEW, FarmHintModel } from './farmHintModel';
import { findUnrubiedKanji } from './text';
// @ts-ignore 実装前は ファイルが ない（BOOK-1。bookData.ts ができたら 型も 付く）
const bookMod = (await import('./book/bookData')) as any;
const BOOK_ITEMS: any[] = bookMod.BOOK_ITEMS;

const at = { x: 1, y: 2, z: 3, tick: 5 };
const ev = (e: Record<string, unknown>): FarmEvent => ({ ...at, ...e }) as FarmEvent;
const mk = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));

describe('M7-2 実績（AC21・§4.7）', () => {
  it('数の表: そだてる +8、つくる +3、ぜんぶ 224・小 79', () => {
    const cnt = (cat: string) => ACHIEVEMENT_DEFS.filter((d) => d.category === cat).length;
    expect(cnt('farm')).toBe(26 + 8 + 1);
    expect(ACHIEVEMENT_DEFS.length).toBe(224);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.small).length).toBe(79);
    for (const id of ['craft.watering_can.1', 'craft.long_watering_can.1', 'craft.sprinkler.1']) {
      expect(ACHIEVEMENT_DEFS.find((d) => d.id === id)).toMatchObject({ category: 'craft', small: true });
    }
  });
  it('そだてる の 並び: M7 の 行 の うしろ に water・sprinkler・pet・petHarvest の 順、名前 に 漢字 なし', () => {
    const farm = ACHIEVEMENT_DEFS.filter((d) => d.category === 'farm');
    expect(farm.slice(-9, -1).map((d) => d.id)).toEqual([
      'farm.water.1',
      'farm.water.10',
      'farm.water.100',
      'farm.sprinkler.1',
      'farm.pet.1',
      'farm.pet.10',
      'farm.pet.100',
      'farm.petHarvest.1',
    ]);
    expect(farm[farm.length - 1].id).toBe('farm.bucket.1');
    expect(farm.slice(-9, -1).filter((d) => d.small).map((d) => d.id)).toEqual(['farm.water.1', 'farm.pet.1']);
    expect(farm.some((d) => /[一-鿿]/.test(d.name))).toBe(false);
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'farm.water.10')?.name).toBe('10 かい みずやり した！');
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'farm.pet.10')?.name).toBe('やさい を 10 かい なでた！');
  });
  it('まく（はたけ 1 つ 以上）・なでる（happy）・しゅうかく（ごきげん）・スプリンクラー', () => {
    const s = mk();
    s.feedFarm([ev({ type: 'pour', item: 'watering_can', tiles: 1 }), ev({ type: 'pet', result: 'happy' })]);
    s.feedDig([{ type: 'place', tick: 1, block: { x: 0, y: 0, z: 0 }, id: 'sprinkler' }]);
    s.feedFarm([ev({ type: 'harvest', kind: 'tomato', veg: 1, seeds: 1, wet: false, happy: true })]);
    expect(s.stat('water:*')).toBe(1);
    expect(s.stat('pet:*')).toBe(1);
    expect(s.stat('harvestPet')).toBe(1);
    expect(s.stat('place:sprinkler')).toBe(1);
    for (const id of ['farm.water.1', 'farm.pet.1', 'farm.petHarvest.1', 'farm.sprinkler.1']) expect(s.isUnlocked(id), id).toBe(true);
  });
  it('はたけ 0 の まく・again・wild・ごきげん でない しゅうかく は 数えない', () => {
    const s = mk();
    s.feedFarm([
      ev({ type: 'pour', item: 'watering_can', tiles: 0 }),
      ev({ type: 'pet', result: 'again' }),
      ev({ type: 'pet', result: 'wild' }),
      ev({ type: 'harvest', kind: 'tomato', veg: 1, seeds: 1, wet: false }),
      ev({ type: 'fill', item: 'watering_can', water: 10 }),
    ]);
    expect(s.stat('water:*')).toBe(0);
    expect(s.stat('pet:*')).toBe(0);
    expect(s.stat('harvestPet')).toBe(0);
  });
  it('つくる 3 つ で craft.everything は 28 が 目標', () => {
    const s = mk();
    for (const recipe of ['watering_can', 'long_watering_can', 'sprinkler'])
      s.feedCraft([{ type: 'craft', tick: 1, recipe, item: recipe, count: 1 } as never]);
    for (const id of ['craft.watering_can.1', 'craft.long_watering_can.1', 'craft.sprinkler.1']) expect(s.isUnlocked(id), id).toBe(true);
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'craft.everything.28')).toBeTruthy();
  });
});

describe('M7-2 音・つぶ・合図（AC15・AC4・AC25）', () => {
  const rig = () => {
    const tones: unknown[] = [];
    const hints: string[] = [];
    const pets: string[] = [];
    const fx = new FarmFx({
      sound: { playTones: (t) => tones.push(t) },
      hint: { show: (k) => hints.push(k) },
      sparkle: { onPet: (x, y, z, r) => pets.push(`${x},${y},${z} ${r}`) },
    });
    return { fx, tones, hints, pets };
  };
  it('音の ふりわけ', () => {
    const { fx, hints, pets } = rig();
    fx.feed([
      ev({ type: 'fill', item: 'watering_can', water: 10 }),
      ev({ type: 'fill', item: 'watering_can', water: 10, wasFull: true }),
      ev({ type: 'pour', item: 'watering_can', tiles: 0 }),
      ev({ type: 'hint', hint: 'fill' }),
      ev({ type: 'sprinklerPlaced' }),
      ev({ type: 'sprinklerBroken' }),
      ev({ type: 'pet', result: 'happy' }),
      ev({ type: 'pet', result: 'again' }),
      ev({ type: 'pet', result: 'wild' }),
    ]);
    expect(fx.played).toEqual(['fill', 'fullCan', 'pour', 'empty', 'sprinklerPlace', 'pet', 'petAgain', 'petAgain']);
    expect(hints).toEqual(['fill']);
    expect(pets).toEqual(['1,2,3 happy', '1,2,3 again', '1,2,3 wild']);
  });
  it('音の 長さ: ゴボゴボ 0.3 秒・シャーッ 0.4 秒・スプリンクラー 0.6 秒、ふわっ♪ は 上がる 2 音', () => {
    const end = (t: readonly { delay: number; dur: number }[]) => Math.max(...t.map((x) => x.delay + x.dur));
    expect(end(FARM_SOUNDS.fill)).toBeCloseTo(0.3, 1);
    expect(end(FARM_SOUNDS.pour)).toBeGreaterThanOrEqual(0.4);
    expect(end(FARM_SOUNDS.pour)).toBeLessThan(0.5);
    expect(end(FARM_SOUNDS.sprinklerPlace)).toBeGreaterThan(end(FARM_SOUNDS.pour));
    expect(FARM_SOUNDS.pet.length).toBe(2);
    expect(FARM_SOUNDS.pet[1].f0).toBeGreaterThan(FARM_SOUNDS.pet[0].f0);
    expect(FARM_SOUNDS.petAgain.length).toBe(1);
  });
  it('合図 fill: 文・漢字は ふりがな・絵は じょうろ・120 ステップ', () => {
    const v = FARM_HINT_VIEW.fill;
    expect(v.art).toEqual(['watering_can']);
    expect(v.html).toContain('じょうろ が からっぽ');
    expect(v.html.replace(/<[^>]+>/g, '')).toContain('水みずに むけて 右みぎクリック で くもう');
    expect(findUnrubiedKanji(v.html)).toEqual([]);
    const m = new FarmHintModel();
    m.feed([ev({ type: 'hint', hint: 'fill' })]);
    expect(m.current()).toBe('fill');
    for (let i = 0; i < FARM_HINT_STEPS; i++) m.step();
    expect(m.current()).toBeNull();
  });
});

describe('M7-2 HUD（AC17）と 案内画面（AC25）と 案内の絵（AC18）', () => {
  it('ハート: ごきげん の ときだけ。うすい しずく: wetSoon の ときだけ', () => {
    const base = { dots: 2, ripe: false, wet: true, dark: false };
    expect(farmAimView({ ...base, happy: true })).toMatchObject({ heart: true, dropletFaint: false });
    expect(farmAimView(base)).toMatchObject({ heart: false, dropletFaint: false });
    expect(farmAimView({ ...base, wetSoon: true })).toMatchObject({ droplet: true, dropletFaint: true });
    expect(farmAimView({ ...base, wet: false, wetSoon: true })).toMatchObject({ droplet: false, dropletFaint: false });
    expect(WET_SOON_OPACITY).toBe(0.45);
  });
  it('そだてる は 12 こ・漢字 は ふりがな付き', () => {
    const items = BOOK_ITEMS.filter((i) => i.chapter === 'grow');
    expect(items.length).toBe(12);
    for (const t of items) expect(findUnrubiedKanji(t.caption), t.id).toEqual([]);
    const plain = (id: string) => BOOK_ITEMS.find((i) => i.id === id)!.caption.replace(/<[^>]+>/g, '');
    expect(plain('grow-can-fill')).toContain('じょうろ');
    expect(plain('grow-sprinkler')).toContain('スプリンクラー');
    expect(plain('grow-pet')).toContain('なでる');
    expect(plain('grow-bucket')).toContain('バケツ');
  });
  it('照準の下: くむ・みずやり・くもう・なでる', () => {
    const c = { held: null, heldIsPickaxe: false, heldIsBlade: false };
    expect(actionHintLines({ kind: 'fill', item: 'watering_can' }, null, c).right).toEqual({ icon: 'watering_can', word: 'くむ' });
    expect(actionHintLines({ kind: 'pour', item: 'long_watering_can' }, null, c).right).toEqual({ icon: 'long_watering_can', word: 'みずやり' });
    expect(actionHintLines({ kind: 'fillHint', item: 'watering_can' }, null, c).right).toEqual({ icon: 'watering_can', word: 'くもう' });
    expect(actionHintLines({ kind: 'pet', item: 'tomato' }, null, c).right).toEqual({ icon: 'tomato', word: 'なでる' });
  });
});

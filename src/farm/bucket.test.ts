import { describe, expect, it } from 'vitest';
import type { FarmEvent, ItemStack, WaterRay } from '../contracts';
import { createBucket, isBucket } from './bucket';
import { CRAFT_RECIPES } from '../craft/recipes';
const BASE_RECIPES = CRAFT_RECIPES.filter((r) => r.output.item !== 'torch' || r.id === 'torch'); // CRAFT-PAGE: たいまつの 足した作り方（2 つ）をのぞいた 元の 36 こ
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { itemCategory } from '../ui/itemCategory';
import { itemIconPixels } from '../ui/itemIcon';
import { itemClassOf } from '../tools/durability';
import { createDefaultItemInfo } from '../craft/info';
import { findUnrubiedKanji } from '../ui/text';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { FARM_HINT_VIEW } from '../ui/farmHintModel';

/** 水の id（WATER-1 §4.6）。`water.ts` の まえでも 他の テストを 落とさないよう ここに 書く */
const waterId = (n: number): string => (n === 8 ? 'water' : n === 0 ? 'air' : `water_${n}`);
const waterAmount = (id: string): number => (id === 'water' ? 8 : /^water_[1-7]$/.test(id) ? Number(id.slice(6)) : 0);

const ray = (o: Partial<WaterRay> = {}): WaterRay => ({ throughWater: false, waterCell: null, hit: null, ...o });
const wb: ItemStack = { item: 'water_bucket', count: 1 };
const eb: ItemStack = { item: 'bucket', count: 1 };

/** cells: 'x,y,z' → ブロック id（なければ air）。WATER-1: くむと その マスの 水が へる ので、バケツの 係は 世界を 読み書きする */
function make(slot0: ItemStack | null, cells: Record<string, string> = {}) {
  const slots: Array<ItemStack | null> = [slot0];
  const events: FarmEvent[] = [];
  const world = {
    getBlock: (x: number, y: number, z: number) => cells[`${x},${y},${z}`] ?? 'air',
    setBlock: (x: number, y: number, z: number, id: string) => ((cells[`${x},${y},${z}`] = id), true),
  };
  const port = createBucket({
    inventory: { slots: () => slots, setSlot: (i, s) => void (slots[i] = s) },
    emit: (e) => void events.push(e),
    tick: () => 7,
    world: world as never,
  });
  return { slots, events, port, world };
}

describe('BUCKET-1 4d〜4g の ふりわけ（preview）', () => {
  const { port } = make(null);
  const spot = { x: 1, y: 2, z: 3 };
  it('バケツ でなければ null', () => {
    expect(port.preview({ item: 'stone', count: 1 }, ray(), true, spot, false)).toBeNull();
    expect(port.preview(null, ray(), true, spot, false)).toBeNull();
  });
  it('4d 水を通る → くむ（から も みず も）。くりかえしは 何もしない', () => {
    const r = ray({ throughWater: true, waterCell: { x: 0, y: 0, z: 0 } });
    expect(port.preview(eb, r, true, null, false)).toBe('bucketFill');
    expect(port.preview(wb, r, true, spot, false)).toBe('bucketFill');
    expect(port.preview(eb, r, true, null, true)).toBe('idle');
  });
  it('4e みず + 置けるマス → おく。水より あと', () => {
    expect(port.preview(wb, ray(), true, spot, false)).toBe('bucketPlace');
    expect(port.preview(wb, ray(), true, spot, true)).toBe('idle');
  });
  it('4f から → 合図（ねらい 何でも・無くても）', () => {
    expect(port.preview(eb, ray(), false, null, false)).toBe('bucketHint');
    expect(port.preview(eb, ray(), true, null, false)).toBe('bucketHint');
  });
  it('4g みず + 置けない: ねらいあり → コン、ねらい無し → 何もしない', () => {
    expect(port.preview(wb, ray(), true, null, false)).toBe('bucketNo');
    expect(port.preview(wb, ray(), false, null, false)).toBe('idle');
  });
});

describe('BUCKET-1 くむ・おく', () => {
  it('WATER-1 くむ: から → みずの バケツ（量 8）。マスは air に へる。出来事に 水の マスと item', () => {
    const a = make(eb, { '4,5,6': 'water' });
    expect(a.port.fill(0, { x: 4, y: 5, z: 6 })).toBe(true);
    expect(a.slots[0]).toMatchObject({ item: 'water_bucket', count: 1, water: 8 });
    expect(a.world.getBlock(4, 5, 6)).toBe('air');
    expect(a.events).toHaveLength(1);
    expect(a.events[0]).toMatchObject({ type: 'bucketFill', tick: 7, x: 4, y: 5, z: 6, item: 'bucket', changed: true });
  });
  it('WATER-1 くむ: 量 3 の マスから 3 だけ。マスは air。バケツは 量 3', () => {
    const a = make(eb, { '4,5,6': 'water_3' });
    expect(a.port.fill(0, { x: 4, y: 5, z: 6 })).toBe(true);
    expect(a.slots[0]).toMatchObject({ item: 'water_bucket', count: 1, water: 3 });
    expect(a.world.getBlock(4, 5, 6)).toBe('air');
  });
  it('WATER-1 くむ: 量 5 の バケツで 量 8 の マス → バケツ 8・マスは 量 5 に へる（BUCKET-1 AC4）', () => {
    const b = make({ item: 'water_bucket', count: 1, water: 5 }, { '4,5,6': 'water' });
    expect(b.port.fill(0, { x: 4, y: 5, z: 6 })).toBe(true);
    expect(b.slots[0]).toMatchObject({ item: 'water_bucket', count: 1, water: 8 });
    expect(b.world.getBlock(4, 5, 6)).toBe(waterId(5));
    expect(b.events[0]).toMatchObject({ type: 'bucketFill', item: 'water_bucket', changed: true });
  });
  it('WATER-1 くむ: 量 5 の バケツで 量 2 の マス → バケツ 7・マス air（あるだけ とる）', () => {
    const a = make({ item: 'water_bucket', count: 1, water: 5 }, { '4,5,6': 'water_2' });
    expect(a.port.fill(0, { x: 4, y: 5, z: 6 })).toBe(true);
    expect(a.slots[0]).toMatchObject({ item: 'water_bucket', water: 7 });
    expect(a.world.getBlock(4, 5, 6)).toBe('air');
  });
  it('WATER-1 くむ: 量 8 の バケツ（欄 なし = 8 も）は かわらない・マスも へらない・changed false（fullCan）', () => {
    for (const full of [{ item: 'water_bucket', count: 1 }, { item: 'water_bucket', count: 1, water: 8 }] as ItemStack[]) {
      const a = make(full, { '4,5,6': 'water' });
      expect(a.port.fill(0, { x: 4, y: 5, z: 6 })).toBe(false);
      expect(a.slots[0]).toEqual(full);
      expect(a.world.getBlock(4, 5, 6)).toBe('water');
      expect(a.events).toHaveLength(1);
      expect(a.events[0]).toMatchObject({ type: 'bucketFill', item: 'water_bucket', changed: false });
    }
  });
  it('WATER-1 くむ: 量の 合計は うつるだけ（バケツの 量 ＋ マスの 量 は くむ 前後で 同じ）', () => {
    for (const held of [0, 1, 4, 7]) {
      for (let cell = 1; cell <= 8; cell++) {
        const stack: ItemStack = held === 0 ? { item: 'bucket', count: 1 } : { item: 'water_bucket', count: 1, water: held };
        const a = make(stack, { '4,5,6': waterId(cell) });
        a.port.fill(0, { x: 4, y: 5, z: 6 });
        const after = (a.slots[0]?.item === 'water_bucket' ? (a.slots[0]?.water ?? 8) : 0) + waterAmount(a.world.getBlock(4, 5, 6));
        expect(after, `バケツ ${held}・マス ${cell}`).toBe(held + cell);
      }
    }
  });
  it('おく: みず → から。出来事 bucketPlace。から では 何もしない', () => {
    const a = make(wb);
    expect(a.port.placed(0, { x: 1, y: 2, z: 3 })).toBe(true);
    expect(a.slots[0]).toEqual(eb);
    expect(a.events).toEqual([{ type: 'bucketPlace', tick: 7, x: 1, y: 2, z: 3 }]);
    expect(a.port.placed(0, { x: 1, y: 2, z: 3 })).toBe(false);
    expect(a.events).toHaveLength(1);
  });
  it('WATER-1 おく: 量 3 の みずの バケツも から に もどる（量の 欄は のこらない）', () => {
    const a = make({ item: 'water_bucket', count: 1, water: 3 });
    expect(a.port.placed(0, { x: 1, y: 2, z: 3 })).toBe(true);
    expect(a.slots[0]).toEqual(eb);
    expect(a.slots[0]?.water).toBeUndefined();
  });
  it('no: bucketNo を出す。持ち物は へらない', () => {
    const a = make(wb);
    a.port.no({ x: 1, y: 2, z: 3 });
    expect(a.events).toEqual([{ type: 'bucketNo', tick: 7, x: 1, y: 2, z: 3 }]);
    expect(a.slots[0]).toEqual(wb);
  });
  it('isBucket', () => {
    expect(isBucket('bucket') && isBucket('water_bucket')).toBe(true);
    expect(isBucket('watering_can')).toBe(false);
    expect(isBucket(undefined)).toBe(false);
  });
});

describe('BUCKET-1 アイテム・レシピ・説明・実績（AC1・2・11・12）', () => {
  it('AC1 名前・上限・めずらしさ・カテゴリー・permanent・置けない', () => {
    for (const [id, name] of [['bucket', 'バケツ'], ['water_bucket', 'みずの バケツ']] as const) {
      expect(itemType(id)?.name).toBe(name);
      expect(itemType(id)?.maxStack).toBe(1);
      expect(itemType(id)?.placeBlock).toBeNull();
      expect(itemRarity(id)).toBe('common');
      expect(itemCategory(id)).toBe('tool');
      expect(itemClassOf(id)).toBe('permanent');
    }
  });
  it('AC1 絵は 16×16 で から と みず が ちがう', () => {
    const a = itemIconPixels('bucket');
    const b = itemIconPixels('water_bucket');
    expect(a).toHaveLength(256);
    expect(b).toHaveLength(256);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(b.some((c) => c[0] === 0x4f && c[1] === 0xc3 && c[2] === 0xf7 && c[3] === 255)).toBe(true);
  });
  it('AC2 レシピ: 29 まい目、てつの かたまり 3 → バケツ 1', () => {
    const r = BASE_RECIPES[29]; // TAKO-1: ふでが 道具の さいごに 入って 1 まい ずれた
    expect(BASE_RECIPES[28].id).toBe('sprinkler');
    expect(r.id).toBe('bucket');
    expect(r.output).toEqual({ item: 'bucket', count: 1 });
    expect(r.inputs).toEqual([{ item: 'iron_ingot', count: 3 }]);
  });
  it('AC11 説明の表: 2 行・漢字なし・usedIn', () => {
    const src = createDefaultItemInfo((i) => itemType(i)?.name ?? i);
    const b = src.info('bucket');
    expect(b.use).toBe('みず を くんで はこぶ');
    expect(b.how).toContain('みず に みぎクリック で くむ');
    const w = src.info('water_bucket');
    expect(w.use).toBe('はたけ の そば に みず を おく');
    expect(w.how).toContain('もって みぎクリック で おく');
    for (const t of [b.use, b.how, w.use, w.how]) expect(findUnrubiedKanji(t)).toEqual([]);
    expect(src.info('iron_ingot').usedIn.at(-1)).toBe('bucket');
  });
  it('AC12 実績: craft.bucket(小)・farm.bucket(小でない)。224・小 79', () => {
    const c = ACHIEVEMENT_DEFS.find((d) => d.id === 'craft.bucket.1');
    const f = ACHIEVEMENT_DEFS.find((d) => d.id === 'farm.bucket.1');
    expect(c).toMatchObject({ stat: 'craft:bucket', small: true, name: 'はじめて バケツ を つくった！' });
    expect(f).toMatchObject({ stat: 'bucketPlace', small: false, name: 'はじめて バケツ で みず を おいた！' });
    expect(ACHIEVEMENT_DEFS.some((d) => d.id === 'craft.everything.28')).toBe(true);
  });
  it('合図 bucket の 文と 絵', () => {
    expect(FARM_HINT_VIEW.bucket.html).toContain('バケツ が からっぽ');
    expect(FARM_HINT_VIEW.bucket.html).toContain('<ruby>');
    expect(FARM_HINT_VIEW.bucket.art[0]).toBe('bucket');
  });
});

describe('BUCKET-1 音（AC13）', () => {
  it('くむ=fill・みずで くむ=fullCan・おく=sprinklerPlace・合図/コン=empty。新しい音は 足さない', async () => {
    const { FarmFx } = await import('../fx/farmFx');
    const { FARM_SOUNDS } = await import('../fx/farmSounds');
    const fx = new FarmFx({ sound: { playTones: () => {} } });
    const at = { tick: 0, x: 0, y: 0, z: 0 };
    fx.feed([
      { type: 'bucketFill', ...at, item: 'bucket', changed: true },
      { type: 'bucketFill', ...at, item: 'water_bucket', changed: false },
      { type: 'bucketPlace', ...at },
      { type: 'hint', ...at, hint: 'bucket' },
      { type: 'bucketNo', ...at },
    ]);
    expect(fx.played).toEqual(['fill', 'fullCan', 'sprinklerPlace', 'empty', 'empty']);
    expect(Object.keys(FARM_SOUNDS)).not.toContain('bucket');
  });
});

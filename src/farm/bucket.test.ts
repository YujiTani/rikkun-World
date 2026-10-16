import { describe, expect, it } from 'vitest';
import type { FarmEvent, ItemStack, WaterRay } from '../contracts';
import { createBucket, isBucket } from './bucket';
import { CRAFT_RECIPES } from '../craft/recipes';
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { itemCategory } from '../ui/itemCategory';
import { itemIconPixels } from '../ui/itemIcon';
import { itemClassOf } from '../tools/durability';
import { createDefaultItemInfo } from '../craft/info';
import { findUnrubiedKanji } from '../ui/text';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { FARM_HINT_VIEW } from '../ui/farmHintModel';

const ray = (o: Partial<WaterRay> = {}): WaterRay => ({ throughWater: false, waterCell: null, hit: null, ...o });
const wb: ItemStack = { item: 'water_bucket', count: 1 };
const eb: ItemStack = { item: 'bucket', count: 1 };

function make(slot0: ItemStack | null) {
  const slots: Array<ItemStack | null> = [slot0];
  const events: FarmEvent[] = [];
  const port = createBucket({
    inventory: { slots: () => slots, setSlot: (i, s) => void (slots[i] = s) },
    emit: (e) => void events.push(e),
    tick: () => 7,
  });
  return { slots, events, port };
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
  it('くむ: から → みず（changed true）。みず → かわらず changed false。水の マスと item を 出来事に', () => {
    const a = make(eb);
    expect(a.port.fill(0, { x: 4, y: 5, z: 6 })).toBe(true);
    expect(a.slots[0]).toEqual(wb);
    expect(a.events).toEqual([{ type: 'bucketFill', tick: 7, x: 4, y: 5, z: 6, item: 'bucket', changed: true }]);
    expect(a.port.fill(0, { x: 4, y: 5, z: 6 })).toBe(false);
    expect(a.slots[0]).toEqual(wb);
    expect(a.events[1]).toMatchObject({ type: 'bucketFill', item: 'water_bucket', changed: false });
  });
  it('おく: みず → から。出来事 bucketPlace。から では 何もしない', () => {
    const a = make(wb);
    expect(a.port.placed(0, { x: 1, y: 2, z: 3 })).toBe(true);
    expect(a.slots[0]).toEqual(eb);
    expect(a.events).toEqual([{ type: 'bucketPlace', tick: 7, x: 1, y: 2, z: 3 }]);
    expect(a.port.placed(0, { x: 1, y: 2, z: 3 })).toBe(false);
    expect(a.events).toHaveLength(1);
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
    expect(CRAFT_RECIPES).toHaveLength(33);
    const r = CRAFT_RECIPES[28];
    expect(CRAFT_RECIPES[27].id).toBe('sprinkler');
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

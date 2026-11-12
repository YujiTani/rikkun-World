import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId } from '../contracts';
import { HouseBook } from '../house/book';
import { houseShape, recordHouse } from '../house/shape';
import { ALL_KINDS, LIGHT_KINDS, PARTS, splitKind } from '../house/recipes/kinds';
import { allKindsOf, kindBlocks, kindItem, withKind, type LookBook, type LookPart } from '../house/recipes/lookKit';
import { LOOK_BLOCK_IDS } from '../world/blocks/houseLookBlocks';
import { FURN_BLOCK_IDS, FURN_BLOCK_KINDS, HOUSE_BLOCK_IDS, HOUSE_DOOR_PART_IDS, doorInfo, furnInfo } from '../world/blocks/houseBlocks';
import { dugItemAt, dugItemOf } from './dugItems';
import { PlaceRig } from './placeKit';

/**
 * HOUSE-2C AC15（仕様 3.4 版 §2.5・§6.2。「家の 壁を こわすと ふつうの 木の ブロックに もどって しまう」）: ほると その 物 1 こ。表から ぜんぶ 回す（数を 書かない）。
 * ① 1 版の 家の ブロック 5（戸は 下・上 × しめ・あけ の 4 マス）・家具 → 自分の アイテム（log・材料 に ならない）。
 * ② HOUSE-2 の しゅるい ぜんぶ（なし 以外・あかり 2）の 建てた 家の どの マスも dugItemAt ＝ kindItem、実際に ほると その アイテム 1 こ。
 * ③ 家の 記録も 置いた 記録も ない lk_ ブロック（柱 のぞく）を ほると その 形の むらの アイテム。
 * 手で 置いた 記録（案）は src/house/placedLooks.test.ts・src/dig/placedLooksDig.test.ts。
 */

const AT = { x: 10, y: 9, z: 10 };
const LOOK_PARTS: readonly LookPart[] = [...PARTS, 'light'];
const BASE = { w: 7 as const, d: 7 as const, windows: 2 };
const lookOf = (c: { look?: string }): string | undefined => c.look;

/** 1 マス だけ 置いた 世界で ねらって ほる。ほった あとの 持ち物（アイテム → 数）と、ブロックが 消えたか */
function digOne(id: BlockId, at: { x: number; y: number; z: number }, book: LookBook | null): { aimed: boolean; gone: boolean; got: Record<string, number> } {
  const r = new PlaceRig({ houseLook: () => book });
  r.world.setBlock(at.x, at.y, at.z, id);
  if (/^(house|lk)_door/.test(id)) {
    // 戸は 2 マス: もう 半分も 置く（下の 半分の 上 ／ 上の 半分の 下）
    const top = id.endsWith('_top');
    r.world.setBlock(at.x, at.y + (top ? -1 : 1), at.z, (top ? id.slice(0, -4) : `${id}_top`) as BlockId);
  }
  const aimed = r.aimAt(at.x, at.y, at.z);
  if (!aimed) return { aimed, gone: false, got: {} };
  r.breakAimed();
  const got: Record<string, number> = {};
  for (const s of r.inv.slots()) if (s) got[s.item] = (got[s.item] ?? 0) + s.count;
  return { aimed, gone: r.world.getBlock(at.x, at.y, at.z) === 'air', got };
}

describe('AC15 ①: 1 版の 家の ブロック・家具を ほると その 物 1 こ（log・材料に ならない）', () => {
  it('家の ブロック 5（戸は 下・上 × しめ・あけ の 4 マス）: dugItemOf が 自分の アイテム', () => {
    expect(HOUSE_BLOCK_IDS.length).toBeGreaterThan(0);
    for (const id of HOUSE_BLOCK_IDS) expect(dugItemOf(id), id).toBe(id);
    for (const id of HOUSE_DOOR_PART_IDS) expect(dugItemOf(id), `戸の マス ${id}`).toBe('house_door');
    expect(HOUSE_DOOR_PART_IDS.every((id) => doorInfo(id) !== null), '戸の 4 マス').toBe(true);
  });

  it('家具: ぜんぶの ブロック（向き・マスごと）を ほると もとの 家具 1 こ', () => {
    expect(FURN_BLOCK_IDS.length).toBeGreaterThan(0);
    for (const id of FURN_BLOCK_IDS) {
      const kind = furnInfo(id)!.kind;
      expect(FURN_BLOCK_KINDS).toContain(kind);
      const item = dugItemOf(id);
      expect(item, `${id}`).not.toBe('log');
      expect(item, `${id} は ${kind}`).toBe(kind);
    }
  });

  it('実際に ほる: 家の ブロック 5 と 戸の 4 マス が 持ち物に その 物 1 こ（log は 0）', () => {
    for (const id of [...HOUSE_BLOCK_IDS, ...HOUSE_DOOR_PART_IDS]) {
      const want = dugItemOf(id);
      const r = digOne(id as BlockId, { x: 12, y: 9, z: 12 }, null);
      expect(r.aimed, `${id}: ねらえた`).toBe(true);
      expect(r.gone, `${id}: ブロックが 消えた`).toBe(true);
      expect(r.got[want], `${id}: ${want} が 1 こ`).toBe(1);
      expect(r.got.log ?? 0, `${id}: log に ならない`).toBe(0);
    }
  });
});

describe('AC15 ②: HOUSE-2 の しゅるい ぜんぶ（なし 以外・あかり 2）: 建てた 家の どの マスも その しゅるいの アイテム', () => {
  it('どの マスも dugItemAt ＝ kindItem（ななめの やねの のき・なか・むね・向き・てつの との 4 マス を ふくむ）。かべの なし（柱）は あれば その アイテム', () => {
    let kinds = 0;
    for (const part of LOOK_PARTS) {
      for (const kind of allKindsOf(part)) {
        const item = kindItem(part, kind);
        if (kind === 'none') continue;
        kinds++;
        const bp = withKind(part, kind, BASE);
        const book = new HouseBook() as LookBook;
        recordHouse(book, bp, 1, AT);
        let dug = 0;
        for (const c of houseShape(bp).cells) {
          if (lookOf(c) !== kind) continue;
          dug++;
          expect(dugItemAt(book, c.id as BlockId, AT.x + c.x, AT.y + c.y, AT.z + c.z), `${part}-${kind} (${c.x},${c.y},${c.z}) ${c.id}`).toBe(item);
        }
        expect(dug, `${part}-${kind}: ほった マス`).toBeGreaterThan(0);
      }
    }
    expect(kinds, '表から 回した').toBeGreaterThan(LOOK_PARTS.length);
  });

  it('てつの と: 4 つの ブロック（下・上 × しめ・あけ）の どれを ほっても てつの との アイテム（案ごと）', () => {
    for (const kind of ALL_KINDS.door.filter((k) => splitKind(k).style !== null)) {
      const bp = withKind('door', kind, BASE);
      const book = new HouseBook() as LookBook;
      recordHouse(book, bp, 1, AT);
      const door = houseShape(bp).cells.find((c) => lookOf(c) === kind)!;
      for (const id of kindBlocks('door', kind)) {
        expect(dugItemAt(book, id, AT.x + door.x, AT.y + door.y, AT.z + door.z), `${kind} の ${id}`).toBe(kindItem('door', kind));
      }
    }
  });

  it('実際に ほる: しゅるい ごと・ブロックの id ごとに 1 マス 建てた 家の マスを ほる → その アイテム 1 こ（log に ならない）', () => {
    let dug = 0;
    for (const part of LOOK_PARTS) {
      for (const kind of allKindsOf(part)) {
        if (kind === 'none') continue;
        const item = kindItem(part, kind)!;
        const bp = withKind(part, kind, BASE);
        const book = new HouseBook() as LookBook;
        recordHouse(book, bp, 1, AT);
        const seen = new Set<string>();
        for (const c of houseShape(bp).cells) {
          if (lookOf(c) !== kind || seen.has(c.id)) continue;
          seen.add(c.id);
          const at = { x: AT.x + c.x, y: AT.y + c.y, z: AT.z + c.z };
          const r = digOne(c.id as BlockId, at, book);
          expect(r.aimed, `${part}-${kind} ${c.id}: ねらえた`).toBe(true);
          expect(r.gone, `${part}-${kind} ${c.id}: 消えた`).toBe(true);
          expect(r.got[item], `${part}-${kind} ${c.id}: ${item} が 1 こ`).toBe(1);
          expect(r.got.log ?? 0, `${part}-${kind}: log に ならない`).toBe(0);
          dug++;
        }
      }
    }
    expect(dug, '実際に ほった 回数').toBeGreaterThan(LOOK_PARTS.length);
  });
});

describe('AC15 ③: 家の 記録も 置いた 記録も ない lk_ ブロック（柱 のぞく）を ほると その 形の むらの アイテム', () => {
  it('どの lk_ ブロックも 記録 なしで ほると 形の むらの アイテム（あかり・しゃちほこ は その まま）。log に ならない', () => {
    const book = new HouseBook() as LookBook;
    const expected = new Map<string, ItemId>();
    for (const part of LOOK_PARTS) {
      for (const kind of allKindsOf(part)) {
        if (kind === 'none') continue;
        const { style } = splitKind(kind);
        if (style !== null && style !== 'mura') continue; // むらの アイテムが 形の 答え
        for (const b of kindBlocks(part, kind)) if (!expected.has(b)) expected.set(b, kindItem(part, kind)!);
      }
    }
    for (const id of LOOK_BLOCK_IDS) {
      if (id === 'lk_wall_pillar') continue;
      const want = expected.get(id);
      expect(want, `${id}: 形の むらの アイテムが 表に ある`).toBeDefined();
      expect(dugItemAt(book, id, 1, 2, 3), `${id}`).toBe(want);
    }
    expect(LIGHT_KINDS.length).toBeGreaterThan(0);
  });

  it('実際に ほる: 手で 置いた（記録 なし）lk_ ブロックを ほる → 形の むらの アイテム 1 こ', () => {
    const book = new HouseBook() as LookBook;
    let n = 0;
    for (const part of LOOK_PARTS) {
      for (const kind of allKindsOf(part)) {
        if (kind === 'none') continue;
        const { style } = splitKind(kind);
        if (style !== null && style !== 'mura') continue;
        const id = kindBlocks(part, kind)[0]!;
        const r = digOne(id, { x: 12, y: 9, z: 12 }, book);
        expect(r.aimed && r.gone, `${id}: ほれた`).toBe(true);
        expect(r.got[kindItem(part, kind)!], `${id}: むらの アイテム`).toBe(1);
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { FUTON_FOOT, FUTON_HEAD } from '../world/blocks/futon';
import { KOTATSU_CELLS } from '../world/blocks/kotatsu';
import { FURN_LEN, furnBlockId, type FurnBlockKind, type FurnRot } from '../world/blocks/houseBlocks';
import { FURN_ORDER, FURNITURE } from './editor/furniture';
import type { Placed } from './editor/model';
import { doorIndex, footprint, windowCells, windowMax } from './editor/model';
import { HEIGHT, ROOF_Y, SIZES, WINDOW_Y, type Rot } from './editor/tuning';
import { houseShape } from './shape';

/** HOUSE-1C PR-1（AC49）: せっけいず → 建った 家の 形。形の 式は model.ts の 関数（windowCells・doorIndex）を 読む */

type Bp = Parameters<typeof houseShape>[0];
const bp = (w: number, d: number, windows: number, furniture: Placed[] = []): Bp => ({ w: w as Bp['w'], d: d as Bp['d'], windows, furniture });

function at(shape: ReturnType<typeof houseShape>, x: number, y: number, z: number): string {
  return shape.cells.find((c) => c.x === x && c.y === y && c.z === z)!.id;
}

describe('houseShape: 外の 箱', () => {
  it('3 つの よこ × 3 つの たて × 窓の かず ぜんぶ: ゆか・やね・かべ・窓・戸・ちょうちんが きまりどおり', () => {
    let tried = 0;
    for (const w of SIZES) {
      for (const d of SIZES) {
        for (let n = 0; n <= windowMax({ w, d }); n++) {
          tried++;
          const s = houseShape(bp(w, d, n));
          const ow = w + 2;
          const od = d + 2;
          const name = `${w}×${d} 窓${n}`;
          expect([s.outerW, s.outerD], name).toEqual([ow, od]);
          expect(s.cells, `${name}: 外の 箱の ぜんぶの マス`).toHaveLength(ow * od * (ROOF_Y + 1));
          const door = { x: 1 + doorIndex({ w, d }), y: HEIGHT.floor, z: od - 1 };
          expect(s.door, `${name}: 戸の 下の マス`).toEqual(door);
          const count = (id: string): number => s.cells.filter((c) => c.id === id).length;
          expect(count('house_floor'), name).toBe(ow * od);
          expect(count('house_roof'), name).toBe(ow * od);
          expect(count('house_door'), name).toBe(1);
          expect(count('house_door_top'), name).toBe(1);
          expect(at(s, door.x, 1, door.z), name).toBe('house_door');
          expect(at(s, door.x, 2, door.z), name).toBe('house_door_top');
          expect(count('shoji'), `${name}: 窓の かず`).toBe(n);
          expect(count('lantern'), `${name}: 天井の ちょうちんは 1 つ`).toBe(1);
          expect(at(s, 1 + (w - 1) / 2, ROOF_Y - 1, 1 + (d - 1) / 2), `${name}: ちょうちんは 中の 3 段目の まん中`).toBe('lantern');
          // 窓は 2 段目だけ・外まわりだけ・まえの かべには ない
          for (const c of s.cells.filter((c) => c.id === 'shoji')) {
            expect(c.y, name).toBe(WINDOW_Y);
            expect(c.x === 0 || c.x === ow - 1 || c.z === 0, name).toBe(true);
            expect(c.z, `${name}: まえには 窓が ない`).not.toBe(od - 1);
          }
          // 中の 3 段は 外まわりが かべ、中は 空気（ちょうちん・家具いがい）
          for (const c of s.cells.filter((c) => c.y >= 1 && c.y < ROOF_Y)) {
            const ring = c.x === 0 || c.z === 0 || c.x === ow - 1 || c.z === od - 1;
            if (ring) expect(['house_wall', 'shoji', 'house_door', 'house_door_top'], `${name} ${c.x},${c.y},${c.z}`).toContain(c.id);
            else expect(['air', 'lantern'], `${name} ${c.x},${c.y},${c.z}`).toContain(c.id);
          }
        }
      }
    }
    expect(tried, 'ためた 形の かず').toBeGreaterThan(20);
  });

  it('窓の 場所は windowCells（うしろ・ひだり・みぎ）と 同じ かず・かべ', () => {
    for (const [w, d] of [[5, 5], [7, 9], [9, 7]] as const) {
      const n = windowMax({ w, d });
      const s = houseShape(bp(w, d, n));
      const cells = windowCells({ w, d, windows: n });
      const walls = (id: string, pred: (x: number, z: number) => boolean): number => s.cells.filter((c) => c.id === id && pred(c.x, c.z)).length;
      expect(walls('shoji', (_x, z) => z === 0), 'うしろ').toBe(cells.filter((c) => c.wall === 'back').length);
      expect(walls('shoji', (x) => x === 0), 'ひだり').toBe(cells.filter((c) => c.wall === 'left').length);
      expect(walls('shoji', (x) => x === w + 1), 'みぎ').toBe(cells.filter((c) => c.wall === 'right').length);
    }
  });
});

describe('houseShape: 家具（床の 上の 1 段目）', () => {
  const FLOOR = HEIGHT.floor;

  it('向きの ある 家具: 中の 床の 左上 (x, z) は 外の 箱では (1 + x, 1 + z)。ながい テーブルは 向きで たてに のびる', () => {
    const s = houseShape(bp(7, 7, 0, [
      { kind: 'chair', x: 2, z: 3, rot: 1 },
      { kind: 'long_table', x: 4, z: 0, rot: 1 }, // たて（z 0〜2）
      { kind: 'tansu', x: 0, z: 0, rot: 2 },
      { kind: 'table', x: 0, z: 4, rot: 0 }, // よこ（x 0〜1）
    ]));
    expect(at(s, 3, FLOOR, 4)).toBe(furnBlockId('chair', 0, 1));
    expect(at(s, 1, FLOOR, 1)).toBe('tansu_n');
    const lt = [0, 1, 2].map((z) => at(s, 5, FLOOR, 1 + z));
    expect(new Set(lt)).toEqual(new Set([furnBlockId('long_table', 0, 1), furnBlockId('long_table', 1, 1), furnBlockId('long_table', 2, 1)]));
    const tb = [0, 1].map((x) => at(s, 1 + x, FLOOR, 5));
    expect(new Set(tb)).toEqual(new Set([furnBlockId('table', 0, 0), furnBlockId('table', 1, 0)]));
    // 家具の 上は 空気
    expect(at(s, 3, FLOOR + 1, 4)).toBe('air');
  });

  it('ふとん: 向き 0 は まくらが うしろ（頭が 左上、足が 1 つ 南）。1 は 頭が 東', () => {
    const s0 = houseShape(bp(5, 5, 0, [{ kind: 'futon', x: 1, z: 0, rot: 0 }]));
    expect(at(s0, 2, FLOOR, 1)).toBe(FUTON_HEAD[1]);
    expect(at(s0, 2, FLOOR, 2)).toBe(FUTON_FOOT[1]);
    const s1 = houseShape(bp(5, 5, 0, [{ kind: 'futon', x: 0, z: 0, rot: 1 }]));
    expect([at(s1, 2, FLOOR, 1), at(s1, 1, FLOOR, 1)]).toEqual([FUTON_HEAD[2], FUTON_FOOT[2]]);
  });

  it('こたつ 2×2・はにわ', () => {
    const s = houseShape(bp(5, 5, 0, [{ kind: 'nukunuku', x: 0, z: 0, rot: 0 }, { kind: 'haniwa', x: 4, z: 4, rot: 0 }]));
    for (const c of KOTATSU_CELLS) expect(at(s, 1 + c.dx, FLOOR, 1 + c.dz)).toBe(c.block);
    expect(at(s, 5, FLOOR, 5)).toBe('haniwa');
  });
});

describe('houseShape: 家具 ぜんぶ × 4 つの 向き（エディターの 大きさと 建った マスが 合う）', () => {
  const FLOOR = HEIGHT.floor;
  const ROTS: readonly Rot[] = [0, 1, 2, 3];
  const X = 2;
  const Z = 2;

  /** 家具 1 つを 9×9 の 中の (X, Z) に おいた とき、その 家具の マス（床の 上の 1 段目で 空気でない 所） */
  function placedCells(kind: (typeof FURN_ORDER)[number], rot: Rot) {
    const s = houseShape(bp(9, 9, 0, [{ kind, x: X, z: Z, rot }]));
    return s.cells.filter((c) => c.y === FLOOR && c.x >= 1 && c.x <= 9 && c.z >= 1 && c.z <= 9 && c.id !== 'air');
  }

  for (const kind of FURN_ORDER) {
    it(`${kind}: 4 つの 向きぜんぶで マスの かずと 外わくが エディターの footprint と 同じ。左上が (x, z)`, () => {
      const [cw, cd] = FURNITURE[kind].cells;
      for (const rot of ROTS) {
        const cells = placedCells(kind, rot);
        const name = `${kind} rot${rot}`;
        expect(cells, name).toHaveLength(cw * cd);
        const [fw, fd] = footprint(kind, rot);
        const xs = cells.map((c) => c.x);
        const zs = cells.map((c) => c.z);
        expect([Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1], `${name}: 外わくの 大きさ`).toEqual([fw, fd]);
        expect([Math.min(...xs), Math.min(...zs)], `${name}: 左上の マス`).toEqual([1 + X, 1 + Z]);
        expect(new Set(cells.map((c) => `${c.x},${c.z}`)).size, `${name}: マスは かさならない`).toBe(cells.length);
      }
    });
  }

  it('向きの ある 家具 10 しゅるいは どの 向きでも マスごとに 別の id（しゅるい・マス・向き）', () => {
    for (const kind of FURN_ORDER.filter((k): k is FurnBlockKind => k in FURN_LEN)) {
      for (const rot of ROTS) {
        const ids = new Set(placedCells(kind, rot).map((c) => c.id));
        const want = new Set(Array.from({ length: FURN_LEN[kind] }, (_, k) => furnBlockId(kind, k, rot as FurnRot)));
        expect(ids, `${kind} rot${rot}`).toEqual(want);
      }
    }
  });

  it('ふとんは 向きごとに 頭と 足、こたつは 4 マス、はにわは 1 マス', () => {
    for (const rot of ROTS) {
      const ids = placedCells('futon', rot).map((c) => c.id).sort();
      const dir = ({ 0: 1, 1: 2, 2: 3, 3: 0 } as const)[rot];
      expect(ids, `futon rot${rot}`).toEqual([FUTON_HEAD[dir], FUTON_FOOT[dir]].sort());
    }
    expect(placedCells('nukunuku', 0).map((c) => c.id).sort()).toEqual(KOTATSU_CELLS.map((c) => c.block).sort());
    expect(placedCells('haniwa', 2).map((c) => c.id)).toEqual(['haniwa']);
  });
});

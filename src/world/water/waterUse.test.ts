import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { clear2, tryMove } from '../../animals/animalMove';
import { KIND_AI } from '../../yokai/ai/config';
import { collectFloors, groundSupport } from '../../yokai/ai/terrain';
import { waterId } from '../blocks/water';
import { ArrayVoxelWorld } from '../VoxelWorld';

/**
 * WATER-1 AC14（判定の つかい分け）のうち、妖怪・どうぶつ。
 * 浅い 水（量 1〜3）は 歩いて 通る。深い 水（量 4〜8）は さける（§4.6 の 置きかえ表: `isDeepWater`）。
 * 実装の まえに 書いた テスト（`water.ts` が まだ 無いので 落ちるのが 正しい）。
 */

const FLOOR_TOP = 8; // 石の 床の いちばん 上の 段
const FEET = FLOOR_TOP + 1; // 床の 上の マス = 足の 高さ

/** 石の 床（y 0〜8）。足もとの マス（y 9）の 5×5 を `top` の 水に する */
function pondOf(top: BlockId): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 32, y: 32, z: 32 });
  w.fill(0, 0, 0, 31, FLOOR_TOP, 31, 'stone');
  if (top !== 'air') w.fill(8, FEET, 8, 12, FEET, 12, top);
  return w;
}

const SHALLOW = [1, 2, 3] as const;
const DEEP = [4, 5, 6, 7, 8] as const;

describe('AC14 妖怪: 立てる所（groundSupport）', () => {
  const ai = KIND_AI.karakasa;
  it('空気の 床には 立てる（基準）', () => {
    expect(groundSupport(pondOf('air'), 10.5, 10.5, FEET, ai)).toBe(FEET);
  });
  it('量 1〜3 の 水の 中は 通れる（足もとは 床の 上）', () => {
    for (const a of SHALLOW) expect(groundSupport(pondOf(waterId(a)), 10.5, 10.5, FEET, ai), `量 ${a}`).toBe(FEET);
  });
  it('量 4〜8 の 水の 上には 立てない（深い 水）', () => {
    for (const a of DEEP) expect(groundSupport(pondOf(waterId(a)), 10.5, 10.5, FEET, ai), `量 ${a}`).toBeNaN();
  });
  it('水を 許す 呼び方（allowWater）なら 量 8 でも 立てる（今と 同じ）', () => {
    expect(groundSupport(pondOf('water'), 10.5, 10.5, FEET, ai, undefined, true)).toBe(FEET);
  });
});

describe('AC14 妖怪: 出る 場所を さがす（collectFloors の 水あり）', () => {
  const floorsAt = (top: BlockId): { water: boolean; floors: number[] } => {
    const out: number[] = [];
    const water = collectFloors(pondOf(top), 10, 10, FEET, FEET + 3, out);
    return { water, floors: out };
  };
  it('量 1〜3 の 水は 「水の 列」に しない（出られる）', () => {
    for (const a of SHALLOW) {
      const r = floorsAt(waterId(a));
      expect(r.water, `量 ${a}`).toBe(false);
      expect(r.floors, `量 ${a}: 床は 水の 下の 石の 上`).toEqual([FEET]);
    }
  });
  it('量 4〜8 の 水は 「水の 列」（出ない・泳ぎ手の 出る 場所）', () => {
    for (const a of DEEP) expect(floorsAt(waterId(a)).water, `量 ${a}`).toBe(true);
  });
});

describe('AC14 どうぶつ', () => {
  const walkInto = (top: BlockId): { moved: boolean; x: number } => {
    const w = pondOf(top);
    const e = { x: 10.5, y: FEET, z: 10.5 };
    const core = { world: w, coopList: [] as never[] };
    const moved = tryMove(core as never, e as never, 0.2, 0, 3, false);
    return { moved, x: e.x };
  };
  it('立てる マス（clear2）: 量 1〜3 の 水の マスは 通れる、量 4〜8 は 立てない', () => {
    expect(clear2({ world: pondOf('air') } as never, 10, FEET, 10)).toBe(true);
    for (const a of SHALLOW) expect(clear2({ world: pondOf(waterId(a)) } as never, 10, FEET, 10), `量 ${a}`).toBe(true);
    for (const a of DEEP) expect(clear2({ world: pondOf(waterId(a)) } as never, 10, FEET, 10), `量 ${a}`).toBe(false);
  });
  it('歩く（tryMove）: 浅い 水の 中へは 進む、深い 水へは 進まない', () => {
    expect(walkInto('air').moved).toBe(true);
    for (const a of SHALLOW) {
      const r = walkInto(waterId(a));
      expect(r.moved, `量 ${a}`).toBe(true);
      expect(r.x).toBeCloseTo(10.7, 9);
    }
    for (const a of DEEP) {
      const r = walkInto(waterId(a));
      expect(r.moved, `量 ${a}`).toBe(false);
      expect(r.x, `量 ${a}: うごかない`).toBe(10.5);
    }
  });
});

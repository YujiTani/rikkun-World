import { describe, expect, it } from 'vitest';
import { KIT_ICON_RANGE, kitIconsFor, type KitLike } from './kitIcons';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)「こたつ」、AC154）の 先行テスト（赤）。
 * 天板の 3 わくは 2 人の どちらかから KIT_ICON_RANGE 以内の こたつにも 出る。どちらかが たまごを もって ねらった こたつも 出る。
 *
 * ---- 実装への 約束（src/animals/models/kitIcons.ts の `KitIconCtx` に 省ける 2 つを 足す）----
 *   eye2?: { x: number; z: number } | null           … 2P の 目。なければ 1 人の ときと 同じ。
 *   aim2?: { x: number; z: number; holdingEgg: boolean } | null   … 2P の ねらい（`aim` と 同じ 形）。
 */
const TOTAL = 7200;
const kit = (x: number, z: number): KitLike => ({ x, y: 9, z, size: 2, eggs: [{ egg: 'egg', left: 100 }] });

describe('こたつの 天板の 3 わく（2 人）', () => {
  const near1 = kit(10, 10);
  const near2 = kit(110, 10);
  const far = kit(60, 10);
  it('1P の 近くの こたつ・2P の 近くの こたつ の どちらにも 出る。どちらからも 遠い こたつは 出ない', () => {
    const rows = kitIconsFor([near1, near2, far], { eye: { x: 14, z: 10 }, eye2: { x: 114, z: 10 }, total: TOTAL, aim: null });
    expect(rows.map((r) => r.x).sort((a, b) => a - b)).toEqual([10, 110]);
    expect(Math.abs(60 - 14)).toBeGreaterThan(KIT_ICON_RANGE);
  });
  it('2P が いない（eye2 なし・null）なら 1P の 近くの 分だけ（今までどおり）', () => {
    expect(kitIconsFor([near1, near2], { eye: { x: 14, z: 10 }, total: TOTAL, aim: null })).toHaveLength(1);
    expect(kitIconsFor([near1, near2], { eye: { x: 14, z: 10 }, eye2: null, total: TOTAL, aim: null })).toHaveLength(1);
  });
  it('2P が たまごを もって ねらった こたつは とおくても 出る（から でも）', () => {
    const rows = kitIconsFor([], { eye: { x: 14, z: 10 }, eye2: { x: 114, z: 10 }, total: TOTAL, aim: null, aim2: { x: 200, z: 10, holdingEgg: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.x).toBe(200);
    expect(rows[0]!.slots.every((s) => s.egg === null)).toBe(true);
    expect(kitIconsFor([], { eye: { x: 14, z: 10 }, eye2: { x: 114, z: 10 }, total: TOTAL, aim: null, aim2: { x: 200, z: 10, holdingEgg: false } })).toHaveLength(0);
  });
});

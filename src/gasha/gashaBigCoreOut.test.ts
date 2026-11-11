import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CoreOut, coreSpot } from './gashaBigCoreOut';
import { TUNE as T } from './gashaBigTuning';

const K = T.finish.core;

describe('外へ 出た 大きな コア（FIX-3）', () => {
  it('調整表: 一辺 3 ブロック、体の 外 18 ブロック', () => {
    expect(K.size).toBe(3);
    expect(K.outBlocks).toBe(18);
  });

  it('置く 場所: 体の 中心から プレイヤーの 方へ outBlocks。高さは その 点の 地面の 上に 乗る 高さ（中心 = 上の 面 ＋ 半分）', () => {
    const s = coreSpot({ x: 100, z: 50 }, { x: 160, z: 50 }, (x) => (x > 110 ? 20 : 99), K.outBlocks, K.size);
    expect(s.x).toBeCloseTo(100 + K.outBlocks, 6);
    expect(s.z).toBeCloseTo(50, 6);
    expect(s.y).toBeCloseTo(20 + 1 + K.size / 2, 6); // いちばん 上の ブロック(20)の 上の 面 = 21 に 底が のる
  });

  it('斜めでも プレイヤーの 方向。体の 中心から ちょうど outBlocks はなれる', () => {
    const s = coreSpot({ x: 0, z: 0 }, { x: -300, z: 400 }, () => 5, K.outBlocks, K.size);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(K.outBlocks, 6);
    expect(s.x / s.z).toBeCloseTo(-300 / 400, 6);
  });

  it('プレイヤーが outBlocks より 近ければ プレイヤーの 足もと。真上でも NaN に ならない', () => {
    const s = coreSpot({ x: 0, z: 0 }, { x: 6, z: 8 }, () => 7, K.outBlocks, K.size);
    expect([s.x, s.z]).toEqual([6, 8]);
    const t = coreSpot({ x: 3, z: 4 }, { x: 3, z: 4 }, () => 2, K.outBlocks, K.size);
    expect(Number.isFinite(t.x + t.y + t.z)).toBe(true);
  });

  it('当たりの 箱は ワールドの 位置に 置かれ、一辺 size。底は 地面の 上の 面（刀が 地面から とどく 高さ）', () => {
    const co = new CoreOut(new Scene());
    expect(co.box()).toBeNull();
    const c = coreSpot({ x: 0, z: 0 }, { x: 100, z: 0 }, () => 10, K.outBlocks, K.size);
    co.place(c, K.size);
    const b = co.box()!;
    expect(b.name).toBe('outCore');
    expect(Array.from(b.c)).toEqual([c.x, c.y, c.z]);
    expect(Array.from(b.half)).toEqual([K.size / 2, K.size / 2, K.size / 2]);
    expect(b.c[1]! - b.half[1]!).toBeCloseTo(11, 6); // 底 = 地面の 上の 面
    co.setRed(1, 1);
    co.clear();
    expect(co.box()).toBeNull();
  });
});

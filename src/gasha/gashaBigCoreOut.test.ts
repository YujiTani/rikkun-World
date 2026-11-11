import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CoreOut, coreSpot } from './gashaBigCoreOut';
import { TUNE as T } from './gashaBigTuning';

const K = T.finish.core;
const NO = (): boolean => false;

describe('外へ 出た 大きな コア（FIX-3）', () => {
  it('調整表: 一辺 3 ブロック、体の 外 18 ブロック', () => {
    expect(K.size).toBe(3);
    expect(K.outBlocks).toBe(18);
  });

  it('置く 場所: 体の 中心から プレイヤーの 方へ outBlocks。高さは その 点の 地面の 上に 乗る 高さ（中心 = 上の 面 ＋ 半分）', () => {
    const s = coreSpot({ x: 100, z: 50 }, 0, { x: 160, z: 50 }, (x) => (x > 110 ? 20 : 99), NO, K);
    expect(s.x).toBeCloseTo(100 + K.outBlocks, 6);
    expect(s.z).toBeCloseTo(50, 6);
    expect(s.y).toBeCloseTo(20 + 1 + K.size / 2, 6); // いちばん 上の ブロック(20)の 上の 面 = 21 に 底が のる
  });

  it('斜めでも プレイヤーの 方向。体の 中心から ちょうど outBlocks はなれる', () => {
    const s = coreSpot({ x: 0, z: 0 }, 0, { x: -300, z: 400 }, () => 5, NO, K);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(K.outBlocks, 6);
    expect(s.x / s.z).toBeCloseTo(-300 / 400, 6);
  });

  it('プレイヤーが 近くても 体の 中心から outBlocks 以上（プレイヤーの 足もとには 置かない）', () => {
    const s = coreSpot({ x: 0, z: 0 }, 0, { x: 6, z: 8 }, () => 7, NO, K);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(K.outBlocks, 6);
    expect(s.x / s.z).toBeCloseTo(6 / 8, 6);
  });

  it('体の 箱と かさなる あいだは 外へ stepBlocks ずつ ずれる。maxOutBlocks で 止まる（見つからなければ 最後の 場所）', () => {
    const wall = (r: number) => (x: number, _y: number, z: number): boolean => Math.hypot(x, z) < r; // 体の 中心から r 未満は かさなる
    const a = coreSpot({ x: 0, z: 0 }, 0, { x: 100, z: 0 }, () => 5, wall(25), K);
    expect(a.x).toBeCloseTo(K.outBlocks + K.stepBlocks * Math.ceil((25 - K.outBlocks) / K.stepBlocks), 6);
    expect(a.x).toBeGreaterThanOrEqual(25);
    const b = coreSpot({ x: 0, z: 0 }, 0, { x: 100, z: 0 }, () => 5, () => true, K);
    expect(Math.hypot(b.x, b.z)).toBeLessThanOrEqual(K.maxOutBlocks);
    expect(Math.hypot(b.x, b.z)).toBeGreaterThan(K.maxOutBlocks - K.stepBlocks - 1e-6);
  });

  it('プレイヤーが 体の 真上でも NaN に ならず、体の 前（yaw）の 向きに 置く', () => {
    const t = coreSpot({ x: 3, z: 4 }, Math.PI / 2, { x: 3, z: 4 }, () => 2, NO, K);
    expect(Number.isFinite(t.x + t.y + t.z)).toBe(true);
    expect(t.x).toBeCloseTo(3 + K.outBlocks, 6); // yaw = 90度 → 前 = +x
    expect(t.z).toBeCloseTo(4, 6);
  });

  it('当たりの 箱は ワールドの 位置に 置かれ、一辺 size。底は 地面の 上の 面（刀が 地面から とどく 高さ）', () => {
    const co = new CoreOut(new Scene());
    expect(co.box()).toBeNull();
    const c = coreSpot({ x: 0, z: 0 }, 0, { x: 100, z: 0 }, () => 10, NO, K);
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

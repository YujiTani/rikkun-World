import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts';
import { createLiquidSounds, LIQUID_SOUND_TUNING } from '../fx/liquidSounds';
import type { Tone } from '../fx/sound';
import { hearFrom, nearestEar } from './hearing';

/**
 * COOP-1 作業 3c（#417）の 先行テスト（赤）。AC66（場所の ある 音の 距離は 近い方）。仕様 §3.4・§9.7・§12.0 の `duo.hearFrom`。
 * 数（そのまま 4・鳴らさない 24）は `LIQUID_SOUND_TUNING`（液体の 音の 表）から 読む。2 人用の 数は 足さない。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/hearing.ts（DOM・Three.js なし。純粋な 関数）
 *     hearFrom(p1: Vec3, p2: Vec3 | null, at: Vec3): { who: 1 | 2; distance: number }
 *       … `at`（音の 出た 点。ワールド座標。ブロックなら 中心 = x+0.5, y+0.5, z+0.5 を 渡す）から 1P・2P の 体の 位置（`controller.state.position`）までの
 *         3 次元の 直線。小さい 方の 人と その 距離（マス）。同じ 距離なら 1。p2 が null（2P が いない）なら いつも who 1。
 *     nearestEar(p1: Vec3, p2: Vec3 | null, at: Vec3): Vec3   … 上で 選ばれた 人の 位置（聞く 点）
 *   src/fx/liquidSounds.ts  createLiquidSounds の 第 3 引数 `listener` の 型を `() => Vec3` から `(at: Vec3) => Vec3` に する
 *     （音が 出た 点 = ブロックの 中心を 渡して 呼び、返った 点までの 距離で 段を 決める。今の `() => Vec3` を 渡す 呼び方も そのまま 通る = liquidSounds.test.ts は かえない）。
 *   配線（テストの 外）: player.ts の listener = (at) => nearestEar(controller.state.position, duo.pos(2), at)
 *   src/duo/types.ts  `DuoHook.hearFrom(pos: DuoVec3): { who: 1 | 2; distance: number }` … 上の hearFrom に 今の 2 人の 位置を 渡す 口（§12.0。E2E 用）
 */

const T = LIQUID_SOUND_TUNING;
/** AC66 の 数: 2P から 3 マス（そのまま 聞こえる 範囲の 中）・1P から 40 マス（鳴らさない 遠さより 遠い） */
const NEAR = T.fullDist - 1;
const FAR = T.maxDist + 16;
const CELL = { x: 100, y: 10, z: 100 };
const CENTER: Vec3 = { x: CELL.x + 0.5, y: CELL.y + 0.5, z: CELL.z + 0.5 };
const east = (d: number): Vec3 => ({ x: CENTER.x + d, y: CENTER.y, z: CENTER.z });
const west = (d: number): Vec3 => ({ x: CENTER.x - d, y: CENTER.y, z: CENTER.z });

describe('AC66: hearFrom（近い方の 人と 距離）', () => {
  it('2P から 3 マス・1P から 40 マス → 2P、distance 3（±0.5）', () => {
    const h = hearFrom(west(FAR), east(NEAR), CENTER);
    expect(h.who).toBe(2);
    expect(h.distance).toBeCloseTo(NEAR, 0);
    expect(Math.abs(h.distance - NEAR)).toBeLessThanOrEqual(0.5);
  });

  it('1P の ほうが 近ければ 1P', () => {
    const h = hearFrom(east(NEAR), west(FAR), CENTER);
    expect(h.who).toBe(1);
    expect(Math.abs(h.distance - NEAR)).toBeLessThanOrEqual(0.5);
  });

  it('2P が いない（null）ときは いつも 1P（遠くても）', () => {
    const h = hearFrom(west(FAR), null, CENTER);
    expect(h.who).toBe(1);
    expect(h.distance).toBeCloseTo(FAR, 5);
  });

  it('同じ 距離なら 1P', () => {
    expect(hearFrom(east(7), west(7), CENTER)).toEqual({ who: 1, distance: 7 });
  });

  it('距離は 3 次元の 直線（高さも 入る）。横が 近くても 高さが 遠ければ 遠い', () => {
    // 1P: 横 5・高さ 0 → 5。2P: 横 3・高さ 10 → 約 10.4（遠い）
    const p1 = east(5);
    const p2 = { x: CENTER.x + 3, y: CENTER.y + 10, z: CENTER.z };
    const h = hearFrom(p1, p2, CENTER);
    expect(h.who).toBe(1);
    expect(h.distance).toBeCloseTo(5, 5);
    expect(hearFrom(p2, p1, CENTER).who).toBe(2);
  });

  it('nearestEar は 選ばれた 人の 位置（聞く 点）を 返す', () => {
    const a = west(FAR);
    const b = east(NEAR);
    expect(nearestEar(a, b, CENTER)).toEqual(b);
    expect(nearestEar(a, null, CENTER)).toEqual(a);
    expect(nearestEar(b, a, CENTER)).toEqual(b);
  });
});

describe('AC66: 液体の 音（createLiquidSounds）に 近い方を 使う', () => {
  const fake = () => {
    const played: (readonly Tone[])[] = [];
    return { played, sound: { playTones: (t: readonly Tone[]) => void played.push(t) } };
  };

  it('2P 参加中: 水を 2P から 3 マス・1P から 40 マスに 置く → いちばん 大きい 段（0）で 鳴る', () => {
    const f = fake();
    const play = createLiquidSounds(f.sound, () => 0, (at) => nearestEar(west(FAR), east(NEAR), at));
    expect(play('placeWater', CELL.x, CELL.y, CELL.z)).toBe(0);
    expect(f.played.length).toBe(1);
  });

  it('1 人のとき（2P なし）: 40 マスでは 鳴らない（-1）', () => {
    const f = fake();
    const play = createLiquidSounds(f.sound, () => 0, (at) => nearestEar(west(FAR), null, at));
    expect(play('placeWater', CELL.x, CELL.y, CELL.z)).toBe(-1);
    expect(f.played.length).toBe(0);
  });

  it('listener には 音の 出た 点（ブロックの 中心）が わたる', () => {
    const f = fake();
    const got: Vec3[] = [];
    const play = createLiquidSounds(f.sound, () => 0, (at) => {
      got.push({ ...at });
      return CENTER;
    });
    play('erode', CELL.x, CELL.y, CELL.z);
    expect(got).toEqual([CENTER]);
  });

  it('段・鳴らさない 遠さは 液体の 表の まま（2P が 中ぐらいに 遠い → 段が 上がり、遠すぎれば 鳴らない）', () => {
    const f = fake();
    const mid = (T.fullDist + T.maxDist) / 2;
    const play = createLiquidSounds(f.sound, () => 0, (at) => nearestEar(west(FAR), east(mid), at));
    expect(play('placeWater', CELL.x, CELL.y, CELL.z)).toBeGreaterThan(0);
    const far = createLiquidSounds(f.sound, () => 0, (at) => nearestEar(west(FAR), east(T.maxDist + 1), at));
    expect(far('placeWater', CELL.x, CELL.y, CELL.z)).toBe(-1);
  });
});

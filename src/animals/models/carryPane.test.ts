import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { AnimalView } from '../../contracts';
import { AnimalFx } from '../../fx/animalFx';
import { AnimalRenderer } from './AnimalRenderer';
import { CARRY } from './animalRendererShared';
import { carryPlacement } from './carryPane';
import { RING_DIAMETER, ringState, ringStates, type ThrowSpotLike } from './throwRing';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)「だっこの 絵」・§8、AC157）の 先行テスト（赤）。
 * 今の main の 不具合: だっこの 置き場所は 1P の カメラで 1 フレーム 1 回 決まる ので、1P が だっこ すると 2P の 半分では 1P の カメラの 前に うく。
 * 5c で 区画（半分）ごとに 置きなおす。決める 材料は「その 区画の カメラ」と「だっこ した 人の 足もと」だけ。
 * だっこ中の 羽の 位置（view の x・y・z）は だっこ した 人の 足もとに 毎ステップ なる ので、足もとは view の 位置を 使う（`AnimalRendererOpts.player` は 使わない）。
 *
 * ---- 実装への 約束 ----
 *   src/animals/models/carryPane.ts   （新しい ファイル）
 *     carryPlacement(cam: Vec3, feet: Vec3, out?: CarryPlacement): CarryPlacement
 *       CarryPlacement = { first: boolean; chest: { x: number; y: number; z: number; yaw: number } }
 *       out を 渡せば その 入れものを 書きかえて 返す（区画ごと・毎フレーム 呼ぶので 毎回 new しない。CODE-RULES「毎フレーム 新しい 物を 作らない」）。
 *       省いた ときは 新しい 物を 返す（テストは こちらの 形で 見る）。
 *       first = カメラと だっこ した 人の 目〈足もと + CARRY.eyeY〉の 距離が CARRY.firstPersonDist 未満（1 人称: 自分の 半分で 自分が だっこ）。
 *       chest = 3 人称の 置き場所〈今の AnimalRenderer の 式と 同じ〉: 足もと + 高さ CARRY.chestY。水平の むきは「カメラから 足もとへ」（足もと − カメラ。
 *               足もとの むこう がわ）に CARRY.chestFront、そこから カメラから 見て 右へ CARRY.chestSide。yaw は 顔が カメラを 向く。
 *               カメラが 足もとの 真上（水平の 距離が ほぼ 0）なら むきは (0, -1)。
 *   AnimalRenderer.placeCarriedFor(camera: THREE.Camera): void
 *     いま だっこ中の 羽を その カメラで 置きなおす（`carryInfo()` も その カメラの 物に かわる）。`duo/viewRender.ts` が 区画を 描く 前に 呼ぶ。描画回数・三角形は ふやさない。
 *     `update(views, camera)` の 中の 置き方と `measureCarry` の firstPerson も 同じ `carryPlacement(...).first`・`.chest` を 使う（式を 2 つ 書かない。
 *     1 人の ときの 見た目は かわらない）。足もとは view の 位置（だっこ中は だっこ した 人の 足もと）で、`AnimalRendererOpts.player` は 使わない。
 *     AnimalRenderer.ts は 748 行（800 こえ 禁止）: 足すのは placeCarriedFor と carryPlacement を 呼ぶ 行だけ。ほかは carryPane.ts に 書く。
 *   src/animals/models/throwRing.ts   ringStates(spots: readonly (ThrowSpotLike | null)[], out?: RingState[]): RingState[]
 *     着地点の 丸は 世界に 出る: 2 人とも だっこ中なら 2 つ（`ringState` と 同じ 規則。出ない 物は のぞく）。最大 2 つ。
 *     out を 渡せば その 配列を 空にして 入れて 返す（毎フレーム new しない）。省いた ときは 新しい 配列。
 *
 * ---- 開発への 伝え（にわとりの 側。ここでは 見ない）----
 *   animalCarry.ts は 441 行: だっこを 人ごとに する とき `[1, 2]` の 人ごとの 記録で 持つ（式を 2 つ 書かない。人ごとの 記録の 1 つが 1 人の 今の 状態）。
 */

const feetOf = (x: number, z: number) => ({ x, y: 9, z });

describe('carryPlacement・ringStates: out（毎フレーム new しない）', () => {
  it('carryPlacement: out を 渡すと その 入れものを 書きかえて 返す。答えは out なしと 同じ', () => {
    const f = feetOf(50, 10);
    const cam = { x: 50, y: 11, z: 16 };
    const out = { first: true, chest: { x: 0, y: 0, z: 0, yaw: 0 } };
    const chest = out.chest;
    const r = carryPlacement(cam, f, out);
    expect(r).toBe(out);
    expect(r.chest).toBe(chest);
    expect(r).toEqual(carryPlacement(cam, f));
  });
  it('ringStates: out を 渡すと その 配列を 空にして 入れて 返す', () => {
    const out: ReturnType<typeof ringStates> = [];
    const spot = (x: number): ThrowSpotLike => ({ x, y: 9, z: 5, ok: true, home: null, toss: true });
    const r = ringStates([spot(1), spot(40)], out);
    expect(r).toBe(out);
    expect(out).toHaveLength(2);
    ringStates([spot(1), null], out);
    expect(out).toHaveLength(1);
  });
});

describe('carryPlacement（区画ごとの 置き場所の 計算）', () => {
  it('自分の 半分で 自分が だっこ: カメラが 自分の 目の 近く → 1 人称', () => {
    const f = feetOf(10, 10);
    expect(carryPlacement({ x: f.x, y: f.y + CARRY.eyeY, z: f.z }, f).first).toBe(true);
    expect(carryPlacement({ x: f.x, y: f.y + CARRY.eyeY + CARRY.firstPersonDist * 0.5, z: f.z }, f).first).toBe(true);
  });
  it('相手の 半分で だっこ: カメラが 遠い（だっこ した 人の 目から firstPersonDist 以上）→ 3 人称', () => {
    const f2 = feetOf(50, 10);
    const camOfP1 = { x: 10, y: 9 + CARRY.eyeY, z: 10 };
    expect(carryPlacement(camOfP1, f2).first).toBe(false);
    // 3 人称の カメラ（うしろ 4 マス）でも 自分の 体から はなれて いれば 3 人称
    expect(carryPlacement({ x: 50, y: 9 + CARRY.eyeY + 1, z: 14 }, f2).first).toBe(false);
  });
  it('3 人称の 置き場所: 足もとから の 高さ・前・横が 設定の とおり、顔が カメラを 向く', () => {
    const f = feetOf(50, 10);
    const cam = { x: 50, y: 11, z: 16 };
    const { chest } = carryPlacement(cam, f);
    expect(chest.y).toBeCloseTo(f.y + CARRY.chestY, 6);
    expect(Math.hypot(chest.x - f.x, chest.z - f.z)).toBeCloseTo(Math.hypot(CARRY.chestFront, CARRY.chestSide), 6);
    const toCam = { x: cam.x - chest.x, z: cam.z - chest.z };
    const len = Math.hypot(toCam.x, toCam.z);
    // 顔（−z）の むき = (−sin yaw, −cos yaw) が カメラの ほう
    expect(-Math.sin(chest.yaw)).toBeCloseTo(toCam.x / len, 6);
    expect(-Math.cos(chest.yaw)).toBeCloseTo(toCam.z / len, 6);
    // 前（カメラの ほうへ）の 成分は chestFront、右の 成分は chestSide
    const ux = (cam.x - f.x) / Math.hypot(cam.x - f.x, cam.z - f.z);
    const uz = (cam.z - f.z) / Math.hypot(cam.x - f.x, cam.z - f.z);
    const rx = chest.x - f.x;
    const rz = chest.z - f.z;
    expect(Math.abs(rx * ux + rz * uz)).toBeCloseTo(CARRY.chestFront, 6);
    expect(Math.abs(-rx * uz + rz * ux)).toBeCloseTo(CARRY.chestSide, 6);
  });
  it('同じ 羽でも カメラが ちがえば 置き場所が ちがう（区画ごと）: 2 つの カメラで 別の 向き', () => {
    const f = feetOf(50, 10);
    const a = carryPlacement({ x: 10, y: 10.6, z: 10 }, f).chest;
    const b = carryPlacement({ x: 50, y: 10.6, z: 20 }, f).chest;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.1);
  });
});

const view = (o: Partial<AnimalView> = {}): AnimalView => ({
  id: 1, x: 0, y: 9, z: 6, yaw: 0, headYaw: 0, state: 'carried', stateTicks: 0, friend: true, hearts: 0, targeted: false, carried: true, ...o,
});
function setup(player: () => { x: number; y: number; z: number } | null) {
  const fx = new AnimalFx({ sound: { playTones: () => {} } });
  const r = new AnimalRenderer({ fx, player });
  const cam = (x: number, y: number, z: number, lookZ = z - 6) => {
    const c = new THREE.PerspectiveCamera(75, 1.6, 0.1, 200);
    c.position.set(x, y, z);
    c.lookAt(x, y, lookZ);
    c.updateMatrixWorld(true);
    return c;
  };
  return { r, cam };
}

describe('AnimalRenderer: 区画ごとの だっこの 絵', () => {
  it('1P の カメラで 2P が だっこ した 羽を 描くと 3 人称（2P の 胸の 前）。1P の カメラの 前には うかない', () => {
    const { r, cam } = setup(() => ({ x: 0, y: 9, z: 6 })); // player() は 1P の 足もと（今の 実装は これで 決める）
    const c1 = cam(0, 9 + CARRY.eyeY, 6);
    r.update([view({ x: 50, z: 6 })], c1); // 羽は 2P（x=50）の 足もと
    const info = r.carryInfo()!;
    expect(info.firstPerson).toBe(false);
    expect(Math.hypot(info.x - 50, info.z - 6)).toBeLessThan(1.2);
  });
  it('placeCarriedFor(camera): 同じ 羽を 2P の カメラで 置きなおす → 2P が だっこ なら 1 人称、1P の カメラでは 3 人称', () => {
    const { r, cam } = setup(() => ({ x: 0, y: 9, z: 6 }));
    const c1 = cam(0, 9 + CARRY.eyeY, 6);
    const c2 = cam(50, 9 + CARRY.eyeY, 6);
    r.update([view({ x: 50, z: 6 })], c1);
    expect(r.carryInfo()!.firstPerson).toBe(false);
    r.placeCarriedFor(c2);
    const info2 = r.carryInfo()!;
    expect(info2.firstPerson).toBe(true);
    expect(Math.abs(info2.centerNdcX)).toBeLessThan(0.1);
    expect(info2.topNdcY).toBeLessThanOrEqual(-0.08);
    r.placeCarriedFor(c1);
    expect(r.carryInfo()!.firstPerson).toBe(false);
  });
  it('1 人の とき（1P が だっこ・1P の カメラ）は 今までどおり 1 人称', () => {
    const { r, cam } = setup(() => ({ x: 0, y: 9, z: 6 }));
    r.update([view({ x: 0, z: 6 })], cam(0, 9 + CARRY.eyeY, 6));
    expect(r.carryInfo()!.firstPerson).toBe(true);
  });
});

describe('着地点の 丸は 世界に 出る（2 つまで）', () => {
  const spot = (x: number, ok = true): ThrowSpotLike => ({ x, y: 9, z: 5, ok, home: null, toss: true });
  it('2 人とも だっこ中なら 丸 2 つ。1 人だけなら 1 つ。出ない 物（null・ok false）は のぞく', () => {
    expect(ringStates([spot(1), spot(40)])).toHaveLength(2);
    expect(ringStates([spot(1), null])).toEqual([ringState(spot(1))]);
    expect(ringStates([null, spot(40)])).toEqual([ringState(spot(40))]);
    expect(ringStates([spot(1), spot(40, false)])).toHaveLength(1);
    expect(ringStates([null, null])).toEqual([]);
    expect(ringStates([spot(1), spot(40)])[1]!.diameter).toBe(RING_DIAMETER);
  });
});

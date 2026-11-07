import { describe, expect, it, vi } from 'vitest';
import {
  askAimedParry, aimedHearts, createAimLock, facingCamera, pickTarget, targetsOf,
  type GashaTarget,
} from './gashaTargets';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)・§8 の 4d-3 の 行・§9.10・AC109・AC111・AC112・AC113）: 実装の 前に 書いた 赤の テスト。
 * 「がしゃどくろ・少女の 部品が 受ける プレイヤーを 人の 一覧に」する ための、描画も ゲームも いらない 小さな 共通部品。1P と 2P で 同じ 部品を 使う（式の コピーを 作らない）。
 *
 * ---- 開発への 約束（新しい ファイル `src/gasha/gashaTargets.ts`。名前は 開発が かえて よいが、かえたら 依頼文と 仕様に 書く）----
 *   interface GashaTarget {                          // 仕様 §8「deps.targets(): readonly GashaTarget[]」の 1 つ。毎回 targets() を 呼んで 読み直す（2P の さんか・やめるが ステップごとに かわる）
 *     readonly who: 1 | 2;
 *     readonly pos: { x: number; y: number; z: number };   // 足もと
 *     readonly yawDeg: number;                             // 向き（度）
 *     readonly down: boolean;                              // 倒れて いる（ねらいから のぞく。ハート 0 の とき）
 *     hurt?(amount: number, from: V3): boolean;            // 今の deps.hurt と 同じ（入ったら true）
 *     carry?(dx, dy, dz, dYawDeg): void;                   // 今の deps.carryPlayer
 *     nudge?(dx, dz): void;                                // 今の deps.nudgePlayer
 *     setVelocity?(v: V3): void;                           // 今の deps.setPlayerVelocity
 *     body?(): { position: V3; velocity: V3; onGround?: boolean };   // 今の deps.playerBody
 *     setNoFall?(on: boolean): void;                       // 今の deps.setNoFall
 *     blockInput?(fn: () => boolean): void;                // 今の deps.blockPlayerInput（その人の 入力だけ 止める）
 *     knockbackMul?(): number;                             // 今の deps.knockbackMul（その人の 羽織）
 *     hitStop?(ticks: number): void; shake?(amount: number): void;   // 今の deps.hitStop・shake（その人の 半分だけ。4d-0 の impactFor(who) に つなぐ）
 *     parry?(h: { dirDeg: number | null; by: 'attack' | 'fireball'; amount: number }): { result: 'success' | 'early' | 'fail' | 'none'; amount: number };   // 4d-1 の あと つなぐ（今の GashaGirlDeps.parry と 同じ 形）
 *     hearts?(): { hp: number; maxHp: number };            // 少女が 見る ハート
 *     camera?: Camera;                                     // その人の 半分の カメラ（板の 絵の 向き。AC112）
 *     hit?: HitSources; defIgnore?(): number; onStrike?(i): void;   // その人の 攻撃の 当たりの 形（gashaBigHit.test の HitEnv.players 側）
 *   }
 *   pickTarget(targets, from): GashaTarget | null     … 近い 方（3 次元の 直線。down は のぞく。同じ きょりなら 1P）。いなければ null
 *   createAimLock(): AimLock                          … わざを 始める ステップで 決め、とちゅうで かえない
 *       start(targets, from): GashaTarget | null      … 今 決める（毎回 決め直す。わざの はじめに 1 回 呼ぶ）
 *       who(): 1 | 2 | null / spot(): V3 | null / live(targets): GashaTarget | null / clear(): void
 *   targetsOf(deps): readonly GashaTarget[]           … deps.targets が あれば それ。なければ 今の deps.player ほかから 1P 1 つを 作る（1 人の ときは 今の まま。AC113）
 *   askAimedParry(aim, h) / aimedHearts(aim, fallback) / facingCamera(aim, fallback)   … 少女・板の 絵が ねらった 人の パリィ・ハート・カメラを 使う 小さな 道具
 *
 * ---- 実装への 注意 ----
 *   行数: gashaBigActor.ts 786・gashaGirl.ts 713・gashaBigHit.ts 586 → 800 を こえない（eslint max-lines）。ねらいの 固定は この gashaTargets.ts に、
 *   人ごとの 当たりの 覚え（swing・wave・dome）は 小さい 別の 部品に 分ける。targetsOf・deps.targets は 毎ステップ 新しい 配列・物を 作らない（1P の 写しは getter つきの 1 つを 使いまわす）。
 *   がしゃどくろを たおしても けいけんちは 出ない（今の まま。仕様 §3.6 (c)）。とどめの 人（LastHit.who・onDefeated(who)）は 止め・ゆれを 受ける 相手。
 */

type V3 = { x: number; y: number; z: number };

const person = (who: 1 | 2, pos: V3, over: Partial<GashaTarget> = {}): GashaTarget => ({ who, pos, yawDeg: 0, down: false, ...over }) as GashaTarget;
const from: V3 = { x: 0, y: 0, z: 0 };

describe('pickTarget（AC109: 近い 方を ねらう）', () => {
  it('近い 方。1 人だけ なら その人。いなければ null', () => {
    expect(pickTarget([person(1, { x: 0, y: 0, z: 30 }), person(2, { x: 0, y: 0, z: 10 })], from)?.who).toBe(2);
    expect(pickTarget([person(1, { x: 0, y: 0, z: 10 }), person(2, { x: 0, y: 0, z: 30 })], from)?.who).toBe(1);
    expect(pickTarget([person(1, { x: 40, y: 0, z: 0 })], from)?.who).toBe(1);
    expect(pickTarget([], from)).toBeNull();
  });

  it('3 次元の 直線: 横は 近くても 高い 所に いる 人より、横が 少し 遠い 人が 近い', () => {
    const high = person(2, { x: 0, y: 30, z: 5 }); // 直線 約 30.4
    const flat = person(1, { x: 0, y: 0, z: 24 }); // 直線 24
    expect(pickTarget([high, flat], from)?.who).toBe(1);
    expect(pickTarget([flat, high], from)?.who).toBe(1);
  });

  it('同じ きょりなら 1P（並び順に よらない）', () => {
    const a = person(1, { x: 6, y: 0, z: 8 }), b = person(2, { x: -8, y: 0, z: 6 }); // どちらも 10
    expect(pickTarget([a, b], from)?.who).toBe(1);
    expect(pickTarget([b, a], from)?.who).toBe(1);
  });

  it('倒れている 人は のぞく（もう 1 人が 遠くても その人）。2 人とも 倒れて いたら null', () => {
    const d1 = person(1, { x: 0, y: 0, z: 5 }, { down: true }), p2 = person(2, { x: 0, y: 0, z: 50 });
    expect(pickTarget([d1, p2], from)?.who).toBe(2);
    expect(pickTarget([d1, person(2, { x: 0, y: 0, z: 9 }, { down: true })], from)).toBeNull();
  });
});

describe('createAimLock（AC109: わざを 始める ステップで 決め、とちゅうでは かえない）', () => {
  it('start で 近い 方を 決める。とちゅうで 相手が 近く なっても かえない（live も 決めた 人）', () => {
    const lock = createAimLock();
    expect(lock.who()).toBeNull();
    const p1 = person(1, { x: 0, y: 0, z: 24 }), p2 = person(2, { x: 0, y: 0, z: 40 });
    expect(lock.start([p1, p2], from)?.who).toBe(1);
    expect(lock.who()).toBe(1);
    // 2P が ぐっと 近づく（1P より 近い）
    const near2 = person(2, { x: 0, y: 0, z: 8 });
    expect(lock.live([p1, near2])?.who).toBe(1);
    expect(lock.who()).toBe(1);
  });

  it('決めた 人が 倒れても そのまま（live は 倒れた 人を 返す）。もう 1 人に うつらない', () => {
    const lock = createAimLock();
    const p1 = person(1, { x: 0, y: 0, z: 30 }), p2 = person(2, { x: 0, y: 0, z: 10 });
    lock.start([p1, p2], from);
    expect(lock.who()).toBe(2);
    const down2 = person(2, { x: 0, y: 0, z: 10 }, { down: true });
    expect(lock.live([p1, down2])?.who).toBe(2);
    expect(lock.live([p1, down2])?.down).toBe(true);
    expect(lock.who()).toBe(2);
  });

  it('決めた 人が やめた（一覧から 消えた）ら live は null。でも who と 場所（決めた 時の まま）は のこる', () => {
    const lock = createAimLock();
    const p1 = person(1, { x: 0, y: 0, z: 30 }), p2 = person(2, { x: 3, y: 1, z: 10 });
    lock.start([p1, p2], from);
    expect(lock.who()).toBe(2);
    expect(lock.spot()).toEqual({ x: 3, y: 1, z: 10 });
    (p2 as { pos: V3 }).pos = { x: 50, y: 1, z: 50 }; // 動いても 決めた 時の 場所
    expect(lock.spot()).toEqual({ x: 3, y: 1, z: 10 });
    expect(lock.live([p1])).toBeNull();
    expect(lock.who()).toBe(2);
  });

  it('次の わざの start で 決め直す。clear で なにも ねらわない（null）。2 人とも 倒れていたら start も null', () => {
    const lock = createAimLock();
    const far1 = person(1, { x: 0, y: 0, z: 30 }), near2 = person(2, { x: 0, y: 0, z: 10 });
    lock.start([far1, near2], from);
    expect(lock.who()).toBe(2);
    lock.start([person(1, { x: 0, y: 0, z: 5 }), near2], from);
    expect(lock.who()).toBe(1);
    lock.clear();
    expect(lock.who()).toBeNull();
    expect(lock.spot()).toBeNull();
    expect(lock.live([far1, near2])).toBeNull();
    expect(lock.start([person(1, { x: 0, y: 0, z: 5 }, { down: true }), person(2, { x: 0, y: 0, z: 6 }, { down: true })], from)).toBeNull();
    expect(lock.who()).toBeNull();
  });
});

describe('targetsOf（AC113: 1 人の ときは 今の まま）', () => {
  it('deps.targets が あれば それを そのまま（毎回 呼ぶ）', () => {
    const list = [person(1, { x: 1, y: 2, z: 3 }), person(2, { x: 4, y: 5, z: 6 })];
    const targets = vi.fn(() => list);
    expect(targetsOf({ targets, player: () => ({ x: 0, y: 0, z: 0, yawDeg: 0 }) })).toBe(list);
    targetsOf({ targets, player: () => ({ x: 0, y: 0, z: 0, yawDeg: 0 }) });
    expect(targets).toHaveBeenCalledTimes(2);
  });

  it('deps.targets が なければ 今の 口（player・hurt・carryPlayer ほか）から 1P 1 つ。位置は 毎回 読み直す。無い 口は 無いまま', () => {
    const ply = { x: 1, y: 2, z: 3, yawDeg: 90 };
    const hurts: number[] = [];
    const vel: V3[] = [];
    const list = targetsOf({ player: () => ply, hurt: (a: number) => { hurts.push(a); return true; }, setPlayerVelocity: (v: V3) => { vel.push(v); }, knockbackMul: () => 0.3 });
    expect(list.length).toBe(1);
    const t = list[0]!;
    expect(t.who).toBe(1);
    expect(t.down).toBe(false);
    expect(t.pos).toEqual({ x: 1, y: 2, z: 3 });
    expect(t.yawDeg).toBe(90);
    expect(t.hurt?.(4, from)).toBe(true);
    expect(hurts).toEqual([4]);
    t.setVelocity?.({ x: 0, y: 5, z: 0 });
    expect(vel).toEqual([{ x: 0, y: 5, z: 0 }]);
    expect(t.knockbackMul?.()).toBe(0.3);
    expect(t.carry).toBeUndefined();
    expect(t.nudge).toBeUndefined();
    expect(t.setNoFall).toBeUndefined();
    ply.x = 9; ply.yawDeg = 0;
    const t2 = targetsOf({ player: () => ply })[0]!;
    expect(t2.pos.x).toBe(9);
    expect(t2.yawDeg).toBe(0);
  });
});

describe('少女・板の 絵の 小さな 道具（AC111・AC112）', () => {
  const h = { dirDeg: 10, by: 'fireball' as const, amount: 4 };

  it('askAimedParry: ねらった 人の パリィに 聞く。ねらった 人が パリィを もたない（2P は 4d-1 の まえ）・だれも ねらわない ときは none。もう 1 人の パリィには 聞かない', () => {
    const p1parry = vi.fn(() => ({ result: 'success' as const, amount: 0 }));
    const p2parry = vi.fn(() => ({ result: 'early' as const, amount: 2 }));
    const one = person(1, from, { parry: p1parry });
    const two = person(2, from, { parry: p2parry });
    expect(askAimedParry(one, h)).toEqual({ result: 'success', amount: 0 });
    expect(p1parry).toHaveBeenCalledWith(h);
    expect(p2parry).not.toHaveBeenCalled();
    expect(askAimedParry(two, h)).toEqual({ result: 'early', amount: 2 });
    // 2P を ねらう こうげきに 1P が パリィしても 成功に ならない（2P は パリィを もたない）
    const noParry2 = person(2, from);
    p1parry.mockClear();
    expect(askAimedParry(noParry2, h)).toEqual({ result: 'none', amount: 4 });
    expect(p1parry).not.toHaveBeenCalled();
    expect(askAimedParry(null, h)).toEqual({ result: 'none', amount: 4 });
  });

  it('aimedHearts: ねらった 人の ハート。ハートの 口が なければ fallback（今の 1P の 数）', () => {
    const fb = () => ({ hp: 20, maxHp: 20 });
    expect(aimedHearts(person(2, from, { hearts: () => ({ hp: 6, maxHp: 20 }) }), fb)).toEqual({ hp: 6, maxHp: 20 });
    expect(aimedHearts(person(1, from), fb)).toEqual({ hp: 20, maxHp: 20 });
    expect(aimedHearts(null, fb)).toEqual({ hp: 20, maxHp: 20 });
  });

  it('facingCamera: ねらっている 人の カメラ。カメラを もたない・だれも ねらわない ときは fallback（今の game.camera）', () => {
    const cam1 = { name: 'cam1' } as never, cam2 = { name: 'cam2' } as never, fb = { name: 'fallback' } as never;
    expect(facingCamera(person(2, from, { camera: cam2 }), fb)).toBe(cam2);
    expect(facingCamera(person(1, from, { camera: cam1 }), fb)).toBe(cam1);
    expect(facingCamera(person(1, from), fb)).toBe(fb);
    expect(facingCamera(null, fb)).toBe(fb);
  });
});

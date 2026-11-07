import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps, type GashaBigHandle } from './gashaBig';
import type { GashaTarget } from './gashaTargets';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)・§8 の 4d-3 の 行・§10 の 【4d】・§12.0 `duo.gasha.target()`・AC109・AC110・AC111）: がしゃどくろ（大きな 姿）を にせの 2 人で コマ送り。実装の 前に 書いた 赤の テスト。
 *
 * ---- 開発への 約束（`src/gasha/gashaBigDeps.ts`・`gashaBig.ts`。名前は 開発が かえて よいが、かえたら 依頼文と 仕様に 書く）----
 *   GashaBigDeps.targets?(): readonly GashaTarget[]   … 人の 一覧（`src/gasha/gashaTargets.ts` の GashaTarget。1 人の ときは 1 つ。毎ステップ 読み直す）。
 *       あれば ねらう・ダメージ・のせる／押す・入力止め・落ちない・止め・ゆれは **ぜんぶ ここの 人ごとの 口**を 使う（今の deps.player / hurt / carryPlayer / nudgePlayer /
 *       setPlayerVelocity / playerBody / setNoFall / blockPlayerInput / hitStop / shake は 1 人用。targets が ある ときは 使わない）。なければ 今の まま（AC113）。
 *   GashaBigHandle.targetWho(): 1 | 2 | null           … 今 ねらっている 人（`duo.gasha.target()` の もと）。わざの 最中は 始めた ときに 決めた 人（とちゅうで かえない）、
 *       それ以外は 今 いちばん 近い 人。体が ない（despawn・hide）・だれも ねらえない（2 人とも 倒れている）ときは null。近い方＝3 次元の 直線・倒れている 人は のぞく・同じなら 1P。
 *   GashaBigHandle.damage(part, amount, at?, source?, who?: 1 | 2)   … 5 つ目に 当てた 人（既定 1）。
 *   GashaBigDeps.onDefeated?(who: 1 | 2)               … 体力 0 の 最後の 一撃を 当てた 人（とどめの 止め・ゆれを 受ける 相手。がしゃどくろを たおしても けいけんちは 出ない〈今の まま。仕様 §3.6 (c)〉。実績は 2 人で 1 つ なので 呼ぶ 側が 1 回だけ 記録）。
 *   とどめの 止め・ゆれ（hitStop・shake）は 当てた 人の GashaTarget.hitStop・shake だけに わたす（もう 1 人には わたさない）。
 *   ひるみの 入力止めは GashaTarget.blockInput に 人ごとに 登録する（`BigShockSet.inputBlocked(who)`）。

 *   [実装への 注意] 行数: gashaBigActor.ts 786・gashaGirl.ts 713・gashaBigHit.ts 586 は 800 を こえない（eslint max-lines）。ねらいの 固定は gashaTargets.ts、人ごとの 当たりの 覚え（swing・wave・dome）は 小さい 別の 部品に 分ける。
 *     targetsOf・deps.targets は 毎ステップ 新しい 配列・物を 作らない（1P の 写しは getter つきの 1 つを 使いまわす）。
 *   体の 上の 人を ゆさぶる（nudge）・のせて 運ぶ（carry）、噴火の 近くの ゆれ（shakeNear）・隕石の 落下範囲は その人の 口へ（のって いる 人だけ・ジャンプ中の 人は 押されない）。
 */

function rig(opts: { ground?: number } = {}) {
  const ups: ((dt: number) => void)[] = [];
  const st = {
    1: { x: 0, y: 0, z: 0, yawDeg: 0, ground: true, down: false },
    2: { x: 0, y: 0, z: 0, yawDeg: 0, ground: true, down: false },
  };
  const log = {
    hurt: { 1: [] as number[], 2: [] as number[] },
    nudge: { 1: 0, 2: 0 },
    stops: { 1: [] as number[], 2: [] as number[] },
    shakes: { 1: [] as number[], 2: [] as number[] },
    defeated: [] as (1 | 2 | undefined)[],
    blockRegistered: { 1: 0, 2: 0 },
    legacyHurt: 0,
  };
  const blockFn: { 1: () => boolean; 2: () => boolean } = { 1: () => false, 2: () => false };
  const person = (who: 1 | 2): GashaTarget => ({
    who,
    get pos() { return { x: st[who].x, y: st[who].y, z: st[who].z }; },
    get yawDeg() { return st[who].yawDeg; },
    get down() { return st[who].down; },
    hurt: (a: number) => { log.hurt[who].push(a); return true; },
    carry: (dx: number, dy: number, dz: number) => { st[who].x += dx; st[who].y += dy; st[who].z += dz; },
    nudge: (dx: number, dz: number) => { st[who].x += dx; st[who].z += dz; log.nudge[who]++; },
    setVelocity: () => {},
    body: () => ({ position: { x: st[who].x, y: st[who].y, z: st[who].z }, velocity: { x: 0, y: 0, z: 0 }, onGround: st[who].ground }),
    setNoFall: () => {},
    blockInput: (fn: () => boolean) => { blockFn[who] = fn; log.blockRegistered[who]++; },
    hitStop: (n: number) => { log.stops[who].push(n); },
    shake: (a: number) => { log.shakes[who].push(a); },
  }) as GashaTarget;
  const people = [person(1), person(2)];
  const deps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    // 1 人用の 口（targets が ある ときは 使われない はず。1P の 位置だけ 型の ために 合わせる）
    player: () => ({ x: st[1].x, y: st[1].y, z: st[1].z, yawDeg: st[1].yawDeg }),
    groundY: () => opts.ground ?? -1, addPlayerSolid: () => {}, onUpdate: (fn: (dt: number) => void) => { ups.push(fn); },
    hurt: () => { log.legacyHurt++; return true; },
    reducedMotion: () => false, onBeforeRender: () => {},
    onDefeated: (who?: 1 | 2) => { log.defeated.push(who); },
    targets: () => people,
  } as unknown as GashaBigDeps;
  const h: GashaBigHandle = startGashaBig(deps);
  h.walk(false);
  h.refreshColliders();
  const info = h.info() as { pos: number[]; yawDeg: number };
  const yaw = (info.yawDeg * Math.PI) / 180;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const boss = { x: info.pos[0]!, y: info.pos[1]!, z: info.pos[2]! };
  /** 体の 前 dist ブロックに 置く */
  const put = (who: 1 | 2, dist: number, y = 0) => { st[who].x = boss.x + fx * dist; st[who].z = boss.z + fz * dist; st[who].y = y; };
  const step = (n: number, each?: (i: number) => void) => { for (let i = 0; i < n; i++) { each?.(i); for (const f of ups) f(1 / 60); } };
  return { h, st, log, step, put, boss, blockFn };
}
const sec = (s: number) => Math.round(s * 60);
/** 今の わざ(mode が attack)が おわる まで 1 秒ずつ 進める（ならしの あと 次の わざが はじまる 前の 'angry' で 止まる）。maxSec で 打ち切り */
const untilAttackEnds = (r: { h: GashaBigHandle; step: (n: number) => void }, maxSec = 40): void => {
  for (let i = 0; i < maxSec * 60 && r.h.attackInfo().mode === 'attack'; i++) r.step(1);
};

describe('がしゃどくろが ねらう 人（AC109・duo.gasha.target）', () => {
  let chase = true;
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); chase = T.chase.enabled; T.chase.enabled = false; });
  afterEach(() => { vi.unstubAllGlobals(); T.chase.enabled = chase; });

  it('近い 方を ねらう（2P が 近ければ 2P・1P が 近ければ 1P・同じなら 1P）', () => {
    const r = rig();
    r.put(1, 40); r.put(2, 24);
    expect(r.h.targetWho()).toBe(2);
    r.put(1, 20); r.put(2, 30);
    expect(r.h.targetWho()).toBe(1);
    r.put(1, 30); r.put(2, 30);
    expect(r.h.targetWho()).toBe(1);
  });

  it('倒れている 人は のぞく（2P が 近くても 倒れて いれば 1P）。2 人とも 倒れたら だれも ねらわない（null）', () => {
    const r = rig();
    r.put(1, 40); r.put(2, 24);
    r.st[2].down = true;
    expect(r.h.targetWho()).toBe(1);
    r.st[1].down = true;
    expect(r.h.targetWho()).toBeNull();
  });

  it('体を しまう（despawn）と だれも ねらわない（null）', () => {
    const r = rig();
    r.put(1, 24); r.put(2, 30);
    expect(r.h.targetWho()).toBe(1);
    r.h.despawn();
    expect(r.h.targetWho()).toBeNull();
  });

  it('光線は ねらった 人に 向かう: 近い 2P だけが 光線を 受け、1P は ダメージが ない', () => {
    const r = rig();
    r.put(1, 44); r.put(2, 24);
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec + 6));
    expect(r.h.targetWho()).toBe(2);
    expect(r.log.hurt[2].length).toBeGreaterThanOrEqual(2);
    expect(r.log.hurt[2][0]).toBe(T.beam.damage);
    expect(r.log.hurt[1]).toEqual([]);
  });

  it('わざを 始めた ステップで 決め、とちゅうでは かえない: 1P を ねらった 光線の 最中に 2P が 近づいても 1P を ねらいつづけ（2P は ダメージなし）、おわると 近い 2P に かわる', () => {
    const r = rig();
    r.put(1, 24); r.put(2, 44);
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec * 0.5));
    expect(r.h.targetWho()).toBe(1);
    r.put(2, 10); // 2P が ぐっと 近づく
    r.step(sec(T.beam.chargeSec * 0.5 + 4));
    expect(r.h.targetWho()).toBe(1);
    expect(r.log.hurt[1].length).toBeGreaterThanOrEqual(1);
    expect(r.log.hurt[2]).toEqual([]);
    untilAttackEnds(r); // 光線が おわる まで（そのあと ならしの 間は 'angry'。次の わざが はじまる 前）
    expect(r.h.attackInfo().mode).toBe('angry');
    expect(r.h.targetWho()).toBe(2);
  });

  it('ねらった 人が とちゅうで 倒れても その わざは さいごまで（ねらいは かわらない）。次の わざから もう 1 人', () => {
    const r = rig();
    r.put(1, 44); r.put(2, 24);
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec * 0.5));
    expect(r.h.targetWho()).toBe(2);
    r.st[2].down = true;
    r.step(sec(T.beam.chargeSec * 0.5 + 2));
    expect(r.h.targetWho()).toBe(2);
    untilAttackEnds(r);
    expect(r.h.attackInfo().mode).toBe('angry');
    expect(r.h.targetWho()).toBe(1);
  });
});

describe('ひるみ・のる・止め・ゆれ・とどめ（AC110・AC111）', () => {
  let chase = true;
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); chase = T.chase.enabled; T.chase.enabled = false; });
  afterEach(() => { vi.unstubAllGlobals(); T.chase.enabled = chase; });

  it('ひるみの 入力止めは 人ごとの 口に 登録される（1P も 2P も。はじめは どちらも 止まって いない）', () => {
    const r = rig();
    expect(r.log.blockRegistered[1]).toBe(1);
    expect(r.log.blockRegistered[2]).toBe(1);
    expect(r.blockFn[1]()).toBe(false);
    expect(r.blockFn[2]()).toBe(false);
  });

  it('とどめを 2P が 当てると、体力 0・onDefeated(2)・止めと ゆれは 2P の 口だけ（1P には 来ない）', () => {
    const r = rig();
    r.put(1, 30); r.put(2, 30);
    r.step(12);
    expect(r.h.damage('core', 1e6, null, 'blade', 2)).toBeGreaterThan(0);
    expect(r.h.hp()).toBe(0);
    r.step(2);
    expect(r.log.defeated).toEqual([2]);
    expect(r.log.stops[2]).toEqual([T.finish.blow.hitStopTicks]);
    expect(r.log.shakes[2]).toEqual([T.finish.blow.shake]);
    expect(r.log.stops[1]).toEqual([]);
    expect(r.log.shakes[1]).toEqual([]);
  });

  it('とどめを 1P が 当てると 1P の 口だけ（当てた 人の 指定が なければ 1P）', () => {
    const r = rig();
    r.put(1, 30); r.put(2, 30);
    r.step(12);
    r.h.damage('core', 1e6);
    r.step(2);
    expect(r.log.defeated).toEqual([1]);
    expect(r.log.stops[1]).toEqual([T.finish.blow.hitStopTicks]);
    expect(r.log.shakes[1]).toEqual([T.finish.blow.shake]);
    expect(r.log.stops[2]).toEqual([]);
    expect(r.log.shakes[2]).toEqual([]);
  });

  it('アースクエイク: 体の 肩に のっている 2P だけが ゆさぶられる（遠くの 1P は 押されない）', () => {
    const r = rig();
    const part = r.h.colliders().filter((c) => c.name.startsWith('shoulderCloth')).sort((a, b) => b.center[1] + b.half[1] - (a.center[1] + a.half[1]))[0]!;
    r.st[2].x = part.center[0]; r.st[2].y = part.center[1] + part.half[1]; r.st[2].z = part.center[2];
    r.st[1].x = r.boss.x + 300; r.st[1].z = r.boss.z;
    const K = T.slam2;
    r.h.attack('slam2');
    r.step(Math.ceil((K.windupSec + K.holdSec + K.slamSec + K.quake.sec + 1.2) * 60));
    expect(r.log.nudge[2]).toBeGreaterThan(5);
    expect(r.log.nudge[1]).toBe(0);
  });

  it('アースクエイク: 2 人とも のっていても ジャンプ中（地面に いない）の 人は 押されない', () => {
    const r = rig();
    const part = r.h.colliders().filter((c) => c.name.startsWith('shoulderCloth')).sort((a, b) => b.center[1] + b.half[1] - (a.center[1] + a.half[1]))[0]!;
    for (const who of [1, 2] as const) { r.st[who].x = part.center[0]; r.st[who].y = part.center[1] + part.half[1]; r.st[who].z = part.center[2]; }
    r.st[2].ground = false;
    const K = T.slam2;
    r.h.attack('slam2');
    r.step(Math.ceil((K.windupSec + K.holdSec + K.slamSec + K.quake.sec + 1.2) * 60));
    expect(r.log.nudge[1]).toBeGreaterThan(5);
    expect(r.log.nudge[2]).toBe(0);
  });

  it('のって 運ばれる: 手の 上に のっている 2P だけが 手が 持ち上がる ぶん 運ばれる（遠くの 1P は 動かない）。リグは 物理が なく、手が 地面（y < 1）まで さがると のりが 外れる ので、体を 高い 所（地面 99）に 置く', () => {
    const r = rig({ ground: 99 });
    // いちばん 大きい 手の 箱（手のひら）の 上面の まんなかに 立たせる。箱の 動きは ゲームに 聞く
    const vol = (c: { half: number[] }): number => c.half[0]! * c.half[1]! * c.half[2]!;
    const palm = r.h.colliders().filter((c) => c.name.startsWith('hand')).sort((a, b) => vol(b) - vol(a))[0]!;
    const midNow = (): number => r.h.colliders().find((k) => k.name === palm.name)!.center[1]; // 手のひらの まんなかの 高さ（かたむいても 上面の 外わく は のびる ので まんなかで くらべる）
    const y0 = palm.center[1] + palm.half[1];
    const mid0 = midNow();
    r.st[2].x = palm.center[0]; r.st[2].y = y0; r.st[2].z = palm.center[2];
    r.st[1].x = r.boss.x + 300; r.st[1].y = 0; r.st[1].z = r.boss.z;
    r.h.attack('slam2');
    for (let i = 0; i < 3 * 60 && midNow() - mid0 < 0.3; i++) r.step(1); // 手が すこし 持ち上がる まで（もっと 上げると 手のひらが 立って 1 人用でも のりが 外れる）
    const lift = midNow() - mid0;
    expect(lift).toBeGreaterThanOrEqual(0.3); // 手が ほんとうに 持ち上がった
    expect(r.st[2].y - y0).toBeGreaterThan(lift * 0.7); // 2P は 手と いっしょに 上がった（置いて いかれて いない）
    expect(r.st[1].x).toBe(r.boss.x + 300);
    expect(r.st[1].y).toBe(0);
  });

  it('噴火: ねらった 2P の 近くに 隕石が 落ち、ダメージと 近くの ゆれ（shakeNear）は 2P の 口だけ（遠くの 1P には 来ない）', () => {
    const r = rig();
    const head = (r.h.info() as { head: number[] }).head;
    r.st[2].x = head[0]! + 30; r.st[2].z = head[2]!; r.st[2].y = 0;
    r.st[1].x = head[0]! + 330; r.st[1].z = head[2]!; r.st[1].y = 0;
    r.h.attack('eruption');
    r.step(sec(T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.5));
    expect(r.h.targetWho()).toBe(2);
    expect(r.h.attackInfo().eruption.meteorHurts).toBeGreaterThan(0);
    expect(r.log.hurt[2].filter((a) => a === T.eruption.meteor.damage).length).toBe(r.h.attackInfo().eruption.meteorHurts);
    expect(r.log.hurt[1]).toEqual([]);
    expect(r.log.shakes[2].length).toBeGreaterThan(0);
    expect(r.log.shakes[1]).toEqual([]);
  });
});

describe('1 人（targets が 1P だけ）の とき（AC113）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('targets が 1P だけでも ねらうのは 1P。2P が いない ので 2 は ならない', () => {
    const ups: ((dt: number) => void)[] = [];
    const me = { x: 30, y: 0, z: 30 };
    const one = { who: 1, get pos() { return { ...me }; }, yawDeg: 0, down: false, hurt: () => true } as unknown as GashaTarget;
    const h = startGashaBig({ scene: new Scene(), camera: new PerspectiveCamera(), player: () => ({ ...me, yawDeg: 0 }), groundY: () => -1, addPlayerSolid: () => {}, onUpdate: (fn: (dt: number) => void) => { ups.push(fn); }, targets: () => [one] } as unknown as GashaBigDeps);
    h.walk(false);
    expect(h.targetWho()).toBe(1);
  });
});

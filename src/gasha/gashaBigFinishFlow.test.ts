import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps, type GashaBigHandle } from './gashaBig';

/** とどめの あと(FIX-BRIEF-2 §5)を、にせの プレイヤーで コマ送り して 確かめる */
function rig() {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 30 };
  const log = { stops: [] as number[], shakes: [] as number[], vel: [] as { x: number; y: number; z: number }[], defeated: 0, hits: [] as { n: number; left: number }[], broken: 0, vanished: 0, nudged: 0 };
  let blockFn: () => boolean = () => false;
  const hooks: { vanished: (() => void) | null } = { vanished: null };
  const deps: GashaBigDeps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => 0,
    addPlayerSolid: () => {},
    onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: () => {},
    setPlayerVelocity: (v) => { log.vel.push({ ...v }); },
    nudgePlayer: (dx, dz) => { st.x += dx; st.z += dz; log.nudged++; },
    setNoFall: () => {},
    blockPlayerInput: (fn) => { blockFn = fn; },
    onBeforeRender: () => {},
    reducedMotion: () => false,
    hurt: () => true,
    hitStop: (n) => { log.stops.push(n); },
    shake: (a) => { log.shakes.push(a); },
    onDefeated: () => { log.defeated++; },
    onCoreHit: (e) => { log.hits.push({ n: e.n, left: e.left }); },
    onCoreBroken: () => { log.broken++; },
    onVanished: () => { log.vanished++; hooks.vanished?.(); },
  };
  const h: GashaBigHandle = startGashaBig(deps);
  h.walk(false);
  h.refreshColliders();
  st.x = h.info().pos ? (h.info().pos as number[])[0]! + 30 : 30; st.z = (h.info().pos as number[])[2]!; st.y = (h.info().pos as number[])[1]!;
  const step = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) for (const f of ups) f(1 / 60); };
  return { h, st, log, step, hooks, blocked: () => blockFn() };
}

describe('とどめ → 倒れる → 赤い コア → たたく → くずれる（gashaBig）', () => {
  const saved = JSON.stringify(T.finish);
  let chase = true;
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); chase = T.chase.enabled; T.chase.enabled = false; T.finish.core.hits = 3; T.finish.core.hitGapSec = 0.2; T.finish.crumble.sec = 3; });
  afterEach(() => { vi.unstubAllGlobals(); T.chase.enabled = chase; Object.assign(T.finish.core, (JSON.parse(saved) as typeof T.finish).core); T.finish.crumble.sec = (JSON.parse(saved) as typeof T.finish).crumble.sec; });

  it('体力 0 の 一撃: ヒットストップ・画面の ゆれ・プレイヤーを はじく(上へ ＋ 遠ざかる)。体は その場で 固まる。onDefeated は 1 回', () => {
    const r = rig();
    r.step(0.2);
    const d0 = Math.hypot(r.st.x - (r.h.info().pos as number[])[0]!, r.st.z - (r.h.info().pos as number[])[2]!);
    expect(r.h.damage('core', 1e6)).toBeGreaterThan(0);
    expect(r.h.hp()).toBe(0);
    r.step(1 / 60);
    expect(r.log.defeated).toBe(1);
    expect(r.log.stops).toEqual([T.finish.blow.hitStopTicks]);
    expect(r.log.shakes).toEqual([T.finish.blow.shake]);
    expect(r.log.vel[0]!.y).toBe(T.finish.blow.knockUp);
    expect(r.blocked()).toBe(true);
    expect(r.h.finishInfo().phase).toBe('blow');
    expect(r.h.frozen()).toBe(true);
    r.step(T.finish.blow.knockSec + 0.1);
    const d1 = Math.hypot(r.st.x - (r.h.info().pos as number[])[0]!, r.st.z - (r.h.info().pos as number[])[2]!);
    expect(d1 - d0).toBeGreaterThan(T.finish.blow.knockSpeed * T.finish.blow.knockSec * 0.8); // 大きく 遠ざかる
    expect(r.blocked()).toBe(false);
    r.step(3);
    expect(r.log.defeated).toBe(1);
    expect(r.log.stops.length).toBe(1);
  });

  it('とどめの あと: どこを なぐっても ダメージ 0(体力は 0 の まま)。倒れて いる 間は コアも 数えない', () => {
    const r = rig();
    r.h.damage('core', 1e6);
    r.step(0.5);
    expect(r.h.damage('hand', 1e6)).toBe(0);
    expect(r.h.damage('girl', 1e6)).toBe(0);
    expect(r.h.damage('core', 1e6)).toBe(0); // blow / fall の 間
    expect(r.log.hits).toEqual([]);
    expect(r.h.hp()).toBe(0);
  });

  it('倒れおわると コアが 赤く なり、たたける。1 回ごとに onCoreHit(n, のこり)。回数が 0 で onCoreBroken → くずれて 消える(onVanished)', () => {
    const r = rig();
    r.h.damage('core', 1e6);
    r.step(T.finish.fall.delaySec + T.finish.fall.sec + 0.1);
    expect(r.h.finishInfo().phase).toBe('lie');
    expect(r.h.finishInfo().fallK).toBe(1);
    r.step(T.finish.core.redSec + 0.1);
    expect(r.h.finishInfo().redK).toBe(1);
    // 倒れた: 体が ひくく なって いる
    r.h.refreshColliders();
    const topNow = Math.max(...r.h.colliders().map((c) => c.center[1] + Math.abs(c.axes[0][1]) * c.half[0] + Math.abs(c.axes[1][1]) * c.half[1] + Math.abs(c.axes[2][1]) * c.half[2]));
    expect(topNow).toBeLessThan(30);
    for (let k = 0; k < 3; k++) {
      expect(r.h.damage('core', 5)).toBe(1);
      r.step(T.finish.core.hitGapSec + 0.05);
    }
    expect(r.log.hits).toEqual([{ n: 1, left: 2 }, { n: 2, left: 1 }, { n: 3, left: 0 }]);
    expect(r.log.broken).toBe(1);
    expect(r.h.finishInfo().phase).toBe('crumble');
    expect(r.h.damage('core', 5)).toBe(0); // こわした あとは もう 数えない
    r.step(T.finish.crumble.sec * 0.5);
    expect(r.h.finishInfo().chunks).toBeGreaterThan(0); // かけらが 出ている
    expect(r.h.group.visible).toBe(true);
    expect(r.log.vanished).toBe(0);
    r.step(T.finish.crumble.sec * 0.5 + 0.2);
    expect(r.log.vanished).toBe(1);
    expect(r.h.group.visible).toBe(false);
    expect(r.h.finishInfo().phase).toBe('gone');
  });

  it('くずれて 消えた 合図の 中で despawn() しても、同じ コマの あとの 更新で こわれない(release.ts が そうする)', () => {
    const r = rig();
    r.hooks.vanished = () => { r.h.despawn(); };
    r.h.damage('core', 1e6);
    r.step(T.finish.fall.delaySec + T.finish.fall.sec + T.finish.core.redSec + 0.2);
    for (let k = 0; k < 3; k++) { r.h.damage('core', 5); r.step(T.finish.core.hitGapSec + 0.05); }
    expect(() => r.step(T.finish.crumble.sec + 1)).not.toThrow();
    expect(r.log.vanished).toBe(1);
    expect(r.h.finishInfo().phase).toBe('off');
  });

  it('place() で もとに もどる(次の ボスは ふつうに 戦える)。体力・当たり・見た目が もどる', () => {
    const r = rig();
    r.h.damage('core', 1e6);
    r.step(3);
    r.h.place({ x: 0, z: 0 });
    expect(r.h.finishInfo().phase).toBe('off');
    expect(r.h.hp()).toBe(r.h.maxHp());
    expect(r.h.damage('hand', 100)).toBeGreaterThan(0);
    expect(r.h.group.visible).toBe(true);
  });
});

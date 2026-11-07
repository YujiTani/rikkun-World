import { describe, expect, it } from 'vitest';
import type { Vec3, YokaiInfo } from '../contracts';
import { FLOOR, S, itemByCharge, karakasa, makeWorld } from '../duo/p2LegendKit';
import { createWaveSystem, type WaveStepCtx } from './WaveSystem';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)「波は だれの 物か を もつ」・§8・AC103・AC113）の 先行テスト（赤）。
 * 真空波・らせんの かぜは「だれが 出したか」を もつ。2P の 波の 絵は 2P の カメラに 向け、当てた 波の けいけんちは 出した 人。
 *
 * ---- 実装への 約束 ----
 *   WaveDeps.who?: 1 | 2          （src/legend/WaveSystem.ts。なければ 1 = 今の まま）
 *   WaveView.who: 1 | 2           （list() の 1 つ 1 つ。真空波も らせんも。出した 波システムの who）
 *   WaveSystem.clear(): void      全部の 波を 消し、らせんの 音を 止める（出来事〈waveEnd・spiralEnd〉は 出さない）。P2Legend.dispose が 使う
 *   当たりの ダメージの 持ち主は 渡された `yokai()` が きめる（2P は createP2Legend が bindWho(…, 2) して 渡す。p2Legend.test.ts）。WaveSystem は damage の 引数を かえない。
 */

const FUJIN = itemByCharge('spiral');
const B: Vec3 = { x: 20.5, y: FLOOR + 2.4, z: 30 };

function rig(who?: 1 | 2, list: YokaiInfo[] = []) {
  const world = makeWorld();
  let tick = 100;
  const calls: unknown[][] = [];
  const w = createWaveSystem({
    world,
    yokai: () => ({ list: () => list, damage: (...a: unknown[]) => (calls.push(a), 1) }) as never,
    settings: S,
    tick: () => tick,
    emit: () => {},
    seed: 3,
    ...(who ? { who } : {}),
  });
  const idle: WaveStepCtx = { item: FUJIN, tech: null, phase: 'idle', frame: 0, startup: 4, dirDeg: 0, body: B };
  const run = (n: number, ctx: WaveStepCtx = idle) => {
    for (let i = 0; i < n; i++) {
      tick += 1;
      w.step(ctx);
    }
  };
  return { w, run, idle, calls };
}

describe('WaveView.who: 波は だれの 物か を もつ', () => {
  it('who: 2 の 波システムの 真空波と らせんは who 2。list() の どの 行も', () => {
    const r = rig(2);
    r.w.launchSpiral({ item: FUJIN, dirDeg: 0, body: B });
    r.run(1);
    r.run(1, { ...r.idle, tech: 'thrust', phase: 'active', frame: 5 });
    const kinds = r.w.list().map((v) => v.kind);
    expect(kinds).toContain('spiral');
    expect(kinds).toContain('wave');
    expect(r.w.list().map((v) => v.who)).toEqual(r.w.list().map(() => 2));
  });

  it('who を 渡さない（1 人の ときの 1P）は who 1。list() の 形は 今の まま（who が 足されるだけ）', () => {
    const r = rig();
    r.w.launchSpiral({ item: FUJIN, dirDeg: 0, body: B });
    r.run(1);
    r.run(1, { ...r.idle, tech: 'thrust', phase: 'active', frame: 5 });
    expect(r.w.list().length).toBeGreaterThan(0);
    expect(r.w.list().every((v) => v.who === 1)).toBe(true);
  });

  it('1P の 波システムと 2P の 波システムは 別の 入れもの: おたがいの list() に まざらない', () => {
    const a = rig(1);
    const b = rig(2);
    b.w.launchSpiral({ item: FUJIN, dirDeg: 0, body: B });
    b.run(1);
    expect(b.w.list().length).toBe(1);
    expect(a.w.list().length).toBe(0);
  });
});

describe('当たりの 持ち主は yokai() が きめる（WaveSystem は damage の 引数を かえない）', () => {
  it.each([undefined, 1, 2] as const)('who=%s でも damage は 4 つの 引数（id・ダメージ・場所・はじき）だけ。1P の 今の 呼び方の まま', (who) => {
    const r = rig(who, [karakasa(1, { x: B.x, y: FLOOR + 1, z: B.z - 3 })]);
    r.w.launchSpiral({ item: FUJIN, dirDeg: 0, body: B });
    r.run(1);
    r.run(70);
    expect(r.calls.length).toBeGreaterThan(0);
    expect(r.calls.every((c) => c.length === 4)).toBe(true);
  });
});

describe('WaveSystem.clear: 全部の 波を 消す（2P が やめた とき）', () => {
  it('とんでいる 真空波と らせんが 全部 消え、出来事は 出ない。らせんの 音は 止まる', () => {
    const world = makeWorld();
    let tick = 100;
    const events: string[] = [];
    let stopped = 0;
    const w = createWaveSystem({
      world,
      yokai: () => ({ list: () => [], damage: () => 0 }) as never,
      settings: S,
      tick: () => tick,
      emit: (e) => events.push(e.type),
      spiralSound: () => ({ stop: () => void (stopped += 1) }),
      seed: 3,
      who: 2,
    });
    w.launchSpiral({ item: FUJIN, dirDeg: 0, body: B });
    tick += 1;
    w.step({ item: FUJIN, tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg: 0, body: B });
    expect(w.list().length).toBeGreaterThan(1);
    const before = events.length;
    w.clear();
    expect(w.list()).toEqual([]);
    expect(stopped).toBe(1);
    expect(events.length, '消すだけ（終わりの 出来事は 出さない）').toBe(before);
    expect(() => w.clear()).not.toThrow();
  });
});

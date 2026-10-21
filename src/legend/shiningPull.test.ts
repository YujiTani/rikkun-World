import { describe, expect, it } from 'vitest';
import type { Vec3, YokaiInfo, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createLegendSystem, type LegendStepCtx } from './LegendSystem';

/** WEAPON-9 AC53・AC55・AC57・AC58(音): すいこみ（とどまる F41〜200・水平 12 以内・3 マス/秒・はじかれて 30 ステップは すわない） */
const FLOOR = 8;
const POS: Vec3 = { x: 20.5, y: FLOOR + 1, z: 20.5 };

function yk(id: number, dx: number, over: Partial<YokaiInfo> = {}): YokaiInfo {
  return { id, kind: 'karakasa', position: { x: POS.x + dx, y: POS.y, z: POS.z }, yawDeg: 0, hp: 99, maxHp: 99, state: 'idle', attackTick: 0, scale: 1, name: 'x', title: 'none', m: 1, attack: 2, ...over } as YokaiInfo;
}

function setup(list: YokaiInfo[]) {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
  const pulls: { id: number; F: number; dist: number; x: number; z: number }[] = [];
  const hits: { id: number; F: number }[] = [];
  let F = 0;
  const yokai = {
    list: () => list,
    raycast: () => null,
    damage: (id: number) => { hits.push({ id, F }); return 1; },
    pull: (id: number, x: number, z: number, dist: number) => { pulls.push({ id, F, dist, x, z }); },
  } as unknown as YokaiWorld;
  let tick = 0;
  const sounds: string[] = [];
  const loops: string[] = [];
  const stops: number[] = [];
  const sys = createLegendSystem({
    world, yokai: () => yokai, settings: createW2Settings(), tick: () => tick, sound: (n) => sounds.push(n),
    loop: (n) => { loops.push(n); return { stop: () => stops.push(tick) }; },
  });
  const ctx: LegendStepCtx = { item: 'niji', power: 10, active: true, pressed: false, held: false, startOk: true, bladeBusy: false, bladeAccepts: false, bladeChainOpen: false, eye: POS, dir: { x: 0, y: 0, z: -1 }, position: POS, yawDeg: 0, inWater: false };
  const step = (o: Partial<LegendStepCtx> = {}) => { tick += 1; F = sys.state().move === 'shining' ? sys.state().moveF + 1 : 1; return sys.step({ ...ctx, ...o }); };
  step({ pressed: true, held: true });
  for (let i = 1; i < 150; i++) step({ held: true });
  F = 0;
  step({ held: false }); // F1
  return { sys, step: (n = 1) => { for (let i = 0; i < n; i++) step(); }, pulls, hits, sounds, loops, stops, getF: () => sys.state().moveF, list };
}

describe('AC53 すう 区間と 所', () => {
  it('水平 10: F1〜40 は すわず、F41 から。F51 以後は 1 ステップ 0.05。12.5 は すわない。F201 以後 すわない', () => {
    const t = setup([yk(1, 10), yk(2, 12.5)]);
    t.step(239);
    const mine = t.pulls.filter((p) => p.id === 1);
    expect(mine.length).toBeGreaterThan(0);
    expect(Math.min(...mine.map((p) => p.F))).toBe(41);
    expect(Math.max(...mine.map((p) => p.F))).toBeLessThanOrEqual(200);
    for (const p of mine.filter((q) => q.F >= 51)) expect(p.dist).toBeCloseTo(0.05, 3);
    expect(mine.find((p) => p.F === 41)!.dist).toBeLessThan(0.01);
    expect(t.pulls.some((p) => p.id === 2)).toBe(false);
    // 体の 中心の ほうへ
    expect(mine[0]!.x).toBeCloseTo(POS.x, 3);
    expect(mine[0]!.z).toBeCloseTo(POS.z, 3);
  });
  it('やられて おわった・たおれかけ・ドームに ふれて いる 妖怪は すわない', () => {
    const t = setup([yk(1, 10, { state: 'dying' as never }), yk(3, 5)]);
    t.step(100);
    expect(t.pulls).toHaveLength(0);
  });
});

describe('AC55 はじいた あと 30 ステップは すわない', () => {
  it('domeHit の あと 30 ステップ すわず、31 ステップ目から また すう', () => {
    const y = yk(1, 6.5); // 止まって いる → ドームが 広がって F? で ふれる
    const t = setup([y]);
    t.step(100);
    const hitF = t.hits[0]!.F;
    // はじかれた ことに して 外へ 動かす（12 以内）
    y.position.x = POS.x + 9;
    t.step(130);
    const after = t.pulls.filter((p) => p.F > hitF);
    expect(after.length).toBeGreaterThan(0);
    expect(Math.min(...after.map((p) => p.F))).toBeGreaterThanOrEqual(hitF + 31);
  });
});

describe('AC58 音 domePull', () => {
  it('すわれ始めた ステップに 1 回 始まり、何体でも 1 つ。だれも すわれなく なって 10 ステップで 止まる', () => {
    const list = [yk(1, 10), yk(2, 10.5), yk(3, 11)];
    const t = setup(list);
    t.step(60);
    expect(t.loops.filter((n) => n === 'domePull')).toHaveLength(1);
    expect(t.sys.pullSound()).toBe('on');
    list.length = 0;
    t.step(9);
    expect(t.sys.pullSound()).toBe('on');
    t.step(2);
    expect(t.sys.pullSound()).not.toBe('on');
    expect(t.stops.length).toBe(1);
  });
  it('shiningHit は 同じ ステップに 何体 はじいても 1 つ', () => {
    const t = setup([yk(1, 6), yk(2, 6.2), yk(3, 6.4)]);
    t.step(60);
    expect(t.sounds.filter((s) => s === 'shiningHit')).toHaveLength(1);
  });
  it('あとで: だれも すわれて いない シャイニングでは domePull は 鳴らない', () => {
    const t = setup([]);
    t.step(100);
    expect(t.loops).toHaveLength(0);
  });
});

describe('pullers（すいよせの つぶ用）', () => {
  it('すわれて いる 妖怪の 位置が 取れる。F1〜40 と F201 以後は 空', () => {
    const t = setup([yk(1, 10)]);
    t.step(20);
    expect(t.sys.pullers()).toHaveLength(0);
    t.step(40);
    expect(t.sys.pullers().length).toBe(1);
    t.step(160);
    expect(t.sys.pullers()).toHaveLength(0);
  });
});

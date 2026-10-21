import { describe, expect, it } from 'vitest';
import type { Vec3, YokaiInfo, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createLegendSystem, type LegendStepCtx } from './LegendSystem';
import { easeInOut, shiningCamDistanceAt, shiningHeightAt, shiningRadiusAt, sphereTouchesYokai } from './shining';

/** WEAPON-9 AC29・AC30・AC31・AC39・AC49（部分）: シャイニングの 区間・ドームの 当たり・受ける ダメージ 1/3・カメラの きょり */
const FLOOR = 8;
const POS: Vec3 = { x: 20.5, y: FLOOR + 1, z: 20.5 };

function karakasa(id: number, at: Vec3, hp = 99): YokaiInfo {
  return { id, kind: 'karakasa', position: { ...at }, yawDeg: 0, hp, maxHp: hp, state: 'idle', attackTick: 0, scale: 1, name: 'x', title: 'none', m: 1, attack: 2 } as YokaiInfo;
}

function setup(list: YokaiInfo[] = []) {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
  const hits: { id: number; amount: number; knock?: { dist: number; up: number } }[] = [];
  const yokai = {
    list: () => list,
    raycast: () => null,
    damage: (id: number, amount: number, _from: Vec3, knock?: { dist: number; up: number }) => {
      hits.push({ id, amount, knock });
      return amount;
    },
  } as unknown as YokaiWorld;
  const S = createW2Settings();
  let tick = 0;
  const sounds: string[] = [];
  const sys = createLegendSystem({ world, yokai: () => yokai, settings: S, tick: () => tick, sound: (n) => sounds.push(n) });
  const ctx: LegendStepCtx = {
    item: 'niji', power: 10, active: true, pressed: false, held: false, startOk: true, bladeBusy: false, bladeAccepts: false, bladeChainOpen: false,
    eye: { x: 20.5, y: FLOOR + 2.4, z: 20.5 }, dir: { x: 0, y: 0, z: -1 }, position: POS, yawDeg: 0, inWater: false,
  };
  const step = (o: Partial<LegendStepCtx> = {}) => {
    tick += 1;
    return sys.step({ ...ctx, ...o });
  };
  const types = () => sys.peekEvents().map((e) => e.type);
  return { sys, step, S, hits, types, sounds, list };
}
type T = ReturnType<typeof setup>;

function charge(t: T, n: number) {
  t.step({ pressed: true, held: true });
  for (let i = 1; i < n; i++) t.step({ held: true });
}
/** 150 ためて はなす（その ステップ = F1）*/
function start(t: T) {
  charge(t, 150);
  t.step({ held: false });
}

describe('AC29 ため・区間', () => {
  it('ためF 149 で はなす → ふつうの わざ。150 で chargeReady 1 回・はなす → shining F1', () => {
    const a = setup();
    charge(a, 149);
    expect(a.step({ held: false }).fireTech).toBe(true);
    expect(a.sys.state().move).toBeNull();
    const b = setup();
    charge(b, 149);
    expect(b.types()).not.toContain('chargeReady');
    b.step({ held: true });
    expect(b.types().filter((x) => x === 'chargeReady')).toHaveLength(1);
    b.step({ held: false });
    expect(b.sys.state().move).toBe('shining');
    expect(b.sys.state().moveF).toBe(1);
    expect(b.types()).toContain('shiningStart');
    expect(b.sounds).toContain('shiningStart');
  });

  it('F40 で +2.0（±0.01）・F41〜200 は 一定・F240 で もとの 高さ・dome は F1〜239 だけ', () => {
    const t = setup();
    start(t);
    const base = POS.y;
    const at: Record<number, { hover: number | null; dome: number | null }> = {};
    for (let F = 1; F <= 260; F++) {
      if (F > 1) t.step();
      at[F] = { hover: t.sys.motion().hoverY ?? null, dome: t.sys.state().dome?.radius ?? null };
    }
    expect(at[40]!.hover! - base).toBeCloseTo(2.0, 2);
    expect(at[100]!.hover! - base).toBeCloseTo(2.0, 2);
    expect(at[200]!.hover! - base).toBeCloseTo(2.0, 2);
    expect(at[240]!.hover).toBeNull();
    expect(at[100]!.dome).toBeCloseTo(7, 5);
    expect(at[240]!.dome).toBeNull();
    expect(at[239]!.dome).not.toBeNull();
    expect(at[1]!.dome).toBeGreaterThan(0);
    expect(at[1]!.dome!).toBeLessThan(0.1);
    expect(at[259]!.hover).toBeNull();
    expect(t.types().filter((x) => x === 'shiningEnd')).toHaveLength(1);
    expect(t.sounds).toContain('shiningEnd');
    // 動けない
    expect(t.sys.state().move).toBeNull();
  });

  it('shiningEnd は F260。休み 600 は そこから。あけた ステップに shiningReady', () => {
    const t = setup();
    start(t);
    for (let F = 2; F <= 259; F++) t.step();
    expect(t.types()).not.toContain('shiningEnd');
    t.step(); // F260
    expect(t.types().filter((x) => x === 'shiningEnd')).toHaveLength(1);
    expect(t.sys.state().cooldownLeft).toBe(600);
    for (let i = 0; i < 599; i++) t.step();
    expect(t.types()).not.toContain('shiningReady');
    t.step();
    expect(t.types().filter((x) => x === 'shiningReady')).toHaveLength(1);
    expect(t.sounds).toContain('shiningReady');
    expect(t.sys.state().cooldownLeft).toBe(0);
  });

  it('休み中は ためが いっぱいに ならない（はなすと ふつうの わざ）', () => {
    const t = setup();
    start(t);
    for (let F = 2; F <= 260; F++) t.step();
    charge(t, 160);
    expect(t.sys.state().charge!.ready).toBe(false);
    expect(t.step({ held: false }).fireTech).toBe(true);
    expect(t.sys.state().move).toBeNull();
  });

  it('区間の 計算: 半径・高さ・カメラ', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(shiningHeightAt(40, 2)).toBeCloseTo(2, 6);
    expect(shiningHeightAt(120, 2)).toBeCloseTo(2, 6);
    expect(shiningHeightAt(240, 2)).toBeCloseTo(0, 6);
    expect(shiningRadiusAt(100, 7)).toBe(7);
    expect(shiningRadiusAt(240, 7)).toBe(0);
  });
});

describe('AC30 ドームの 当たり', () => {
  it('中心から 6.5 の からかさ → damage 25（P10）・はじく push [3,2]。8.5 外 → 当たらない', () => {
    const near = karakasa(1, { x: POS.x + 6.5, y: POS.y, z: POS.z });
    const far = karakasa(2, { x: POS.x - 8.5, y: POS.y, z: POS.z });
    const t = setup([near, far]);
    start(t);
    for (let F = 2; F <= 45; F++) t.step();
    const mine = t.hits.filter((h) => h.id === 1);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine[0]!.amount).toBe(25);
    expect(mine[0]!.knock).toEqual({ dist: 3, up: 2 });
    expect(t.hits.some((h) => h.id === 2)).toBe(false);
    const ev = t.sys.peekEvents().find((e) => e.type === 'domeHit') as { yokaiId: number; damage: number };
    expect(ev.yokaiId).toBe(1);
    expect(ev.damage).toBe(25);
    expect(t.sounds).toContain('shiningHit');
  });

  it('強さ 7 → 17.5。同じ 妖怪は 60 ステップに 1 回（はじかれない 相手で 240 に 4 回）', () => {
    const y = karakasa(1, { x: POS.x + 3, y: POS.y, z: POS.z });
    const t = setup([y]);
    t.step({ power: 7, pressed: true, held: true });
    for (let i = 1; i < 150; i++) t.step({ power: 7, held: true });
    t.step({ power: 7, held: false });
    for (let F = 2; F <= 260; F++) t.step({ power: 7 });
    const hs = t.sys.peekEvents().filter((e) => e.type === 'domeHit') as { tick: number; damage: number }[];
    expect(hs).toHaveLength(4);
    expect(hs[0]!.damage).toBe(17.5);
    expect(hs[1]!.tick - hs[0]!.tick).toBe(60);
  });

  it('半径が 小さい うかぶ F1 では 遠い 妖怪に 当たらない・水平の 手ごたえは settings.legendary の push から', () => {
    const t = setup([karakasa(1, { x: POS.x + 6, y: POS.y, z: POS.z })]);
    start(t);
    expect(t.hits).toHaveLength(0);
  });
});

describe('AC31 受ける ダメージ 1/3・カメラ・おわり', () => {
  it('takenMul は F1〜F240 で 1/3、もどり F241 以後は 1', () => {
    const t = setup();
    start(t);
    expect(t.sys.takenMul()).toBeCloseTo(1 / 3, 6);
    for (let F = 2; F <= 240; F++) t.step();
    expect(t.sys.takenMul()).toBeCloseTo(1 / 3, 6);
    t.step();
    expect(t.sys.takenMul()).toBe(1);
  });

  it('体力 0（active false）→ その ステップで shiningEnd・dome null・cooldownLeft 600', () => {
    const t = setup();
    start(t);
    for (let F = 2; F <= 50; F++) t.step();
    t.step({ active: false });
    expect(t.types().filter((x) => x === 'shiningEnd')).toHaveLength(1);
    expect(t.sys.state().dome).toBeNull();
    expect(t.sys.state().cooldownLeft).toBe(600);
    expect(t.sys.state().move).toBeNull();
  });

  it('落下ダメージなし: シャイニング中・おわったあと 着地するまで', () => {
    const t = setup();
    expect(t.sys.noFall()).toBe(false);
    start(t);
    expect(t.sys.noFall()).toBe(true);
    for (let F = 2; F <= 260; F++) t.step({ onGround: false });
    expect(t.sys.noFall()).toBe(true);
    t.step({ onGround: true });
    expect(t.sys.noFall()).toBe(false);
  });

  it('持ちかえ・もちもの画面は F1〜240 は 出せない', () => {
    const t = setup();
    expect(t.sys.locked()).toBe(false);
    start(t);
    expect(t.sys.locked()).toBe(true);
    for (let F = 2; F <= 241; F++) t.step();
    expect(t.sys.locked()).toBe(false);
  });
});

describe('AC39 カメラの きょり', () => {
  it('F40 で d・とどまる 間 d・F240 で 4・d=4 なら 引かない', () => {
    const d = 14;
    expect(shiningCamDistanceAt(0, d)).toBe(4);
    expect(shiningCamDistanceAt(40, d)).toBeCloseTo(14, 6);
    expect(shiningCamDistanceAt(100, d)).toBeCloseTo(14, 6);
    expect(shiningCamDistanceAt(200, d)).toBeCloseTo(14, 6);
    expect(shiningCamDistanceAt(240, d)).toBeCloseTo(4, 6);
    for (let F = 0; F <= 260; F++) expect(shiningCamDistanceAt(F, 4)).toBe(4);
  });

  it('system.camDistance: 三人称で シャイニング中 だけ 値。やられたら 40 ステップで 4', () => {
    const t = setup();
    expect(t.sys.camDistance()).toBeNull();
    start(t);
    for (let F = 2; F <= 40; F++) t.step();
    expect(t.sys.camDistance()!).toBeCloseTo(14, 2);
    t.step({ active: false });
    const first = t.sys.camDistance()!;
    expect(first).toBeLessThanOrEqual(14);
    for (let i = 0; i < 40; i++) t.step({ active: false });
    expect(t.sys.camDistance() ?? 4).toBeCloseTo(4, 1);
  });
});

describe('ドームの 球と 妖怪の 箱', () => {
  it('sphereTouchesYokai', () => {
    const y = karakasa(1, { x: 10, y: 0, z: 0 });
    expect(sphereTouchesYokai({ x: 0, y: 1, z: 0 }, 7, y)).toBe(false);
    expect(sphereTouchesYokai({ x: 0, y: 1, z: 0 }, 10, y)).toBe(true);
  });
});

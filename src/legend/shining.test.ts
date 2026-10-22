import { describe, expect, it } from 'vitest';
import type { Vec3, YokaiInfo, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { yokaiAt } from '../combat/attackTestKit';
import { createLegendSystem, type LegendEvent, type LegendStepCtx } from './LegendSystem';
import { createRng } from '../world/gen/random';
import { legendPowerOf, rollLegendPower, trailStyleOf, chargeOf } from './defs';

/** WEAPON-7 PR3 AC28〜AC31: 虹（シャイニング）の しくみ。プレイヤーの 高さは hoverDy を そのまま 足して まねる */
const FLOOR = 8;
const Y0 = FLOOR + 1;

function setup(list: YokaiInfo[] = [], power: number | undefined = 7) {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
  const hits: { id: number; amount: number; from: Vec3; knock?: { dist: number; up: number } }[] = [];
  const yokai = {
    list: () => list,
    raycast: () => null,
    damage: (id: number, amount: number, from: Vec3, knock?: { dist: number; up: number }) => {
      hits.push({ id, amount, from, knock });
      return amount;
    },
  } as unknown as YokaiWorld;
  const S = createW2Settings();
  let tick = 0;
  let wear = 0;
  const sounds: string[] = [];
  const pos: Vec3 = { x: 20.5, y: Y0, z: 20.5 };
  const sys = createLegendSystem({
    world,
    yokai: () => yokai,
    settings: S,
    tick: () => tick,
    onWear: () => (wear += 1),
    sound: (n) => sounds.push(n),
    power: () => power ?? null,
  });
  const base: LegendStepCtx = {
    item: 'niji',
    active: true,
    pressed: false,
    held: false,
    startOk: true,
    bladeBusy: false,
    bladeAccepts: false,
    bladeChainOpen: false,
    eye: { x: 20.5, y: Y0 + 1.4, z: 20.5 },
    dir: { x: 0, y: 0, z: -1 },
    position: pos,
    yawDeg: 0,
    inWater: false,
  };
  const ys: number[] = [];
  const step = (o: Partial<LegendStepCtx> = {}) => {
    // プレイヤーの 動き（controller.update）は 前の ステップの motion を 使う
    const dy = sys.motion().hoverDy;
    if (dy !== null && dy !== undefined) pos.y += dy;
    tick += 1;
    const r = sys.step({ ...base, position: { ...pos }, ...o });
    ys.push(pos.y);
    return r;
  };
  const evs = (): LegendEvent[] => sys.peekEvents();
  const types = () => evs().map((e) => e.type);
  /** 90 押して はなす。はなした ステップ = F1 */
  const fire = () => {
    step({ pressed: true, held: true });
    for (let i = 1; i < 90; i++) step({ held: true });
    step({ held: false });
  };
  return { sys, step, hits, S, types, evs, sounds, wear: () => wear, pos, ys, fire, world };
}

describe('AC28 強さ 1 本ごと', () => {
  it('legendPowerOf: 1 本の 強さを 使う。なし = まん中 7。範囲の 外は おさめる', () => {
    const S = createW2Settings();
    expect(legendPowerOf(S, 'niji')).toBe(7);
    expect(legendPowerOf(S, 'niji', 10)).toBe(10);
    expect(legendPowerOf(S, 'niji', 4)).toBe(4);
    expect(legendPowerOf(S, 'niji', 99)).toBe(10);
    expect(legendPowerOf(S, 'niji', 2)).toBe(4);
    expect(legendPowerOf(S, 'raijin_ken', 3)).toBe(8);
  });
  it('state().power は deps.power の 値', () => {
    const t = setup([], 10);
    t.step();
    expect(t.sys.state().item).toBe('niji');
    expect(t.sys.state().power).toBe(10);
  });
});

describe('AC29 シャイニングの 区間', () => {
  it('ためF 90 で いっぱい（89 では まだ）・はなすと shining。うかぶ +2.0・とどまる・おりて もどる・260 で shiningEnd', () => {
    const t = setup();
    for (let i = 0; i < 89; i++) t.step({ pressed: i === 0, held: true });
    expect(t.sys.state().charge).toEqual({ ticks: 89, ready: false });
    t.step({ held: true });
    expect(t.sys.state().charge).toEqual({ ticks: 90, ready: true });
    expect(t.types().filter((x) => x === 'chargeReady')).toHaveLength(1);
    const r = t.step({ held: false });
    expect(r.busy).toBe(true);
    expect(r.fireTech).toBe(false);
    expect(t.sys.state().move).toBe('shining');
    expect(t.sys.state().moveF).toBe(1);
    expect(t.types()).toContain('shiningStart');
    expect(t.sounds).toContain('shiningStart');
    const start = t.ys.length - 1; // F1 の ステップ
    const F = (n: number) => t.ys[start + n - 1];
    let f = 1;
    while (f < 262) {
      t.step();
      f++;
    }
    expect(F(1)).toBeCloseTo(Y0, 5);
    expect(F(40) - Y0).toBeGreaterThan(1.99);
    expect(F(40) - Y0).toBeLessThan(2.011);
    for (let n = 41; n <= 200; n++) expect(F(n) - Y0).toBeCloseTo(2, 2);
    expect(F(240) - Y0).toBeLessThan(0.02);
    expect(F(260) - Y0).toBeLessThan(0.02);
    // 上がり方: はじめ ゆっくり（F2 の 上がりは F20 の 上がりより 小さい）
    expect(F(2) - F(1)).toBeLessThan(F(21) - F(20));
    // おわり: shiningEnd は F1 から 260 ステップ あと
    const endAt = t.evs().find((e) => e.type === 'shiningEnd');
    expect(endAt).toBeTruthy();
  });

  it('shiningEnd は shiningStart の 260 ステップ あと。moveF は 260 まで shining', () => {
    const t = setup();
    t.fire();
    let n = 1;
    const ticks: number[] = [];
    for (; n < 270; n++) {
      t.step();
      const e = t.evs().find((x) => x.type === 'shiningEnd');
      if (e) {
        ticks.push(n);
        break;
      }
    }
    expect(n).toBe(260);
    expect(t.sys.state().move).toBeNull();
  });

  it('おわると 休み 600。休み中は いっぱいに ならず、はなすと ふつうの わざ。あけた ステップに shiningReady（音も）', () => {
    const t = setup();
    t.fire();
    for (let i = 0; i < 260; i++) t.step();
    expect(t.types()).toContain('shiningEnd');
    expect(t.sys.state().cooldownLeft).toBe(600);
    expect(t.sounds).toContain('shiningEnd');
    // 休み中
    t.step({ pressed: true, held: true });
    for (let i = 0; i < 99; i++) t.step({ held: true });
    expect(t.sys.state().charge?.ready).toBe(false);
    const r = t.step({ held: false });
    expect(r.fireTech).toBe(true);
    expect(t.types().filter((x) => x === 'shiningStart')).toHaveLength(1);
    // 休みが あける まで
    const left = t.sys.state().cooldownLeft;
    expect(left).toBeGreaterThan(0);
    for (let i = 0; i < left - 1; i++) t.step();
    expect(t.types()).not.toContain('shiningReady');
    t.step();
    expect(t.types().filter((x) => x === 'shiningReady')).toHaveLength(1);
    expect(t.sounds).toContain('shiningReady');
    expect(t.sys.state().cooldownLeft).toBe(0);
    for (let i = 0; i < 5; i++) t.step();
    expect(t.types().filter((x) => x === 'shiningReady')).toHaveLength(1);
    // また できる
    t.fire();
    expect(t.sys.state().move).toBe('shining');
  });
});

describe('AC30 ドームの 当たり', () => {
  const at = (dz: number, scale = 1) => yokaiAt('karakasa', { x: 20.5, y: Y0, z: 20.5 - dz }, { id: 5, scale });

  it('前 6.5 の からかさ: domeHit P×2.5（P 7 → 17.5・P 10 → 25）・外向きに 水平 3 上 2 ではじく。たいきゅうは 1 回だけ', () => {
    for (const [P, dmg] of [
      [7, 17.5],
      [10, 25],
      [4, 10],
    ] as const) {
      const t = setup([at(6.5)], P);
      t.fire();
      for (let i = 0; i < 260; i++) t.step();
      const dh = t.evs().filter((e) => e.type === 'domeHit');
      expect(dh.length).toBeGreaterThanOrEqual(1);
      expect(dh.length).toBeLessThanOrEqual(4);
      for (const e of dh) {
        expect(e.type === 'domeHit' && e.damage).toBeCloseTo(dmg, 5);
        expect(e.type === 'domeHit' && e.yokaiId).toBe(5);
      }
      expect(t.hits[0].amount).toBeCloseTo(dmg, 5);
      expect(t.hits[0].knock).toEqual({ dist: 3, up: 2 });
      expect(t.wear()).toBe(1);
      expect(t.sounds).toContain('shiningHit');
    }
  });

  it('同じ 妖怪は 60 ステップに 1 回（はじかれない 間は 4 回）', () => {
    const t = setup([at(5)]);
    t.fire();
    for (let i = 0; i < 260; i++) t.step();
    const n = t.evs().filter((e) => e.type === 'domeHit').length;
    expect(n).toBe(4);
    expect(t.hits.length).toBe(4);
  });

  it('外（前 9）は 当たらない。うかぶ 最初は 半径が 小さいので 遠い 妖怪には 当たらない', () => {
    const t = setup([at(9)]);
    t.fire();
    for (let i = 0; i < 260; i++) t.step();
    expect(t.types()).not.toContain('domeHit');
    expect(t.hits).toHaveLength(0);
    expect(t.wear()).toBe(0);
  });

  it('かべごしでも 当たる', () => {
    const t = setup([at(4)]);
    for (let y = Y0; y < Y0 + 4; y++) for (let x = 18; x < 24; x++) t.world.setBlock(x, y, 20 - 1, 'stone');
    t.fire();
    for (let i = 0; i < 100; i++) t.step();
    expect(t.types()).toContain('domeHit');
  });

  it('たおれかけ（dying）・ていく（leaving）の 妖怪には 当たらない', () => {
    const y1 = yokaiAt('karakasa', { x: 20.5, y: Y0, z: 18.5 }, { state: 'dying' });
    const t = setup([y1]);
    t.fire();
    for (let i = 0; i < 100; i++) t.step();
    expect(t.types()).not.toContain('domeHit');
  });
});

describe('AC31 安全・見た目用の 状態', () => {
  it('shield: うかぶ〜おりる（F1〜240）だけ true。もどりは false。fallSafe は もどりまで', () => {
    const t = setup();
    expect(t.sys.shield()).toBe(false);
    t.fire();
    for (let n = 1; n <= 240; n++) {
      expect(t.sys.state().moveF).toBe(n);
      expect(t.sys.shield(), `F${n}`).toBe(true);
      expect(t.sys.fallSafe()).toBe(true);
      t.step();
    }
    expect(t.sys.state().moveF).toBe(241);
    expect(t.sys.shield()).toBe(false);
    expect(t.sys.fallSafe()).toBe(true);
    for (let i = 0; i < 20; i++) t.step();
    expect(t.sys.fallSafe()).toBe(false);
  });

  it('dome(): うかぶ で 0 → 7、とどまる 7、おりる で 7 → 0。中心 = 足もと + 0.9', () => {
    const t = setup();
    expect(t.sys.state().dome).toBeNull();
    t.fire();
    const r: number[] = [];
    const phase: (string | null)[] = [];
    for (let n = 1; n <= 241; n++) {
      const d = t.sys.state().dome;
      r.push(d ? d.radius : -1);
      phase.push(d ? d.phase : null);
      if (d) expect(d.centerY).toBeCloseTo(t.pos.y + 0.9, 5);
      t.step();
    }
    expect(r[0]).toBeGreaterThan(0);
    expect(r[0]).toBeLessThan(0.1);
    expect(r[39]).toBeCloseTo(7, 5);
    expect(r[100]).toBe(7);
    expect(r[199]).toBe(7);
    expect(r[239]).toBeLessThan(0.1);
    expect(phase[0]).toBe('rise');
    expect(phase[40]).toBe('hold');
    expect(phase[200]).toBe('fall');
    expect(phase[240]).toBeNull();
    // 半径は おりるとき ふえない
    for (let i = 200; i < 239; i++) expect(r[i + 1]).toBeLessThanOrEqual(r[i]);
    expect(t.sys.dome()).toBeNull();
  });

  it('持ちかえ・やられた（active false）で シャイニングは おわる（休みは ない）', () => {
    const t = setup();
    t.fire();
    for (let i = 0; i < 50; i++) t.step();
    t.step({ item: 'katana' });
    expect(t.sys.state().move).toBeNull();
    expect(t.sys.shield()).toBe(false);
    expect(t.sys.motion().hoverDy ?? null).toBeNull();
  });
});

describe('AC28・斬撃 データ', () => {
  it('虹の 行: 強さ [4,10]・shining の 数・trail rainbow。rollLegendPower は 4〜10 の 整数を 同じ 重さで', () => {
    const S = createW2Settings();
    expect(chargeOf(S, 'niji')).toEqual({ kind: 'shining', chargeTicks: 90, rise: 2.0, riseSteps: 40, holdSteps: 160, fallSteps: 40, radius: 7, damageMul: 2.5, hitEvery: 60, push: [3, 2], cooldown: 600 });
    expect(trailStyleOf(S, 'niji')).toBe('rainbow');
    expect(S.bladeTrail.niji!.style).toBe('rainbow');
    expect(S.bladeCombo.items).toContain('niji');
    expect(S.toolDurability.niji).toBe(10000);
    let x = 0;
    const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rollLegendPower(S, 'niji', rng)!);
    expect([...seen].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    // 10,000 本で それぞれ 1/7 ±1%（AC28）
    const r2 = createRng(41);
    const cnt = new Map<number, number>();
    for (let i = 0; i < 10000; i++) {
      const p = rollLegendPower(S, 'niji', r2)!;
      cnt.set(p, (cnt.get(p) ?? 0) + 1);
    }
    expect(cnt.size).toBe(7);
    for (const [, c] of cnt) {
      expect(c / 10000).toBeGreaterThan(1 / 7 - 0.01);
      expect(c / 10000).toBeLessThan(1 / 7 + 0.01);
    }
    expect(rollLegendPower(S, 'raijin_ken', rng)).toBeNull();
    expect(rollLegendPower(S, 'katana', rng)).toBeNull();
    expect(rollLegendPower(S, 'niji', () => 0.999999)).toBe(10);
    expect(rollLegendPower(S, 'niji', () => 0)).toBe(4);
  });
});

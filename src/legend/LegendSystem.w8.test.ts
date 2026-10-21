import { describe, expect, it } from 'vitest';
import type { ItemId, Vec3, YokaiInfo, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createLegendSystem, type LegendLoopName, type LegendStepCtx } from './LegendSystem';

/**
 * WEAPON-8 AC2〜AC4・AC25・AC36: 風神剣の ためわざ「らせんの かぜ」の ため・区間・ため音の 区間・らせんの 音の 止まり方。
 * かぜの とび方・当たりは WaveSystem 側（spiral.test.ts）。ここは LegendSystem が 持つ 状態だけ。
 */
const FLOOR = 8;
const POS: Vec3 = { x: 20.5, y: FLOOR + 1, z: 20.5 };
const EYE: Vec3 = { x: 20.5, y: FLOOR + 2.4, z: 20.5 };
const FUJIN = 'fujin_ken' as ItemId;

function setup(item: ItemId = FUJIN) {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
  const yokai = { list: () => [] as YokaiInfo[], raycast: () => null, damage: () => 1 } as unknown as YokaiWorld;
  const S = createW2Settings();
  let tick = 0;
  const launches: { item: ItemId; dirDeg: number; tick: number }[] = [];
  const loops: { name: LegendLoopName; tick: number; stops: { fade: number; tick: number }[] }[] = [];
  const sounds: string[] = [];
  const sys = createLegendSystem({
    world,
    yokai: () => yokai,
    settings: S,
    tick: () => tick,
    sound: (n) => sounds.push(n),
    launchSpiral: (a) => launches.push({ ...a, tick }),
    loop: (name) => {
      const rec = { name, tick, stops: [] as { fade: number; tick: number }[] };
      loops.push(rec);
      return { stop: (fade: number) => void rec.stops.push({ fade, tick }) };
    },
  });
  const ctx: LegendStepCtx = {
    item,
    active: true,
    pressed: false,
    held: false,
    startOk: true,
    bladeBusy: false,
    bladeAccepts: false,
    bladeChainOpen: false,
    eye: EYE,
    dir: { x: 0, y: 0, z: -1 },
    position: POS,
    yawDeg: 0,
    inWater: false,
  };
  const step = (o: Partial<LegendStepCtx> = {}) => {
    tick += 1;
    return sys.step({ ...ctx, ...o });
  };
  const types = () => sys.peekEvents().map((e) => e.type);
  return { sys, step, launches, loops, sounds, types, tick: () => tick };
}
type T = ReturnType<typeof setup>;

/** 押した ステップが ためF 1 */
function charge(t: T, n: number, over: Partial<LegendStepCtx> = {}) {
  t.step({ pressed: true, held: true, ...over });
  for (let i = 1; i < n; i++) t.step({ held: true, ...over });
}

describe('AC2: 風神剣の ため・はなす', () => {
  it('ためF 59 で はなす → ふつうの わざ。60 → らせんの かぜ（そのステップが F1）', () => {
    const a = setup();
    charge(a, 59);
    const r = a.step({ held: false });
    expect(r.fireTech).toBe(true);
    expect(a.sys.state().move).toBeNull();
    expect(a.launches).toHaveLength(0);

    const b = setup();
    charge(b, 60);
    expect(b.sys.state().charge).toEqual({ ticks: 60, ready: true });
    const r2 = b.step({ held: false });
    expect(r2.fireTech).toBe(false);
    expect(r2.busy).toBe(true);
    expect(b.sys.state().move).toBe('spiral');
    expect(b.sys.state().moveF).toBe(1);
  });
  it('chargeReady は ためF 60 の ステップに 1 回。押しつづけても ふつうの わざを くり返さない', () => {
    const t = setup();
    charge(t, 59);
    expect(t.types().filter((x) => x === 'chargeReady')).toHaveLength(0);
    for (let i = 0; i < 40; i++) expect(t.step({ held: true }).fireTech).toBe(false);
    expect(t.types().filter((x) => x === 'chargeStart')).toHaveLength(1);
    expect(t.types().filter((x) => x === 'chargeReady')).toHaveLength(1);
    expect(t.sounds.filter((x) => x === 'chargeReady')).toHaveLength(1);
  });
  it('chargeable は 風神剣も true・ふつうの 刀は false', () => {
    const t = setup();
    expect(t.sys.chargeable(FUJIN)).toBe(true);
    expect(t.sys.chargeable('katana' as ItemId)).toBe(false);
  });
  it('view に ためわざの しゅるい（spiral）と ためF が 入る', () => {
    const t = setup();
    charge(t, 30);
    expect(t.sys.view().kind).toBe('spiral');
    expect(t.sys.view().chargeTicks).toBe(30);
    const r = setup('raijin_ken' as ItemId);
    charge(r, 3);
    expect(r.sys.view().kind).toBe('lightning');
  });
});

describe('AC3: ため中の 動き・消える 条件', () => {
  it('ため中: speedMul 0.5・jumpLocked・noRun。Shift で パリィに ならない（ためは 続く）', () => {
    const t = setup();
    charge(t, 10);
    const m = t.sys.motion();
    expect(m.speedMul).toBe(0.5);
    expect(m.jumpLocked).toBe(true);
    expect(m.noRun).toBe(true);
    expect(t.step({ held: true }).busy).toBe(true);
  });
  it('持ちかえ・やられた(active false) で chargeCancel・わざ なし', () => {
    const a = setup();
    charge(a, 30);
    a.step({ item: 'katana' as ItemId, held: true });
    expect(a.types()).toContain('chargeCancel');
    expect(a.sys.state().charge).toBeNull();
    const b = setup();
    charge(b, 30);
    b.step({ active: false, held: true });
    expect(b.types()).toContain('chargeCancel');
    expect(b.sys.state().move).toBeNull();
  });
});

describe('AC4: 区間', () => {
  it('向きは F1 で 固定・F6 に かぜを 出す・わざは 45 ステップ・先行入力は F38〜45', () => {
    const t = setup();
    charge(t, 60, { yawDeg: 30 });
    t.step({ held: false, yawDeg: 30 }); // F1
    expect(t.sys.faceDeg()).toBe(30);
    const seen: number[] = [];
    for (let F = 2; F <= 45; F++) {
      const before = t.launches.length;
      const nb = t.sys.busyNext();
      t.step({ held: false, yawDeg: 30 + F * 2 }); // 照準を 動かしても かわらない
      expect(t.sys.faceDeg(), `F${F}`).toBe(30);
      expect(t.sys.state().moveF).toBe(F);
      if (t.launches.length > before) seen.push(F);
      expect(nb.accepts, `F${F} の 前の busyNext`).toBe(F >= 38);
    }
    expect(seen).toEqual([6]);
    expect(t.launches[0]).toMatchObject({ item: FUJIN, dirDeg: 30 });
    expect(t.sys.strike()?.F).toBe(45);
    expect(t.sys.strike()?.total).toBe(45);
    t.step({ held: false });
    expect(t.sys.state().move).toBeNull();
    expect(t.sys.faceDeg()).toBeNull();
  });
  it('F38〜45 に 押すと 先行入力に なり、おわりの ステップで ためが 始まる', () => {
    const t = setup();
    charge(t, 60);
    t.step({ held: false });
    for (let F = 2; F <= 45; F++) t.step({ held: false, pressed: F === 40, ...(F === 40 ? { held: true } : {}) });
    // 先行入力が のこって いるので つぎの ステップで ためが はじまる
    t.step({ held: false });
    expect(t.sys.state().charge?.ticks).toBe(1);
  });
  it('体の 絵の コマは 落雷と 同じ strike() の F・total（45）', () => {
    const t = setup();
    charge(t, 60);
    t.step({ held: false });
    expect(t.sys.strike()).toMatchObject({ F: 1, total: 45 });
  });
  it('かぜが 出る 前に やめても（持ちかえ）かぜは 出ない', () => {
    const t = setup();
    charge(t, 60);
    t.step({ held: false }); // F1
    t.step({ held: false }); // F2
    t.step({ held: false, item: 'katana' as ItemId });
    for (let i = 0; i < 10; i++) t.step({ held: false, item: 'katana' as ItemId });
    expect(t.launches).toHaveLength(0);
  });
});

describe('AC25: ため音の 区間（chargeSound）', () => {
  it('ためF 1 で rise on・ためF 60 で chargeReady・hold on・rise off。両方 on には ならない', () => {
    const t = setup();
    const snd: { rise: string; hold: string }[] = [];
    t.step({ pressed: true, held: true });
    snd.push(t.sys.chargeSound());
    expect(snd[0]).toEqual({ rise: 'on', hold: 'off' });
    expect(t.loops.map((l) => l.name)).toEqual(['chargeRise']);
    for (let k = 2; k <= 100; k++) {
      t.step({ held: true });
      const s = t.sys.chargeSound();
      expect(!(s.rise === 'on' && s.hold === 'on')).toBe(true);
      if (k < 60) expect(s, `ためF ${k}`).toEqual({ rise: 'on', hold: 'off' });
      else expect(s, `ためF ${k}`).toEqual({ rise: 'off', hold: 'on' });
    }
    expect(t.loops.map((l) => [l.name, l.tick])).toEqual([
      ['chargeRise', 1],
      ['chargeHold', 60],
    ]);
    expect(t.loops[0]!.stops).toHaveLength(1); // ためF 60 で ためを とめる
  });
  it('ためF 30 で はなす → rise fading → 6 ステップ以内に off・chargeReady/hold なし', () => {
    const t = setup();
    charge(t, 30);
    t.step({ held: false });
    expect(t.sys.chargeSound().rise).toBe('fading');
    let off = -1;
    for (let k = 1; k <= 8 && off < 0; k++) {
      if (t.sys.chargeSound().rise === 'off') off = k - 1;
      else t.step({ held: false });
    }
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThanOrEqual(6);
    expect(t.loops.map((l) => l.name)).toEqual(['chargeRise']);
    expect(t.loops[0]!.stops[0]!.fade).toBeLessThanOrEqual(6 / 60);
    expect(t.sys.chargeSound().hold).toBe('off');
  });
  it('ためF 90 で はなす → hold fading → 15 ステップ以内に off', () => {
    const t = setup();
    charge(t, 90);
    t.step({ held: false });
    expect(t.sys.chargeSound().hold).toBe('fading');
    let n = 0;
    while (t.sys.chargeSound().hold !== 'off' && n < 40) {
      t.step({ held: false });
      n++;
    }
    expect(n).toBeLessThanOrEqual(15);
    const hold = t.loops.find((l) => l.name === 'chargeHold')!;
    expect(hold.stops[0]!.fade).toBeLessThanOrEqual(15 / 60);
  });
  it('持ちかえ・やられた でも 同じ 止まり方', () => {
    const a = setup();
    charge(a, 70);
    a.step({ held: true, item: 'katana' as ItemId });
    expect(a.sys.chargeSound().hold).toBe('fading');
    for (let i = 0; i < 15; i++) a.step({ item: 'katana' as ItemId });
    expect(a.sys.chargeSound()).toEqual({ rise: 'off', hold: 'off' });
    const b = setup();
    charge(b, 20);
    b.step({ held: true, active: false });
    expect(b.sys.chargeSound().rise).toBe('fading');
    for (let i = 0; i < 6; i++) b.step({ active: false });
    expect(b.sys.chargeSound().rise).toBe('off');
  });
  it('雷神剣も 同じ 答え方', () => {
    const t = setup('raijin_ken' as ItemId);
    charge(t, 1);
    expect(t.sys.chargeSound().rise).toBe('on');
    charge(t, 60);
    expect(t.sys.chargeSound()).toEqual({ rise: 'off', hold: 'on' });
  });
});

describe('AC36: らせんの 音の 止まり方（legend.spiralSound）', () => {
  const start = (t: T) => t.sys.emit({ type: 'spiralStart', tick: t.tick(), id: 1, position: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 } });
  it('spiralStart で on。とどく おわり（range）では 止めず、F6 から 120 ステップ以内に off', () => {
    const t = setup();
    t.step();
    start(t);
    expect(t.sys.spiralSound()).toBe('on');
    t.sys.emit({ type: 'spiralEnd', tick: t.tick(), id: 1, reason: 'range', position: { x: 0, y: 0, z: -13 } });
    expect(t.sys.spiralSound()).toBe('on');
    let n = 0;
    while (t.sys.spiralSound() !== 'off' && n < 200) {
      t.step();
      n++;
    }
    expect(n).toBeLessThanOrEqual(120);
    expect(n).toBeGreaterThan(60);
  });
  it('かべで すぐ 消えた（block）→ その ステップから fading・12 ステップ以内に off', () => {
    const t = setup();
    t.step();
    start(t);
    t.sys.emit({ type: 'spiralEnd', tick: t.tick(), id: 1, reason: 'block', position: { x: 0, y: 0, z: -1 } });
    expect(t.sys.spiralSound()).toBe('fading');
    let n = 0;
    while (t.sys.spiralSound() !== 'off' && n < 40) {
      t.step();
      n++;
    }
    expect(n).toBeLessThanOrEqual(12);
  });
  it('はじめは off', () => {
    expect(setup().sys.spiralSound()).toBe('off');
  });
});

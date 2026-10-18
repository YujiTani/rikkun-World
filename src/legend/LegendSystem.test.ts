import { describe, expect, it } from 'vitest';
import type { Vec3, YokaiInfo, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { yokaiAt } from '../combat/attackTestKit';
import { createLegendSystem, type LegendStepCtx } from './LegendSystem';

/** WEAPON-7 AC2・AC3・AC10・AC11: ため・はなす・落雷の 時間・消える 条件・たいきゅう（ブロックの 世界で 1 ステップずつ） */
const FLOOR = 8;
const EYE: Vec3 = { x: 20.5, y: FLOOR + 1 + 1.4, z: 20.5 };
const POS: Vec3 = { x: 20.5, y: FLOOR + 1, z: 20.5 };
const GROUND8: Vec3 = { x: 20.5, y: FLOOR + 1, z: 12.5 };

function dirTo(to: Vec3, from: Vec3 = EYE): Vec3 {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / l, y: d.y / l, z: d.z / l };
}

interface Hit {
  id: number;
  amount: number;
  from: Vec3;
  knock?: { dist: number; up: number };
}

function setup(list: YokaiInfo[] = []) {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
  const hits: Hit[] = [];
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
  const sys = createLegendSystem({ world, yokai: () => yokai, settings: S, tick: () => tick, onWear: () => (wear += 1), sound: (n) => sounds.push(n) });
  const ctx: LegendStepCtx = {
    item: 'raijin_ken',
    active: true,
    pressed: false,
    held: false,
    startOk: true,
    bladeBusy: false,
    bladeAccepts: false,
    eye: EYE,
    dir: dirTo(GROUND8),
    position: POS,
    yawDeg: 0,
    inWater: false,
  };
  const step = (o: Partial<LegendStepCtx> = {}) => {
    tick += 1;
    return sys.step({ ...ctx, ...o });
  };
  const types = () => sys.peekEvents().map((e) => e.type);
  return { sys, step, ctx, hits, S, world, types, sounds, wear: () => wear };
}

/** ため（press → 押しつづけ n 回）。押した ステップが ためF 1 */
function charge(t: ReturnType<typeof setup>, n: number) {
  t.step({ pressed: true, held: true });
  for (let i = 1; i < n; i++) t.step({ held: true });
}

describe('AC2 ためる・はなす', () => {
  it('ためF 59 で はなす → ふつうの わざ。60 → 落雷（その ステップが F1）', () => {
    const a = setup();
    charge(a, 59);
    expect(a.sys.state().charge).toEqual({ ticks: 59, ready: false });
    const r = a.step({ held: false });
    expect(r.fireTech).toBe(true);
    expect(a.sys.state().move).toBeNull();
    expect(a.types()).not.toContain('chargeReady');

    const b = setup();
    charge(b, 60);
    expect(b.sys.state().charge).toEqual({ ticks: 60, ready: true });
    const r2 = b.step({ held: false });
    expect(r2.fireTech).toBe(false);
    expect(r2.busy).toBe(true);
    expect(b.sys.state().move).toBe('lightning');
    expect(b.sys.state().moveF).toBe(1);
  });

  it('chargeReady は ためF 60 の ステップに 1 回（音も 1 回）', () => {
    const t = setup();
    charge(t, 59);
    expect(t.types().filter((x) => x === 'chargeReady')).toHaveLength(0);
    t.step({ held: true });
    t.step({ held: true });
    t.step({ held: true });
    expect(t.types().filter((x) => x === 'chargeStart')).toHaveLength(1);
    expect(t.types().filter((x) => x === 'chargeReady')).toHaveLength(1);
    expect(t.sounds.filter((x) => x === 'chargeReady')).toHaveLength(1);
  });

  it('charge の ない 武器（かたな）は ためない・何も 取らない', () => {
    const t = setup();
    const r = t.step({ item: 'katana', pressed: true, held: true });
    expect(r).toEqual({ busy: false, fireTech: false });
    expect(t.sys.state().charge).toBeNull();
    expect(t.types()).toEqual([]);
  });

  it('ふりわけが ほる（startOk false）なら ためない', () => {
    const t = setup();
    const r = t.step({ pressed: true, held: true, startOk: false });
    expect(r.busy).toBe(false);
    expect(t.sys.state().charge).toBeNull();
  });

  it('item・power は 持っている 武器の データ', () => {
    const t = setup();
    t.step();
    expect(t.sys.state().item).toBe('raijin_ken');
    expect(t.sys.state().power).toBe(8);
    const k = setup();
    k.step({ item: 'katana' });
    expect(k.sys.state().item).toBeNull();
  });
});

describe('AC3 ため中', () => {
  it('motion: 歩く 0.5 倍・ジャンプ 止め・はしらない（水の中は およげる）', () => {
    const t = setup();
    expect(t.sys.motion().speedMul).toBe(1);
    charge(t, 5);
    const m = t.sys.motion();
    expect(m.speedMul).toBe(0.5);
    expect(m.jumpLocked).toBe(true);
    expect(m.noRun).toBe(true);
    const w = setup();
    charge(w, 5);
    w.step({ held: true, inWater: true });
    expect(w.sys.motion().jumpLocked).toBe(false);
  });

  const cancels: [string, Partial<LegendStepCtx>][] = [
    ['持ちかえ', { item: null }],
    ['active false', { active: false }],
  ];
  for (const [name, o] of cancels) {
    it(`${name} → chargeCancel 1 回・わざなし・押しつづけても 始まらない（はなすまで）`, () => {
      const t = setup();
      charge(t, 10);
      const r = t.step({ held: true, ...o });
      expect(r.fireTech).toBe(false);
      expect(t.sys.state().charge).toBeNull();
      expect(t.types().filter((x) => x === 'chargeCancel')).toHaveLength(1);
      // もどしても 押しつづけでは 始まらない
      const r2 = t.step({ held: true });
      expect(t.sys.state().charge).toBeNull();
      expect(r2.busy).toBe(true); // はなすまで ほる・たたくも しない
      const r3 = t.step({ held: false });
      expect(r3).toEqual({ busy: false, fireTech: false });
      expect(t.sys.state().move).toBeNull();
      // はなして 押しなおせば また ためる
      t.step({ pressed: true, held: true });
      expect(t.sys.state().charge?.ticks).toBe(1);
    });
  }

  it('攻撃を 受けても（ctx に 関係ない）ためは 続く・ため中に 水平に 動いても 消えない', () => {
    const t = setup();
    charge(t, 30);
    expect(t.sys.state().charge?.ticks).toBe(30);
    expect(t.types()).not.toContain('chargeCancel');
  });
});

describe('AC9 ためたら aim', () => {
  it('いっぱいに なった ステップから aim（S・skyVisible）。ためている 間は null', () => {
    const t = setup();
    charge(t, 59);
    expect(t.sys.state().aim).toBeNull();
    t.step({ held: true });
    const a = t.sys.state().aim!;
    expect(a).not.toBeNull();
    expect(a.S!.y).toBeCloseTo(FLOOR + 1, 5);
    expect(a.skyVisible).toBe(true);
  });

  it('地下（上が ブロック）でも aim は ある（skyVisible false）', () => {
    const t = setup();
    for (let x = 8; x < 40; x++) for (let z = 4; z < 40; z++) t.world.setBlock(x, FLOOR + 5, z, 'stone');
    charge(t, 60);
    const a = t.sys.state().aim!;
    expect(a).not.toBeNull();
    expect(a.skyVisible).toBe(false);
  });
});

describe('AC10・AC11 落雷', () => {
  function ready(list: YokaiInfo[] = []) {
    const t = setup(list);
    charge(t, 60);
    return t;
  }

  it('F8 に 1 回 lightningStrike。F45 まで move・F46 は null', () => {
    const t = ready();
    const frames: (number | null)[] = [];
    let strikeAt = -1;
    t.step({ held: false });
    frames.push(t.sys.state().moveF);
    for (let i = 2; i <= 50; i++) {
      const before = t.types().filter((x) => x === 'lightningStrike').length;
      t.step({ held: false });
      if (t.types().filter((x) => x === 'lightningStrike').length > before) strikeAt = i;
      frames.push(t.sys.state().move ? t.sys.state().moveF : null);
    }
    expect(strikeAt).toBe(8);
    expect(frames.slice(0, 45)).toEqual(Array.from({ length: 45 }, (_, k) => k + 1));
    expect(frames[45]).toBeNull();
    expect(t.types().filter((x) => x === 'lightningStrike')).toHaveLength(1);
  });

  it('S の まわり 半径 5: 4.6 は 当たる damage 16・外向き 水平 2 上 4。6.6 は 当たらない。ぬりかべも 当たる', () => {
    const S = { x: 20.5, y: FLOOR + 1, z: 12.5 };
    const near = yokaiAt('karakasa', { x: S.x + 4.6, y: S.y, z: S.z });
    const far = yokaiAt('karakasa', { x: S.x + 6.6, y: S.y, z: S.z });
    const wall = yokaiAt('nurikabe', { x: S.x, y: S.y, z: S.z + 3.5 });
    const t = ready([near, far, wall]);
    for (let i = 0; i < 7; i++) t.step({ held: false });
    expect(t.hits).toEqual([]);
    t.step({ held: false });
    const ids = t.hits.map((h) => h.id).sort();
    expect(ids).toEqual([near.id, wall.id].sort());
    const h = t.hits.find((x) => x.id === near.id)!;
    expect(h.amount).toBeCloseTo(16, 5);
    expect(h.knock).toEqual({ dist: 2, up: 4 });
    expect(h.from.x).toBeCloseTo(S.x, 2);
    expect(h.from.z).toBeCloseTo(S.z, 2);
    const ev = t.sys.peekEvents().find((e) => e.type === 'lightningStrike')!;
    expect(ev.type === 'lightningStrike' && ev.hits.sort()).toEqual([near.id, wall.id].sort());
  });

  it('かべの 向こうは 当たらない', () => {
    const S = { x: 20.5, y: FLOOR + 1, z: 12.5 };
    const behind = yokaiAt('karakasa', { x: S.x - 3.6, y: S.y, z: S.z });
    const t = setup([behind]);
    t.world.fill?.(18, FLOOR + 1, 9, 18, FLOOR + 4, 16, 'stone');
    if (!t.world.fill) for (let y = FLOOR + 1; y <= FLOOR + 4; y++) for (let z = 9; z <= 16; z++) t.world.setBlock(18, y, z, 'stone');
    charge(t, 60);
    for (let i = 0; i < 8; i++) t.step({ held: false });
    expect(t.hits).toEqual([]);
  });

  it('地下（屋根）: S は 屋根の 上。下の 妖怪には 当たらない。strike の hits は 空', () => {
    const under = yokaiAt('karakasa', { x: 20.5, y: FLOOR + 1, z: 17.5 });
    const t = setup([under]);
    for (let x = 8; x < 40; x++) for (let z = 4; z < 40; z++) t.world.setBlock(x, FLOOR + 5, z, 'stone');
    charge(t, 60);
    for (let i = 0; i < 8; i++) t.step({ held: false });
    expect(t.hits).toEqual([]);
    const ev = t.sys.peekEvents().find((e) => e.type === 'lightningStrike')!;
    expect(ev.type === 'lightningStrike' && ev.hits).toEqual([]);
    expect(ev.type === 'lightningStrike' && ev.skyVisible).toBe(false);
    expect(t.sounds).toContain('lightningFar');
    expect(t.sounds).not.toContain('lightning');
  });

  it('空が 見える 落雷は lightning の 音', () => {
    const t = ready();
    for (let i = 0; i < 8; i++) t.step({ held: false });
    expect(t.sounds).toContain('lightning');
  });

  it('S の 向きは F1 の 照準（そのあと 動かしても 変わらない）', () => {
    const t = ready();
    t.step({ held: false }); // F1
    const other = dirTo({ x: 30.5, y: FLOOR + 1, z: 16.5 });
    for (let i = 0; i < 7; i++) t.step({ held: false, dir: other });
    const ev = t.sys.peekEvents().find((e) => e.type === 'lightningStrike')!;
    expect(ev.type === 'lightningStrike' && ev.S!.x).toBeCloseTo(20.5, 3);
  });

  it('列に ブロックが ない（世界の 外）→ lightningMiss・音だけ', () => {
    const t = setup();
    // 床を 消す
    for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) t.world.setBlock(x, FLOOR, z, 'air');
    charge(t, 60);
    for (let i = 0; i < 9; i++) t.step({ held: false });
    expect(t.types()).toContain('lightningMiss');
    expect(t.types()).not.toContain('lightningStrike');
  });

  it('たいきゅう: 1 体でも 当たれば 1（3 体でも 1）・空ぶりは 0', () => {
    const S = { x: 20.5, y: FLOOR + 1, z: 12.5 };
    const list = [-1.2, 0, 1.2].map((dx) => yokaiAt('karakasa', { x: S.x + dx, y: S.y, z: S.z - 1 }));
    const a = ready(list);
    for (let i = 0; i < 12; i++) a.step({ held: false });
    expect(a.wear()).toBe(1);
    const b = ready();
    for (let i = 0; i < 12; i++) b.step({ held: false });
    expect(b.wear()).toBe(0);
  });

  it('わざの 間は busy・持ちかえで 落雷は 出ない', () => {
    const t = ready();
    t.step({ held: false });
    t.step({ held: false });
    const r = t.step({ held: false, item: null });
    expect(r.busy).toBe(false);
    expect(t.sys.state().move).toBeNull();
    for (let i = 0; i < 10; i++) t.step({ held: false, item: 'raijin_ken' });
    expect(t.types()).not.toContain('lightningStrike');
  });

  it('motion: わざの 間は 歩けない・ジャンプ なし。F1 で 速さ 0・向きは F1 の まま', () => {
    const t = ready();
    t.step({ held: false, yawDeg: 33 });
    const m = t.sys.motion();
    expect(m.speedMul).toBe(0);
    expect(m.jumpLocked).toBe(true);
    expect(m.stopNow).toBe(true);
    expect(m.faceDeg).toBe(33);
    t.step({ held: false, yawDeg: 90 });
    expect(t.sys.motion().stopNow).toBe(false);
    expect(t.sys.motion().faceDeg).toBe(33);
  });

  it('先行入力: F38〜45 に 押すと おわった 次の ステップ（F46）に 次の ため。F37 は 受けない', () => {
    for (const [f, want] of [[37, 0], [38, 1], [45, 1]] as const) {
      const t = ready();
      t.step({ held: false }); // F1
      let startedAt = -1;
      for (let F = 2; F <= 50; F++) {
        const before = t.types().filter((x) => x === 'chargeStart').length;
        t.step({ held: F === f, pressed: F === f, startOk: F === f }); // 押した ステップだけ ふりわけは わざ（はなした あとは ほる 側でも 先行入力は 生きる）
        if (t.types().filter((x) => x === 'chargeStart').length > before) startedAt = F;
      }
      if (want) expect(startedAt, `F${f}`).toBe(46);
      else expect(startedAt, `F${f}`).toBe(-1);
    }
  });

  it('押しっぱなしで わざが おわると F46 に 次の ため（同じ わざを くり返さない）', () => {
    const t = ready();
    t.step({ held: false });
    for (let F = 2; F <= 45; F++) t.step({ held: true });
    expect(t.types().filter((x) => x === 'chargeStart')).toHaveLength(1);
    t.step({ held: true });
    expect(t.types().filter((x) => x === 'chargeStart')).toHaveLength(2);
    expect(t.sys.state().charge?.ticks).toBe(1);
  });
});

describe('先行入力（刀の わざの あと）', () => {
  it('刀が わざ中に 押す（受けられる F）→ 刀が おわった ステップに ためが 始まる', () => {
    const t = setup();
    t.step({ bladeBusy: true, bladeAccepts: false, pressed: true, held: true });
    expect(t.sys.state().charge).toBeNull();
    // 受けられない F の 押しは 捨てる（押しっぱなしは あとで 始まる）
    const t2 = setup();
    t2.step({ bladeBusy: true, bladeAccepts: true, pressed: true, held: true });
    t2.step({ bladeBusy: true, bladeAccepts: true });
    const r = t2.step({ bladeBusy: false });
    expect(r.busy).toBe(true);
    expect(t2.sys.state().charge?.ticks).toBe(1);
  });
});

describe('legendary に データを 足すと したがう（AC1）', () => {
  it('ほかの 刀の データ（chargeTicks 30・power 5）で 同じ しくみが 動く', () => {
    const t = setup();
    t.S.legendary.push({
      item: 'crystal_katana',
      power: 5,
      charge: { kind: 'lightning', chargeTicks: 30, range: 20, radius: 5, damageMul: 2, knock: [2, 4], strikeF: 8, boltSteps: 12, recovery: 40 },
      onAttack: [],
      passive: [],
    });
    for (let i = 0; i < 30; i++) t.step({ item: 'crystal_katana', pressed: i === 0, held: true });
    expect(t.types().filter((x) => x === 'chargeReady')).toHaveLength(1);
    expect(t.sys.state().item).toBe('crystal_katana');
    expect(t.sys.state().power).toBe(5);
  });
});

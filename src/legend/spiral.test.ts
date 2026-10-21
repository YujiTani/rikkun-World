import { describe, expect, it } from 'vitest';
import { createW2Settings, type ItemId, type Vec3, type YokaiInfo } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createLegendSystem, type LegendEvent } from './LegendSystem';
import { createWaveSystem, type WaveStepCtx } from './WaveSystem';

/**
 * WEAPON-8 AC5〜AC10・AC20・AC33・AC34: らせんの かぜ（WaveSystem の 'spiral'）の とび方・当たり・ブロック・たいきゅう・
 * 見た目の 窓口の 値（age・spin・bodyAlpha・backAlpha）と、ふつうの 真空波の K1 の 窓口の 値（drawPos・face）。
 */
const FUJIN = 'fujin_ken' as ItemId;
const FLOOR = 8;
/** 体の点 B（北向き u = (0,0,-1)。B.z = 30 なので「前 d」の 面は z = 30 - d） */
const B: Vec3 = { x: 20.5, y: FLOOR + 2.4, z: 30 };
const idle: WaveStepCtx = { item: FUJIN, tech: null, phase: 'idle', frame: 0, startup: 4, dirDeg: 0, body: B };

interface Spec {
  /** 前 d（B から）・横 s（右が +）に 立つ からかさ */
  yokai?: { front: number; side?: number; kind?: string }[];
  reduced?: boolean;
  solid?: (x: number, y: number, z: number) => boolean;
  blocks?: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; id: 'stone' | 'water' | 'torch' | 'leaves' }[];
}

function rig(spec: Spec = {}) {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
  for (const b of spec.blocks ?? []) for (let x = b.x0; x <= b.x1; x++) for (let y = b.y0; y <= b.y1; y++) for (let z = b.z0; z <= b.z1; z++) world.setBlock(x, y, z, b.id);
  const list = (spec.yokai ?? []).map((y, i) => ({ id: i + 1, kind: y.kind ?? 'karakasa', scale: 1, state: 'idle', position: { x: B.x + (y.side ?? 0), y: FLOOR + 1, z: B.z - y.front } })) as unknown as YokaiInfo[];
  const hits: { id: number; amount: number; from: Vec3; knock?: { dist: number; up: number } }[] = [];
  const events: LegendEvent[] = [];
  const sounds: string[] = [];
  let tick = 100;
  let wear = 0;
  const S = createW2Settings();
  const w = createWaveSystem({
    world,
    yokai: () => ({ list: () => list, damage: (id: number, amount: number, from: Vec3, knock?: { dist: number; up: number }) => (hits.push({ id, amount, from, knock }), amount) }) as never,
    settings: S,
    tick: () => tick,
    emit: (e) => events.push(e as LegendEvent),
    sound: (v) => sounds.push(`windWave${v}`),
    spiralSound: () => sounds.push('spiralWind'),
    onSpiralHit: () => (wear += 1),
    reducedMotion: () => spec.reduced ?? false,
    seed: 3,
  });
  /** かぜを 出して（F6 = a 0）、a = 0 から n ステップ すすめる。各 ステップの 後の 窓口の 行を 返す */
  const fire = (dirDeg = 0) => {
    w.launchSpiral({ item: FUJIN, dirDeg, body: B });
    w.step(idle); // 出た ステップは すすまない
  };
  const advance = (n: number) => {
    const rows: ReturnType<typeof w.list>[number][] = [];
    for (let i = 0; i < n; i++) {
      tick += 1;
      w.step(idle);
      const s = w.list().find((x) => x.kind === 'spiral');
      if (s) rows.push({ ...s, position: { ...s.position }, drawPos: { ...s.drawPos } });
    }
    return rows;
  };
  const ev = (type: string) => events.filter((e) => e.type === type);
  return { w, world, events, hits, sounds, ev, fire, advance, wear: () => wear, tick: () => tick, bumpTick: () => (tick += 1) };
}

describe('AC5: とび方（a の 数え方）', () => {
  it('F6 = a 0: position = B + u×1.0・dir の y = 0・spiralStart・音 1 回', () => {
    const r = rig();
    r.fire();
    const s = r.w.list().find((x) => x.kind === 'spiral')!;
    expect(s).toBeTruthy();
    expect(s.position.x).toBeCloseTo(B.x, 2);
    expect(s.position.z).toBeCloseTo(B.z - 1.0, 2);
    expect(s.position.y).toBeCloseTo(B.y, 2);
    expect(s.dir.y).toBe(0);
    expect(s.age).toBe(0);
    expect(s.traveled).toBe(0);
    expect(r.ev('spiralStart')).toHaveLength(1);
    expect(r.sounds.filter((x) => x === 'spiralWind')).toHaveLength(1);
  });
  it('a ごとに traveled = 0.2 × a。a 60 に spiralEnd(range)・traveled 12.0・position = B + u×13.0。a 59 には まだ ない', () => {
    const r = rig();
    r.fire();
    const rows = r.advance(59);
    rows.forEach((s, i) => {
      expect(s.age).toBe(i + 1);
      expect(s.traveled).toBeCloseTo(0.2 * (i + 1), 2);
      expect(s.position.z).toBeCloseTo(B.z - 1 - 0.2 * (i + 1), 2);
    });
    expect(r.ev('spiralEnd')).toHaveLength(0);
    r.advance(1);
    const end = r.ev('spiralEnd');
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ reason: 'range', traveled: expect.closeTo(12, 2) });
    expect((end[0] as { position: Vec3 }).position.z).toBeCloseTo(B.z - 13, 2);
    expect(r.w.list().filter((x) => x.kind === 'spiral')).toHaveLength(0);
  });
  it('向きは 水平（dirDeg 90 = 東 +X）', () => {
    const r = rig();
    r.fire(90);
    const s = r.w.list().find((x) => x.kind === 'spiral')!;
    expect(s.position.x).toBeCloseTo(B.x + 1, 2);
    expect(s.dir.x).toBeCloseTo(1, 5);
  });
});

describe('AC6・AC7・AC9: 当たり・ふっとび', () => {
  it('線の 上 前 3・7・11 の 3 体に 12 を 1 回ずつ。かぜは 消えない。押し方は 水平 3・上 1', () => {
    const r = rig({ yokai: [{ front: 3 }, { front: 7 }, { front: 11 }] });
    r.fire();
    r.advance(55);
    const hits = r.ev('spiralHit') as { yokaiId: number; damage: number }[];
    expect(hits.map((h) => h.yokaiId).sort()).toEqual([1, 2, 3]);
    for (const h of hits) expect(h.damage).toBeCloseTo(12, 2);
    expect(r.hits).toHaveLength(3);
    for (const h of r.hits) {
      expect(h.amount).toBeCloseTo(12, 2);
      expect(h.knock).toEqual({ dist: 3, up: 1 });
    }
    expect(r.w.list().filter((x) => x.kind === 'spiral')).toHaveLength(1);
    r.advance(40);
    expect(r.ev('spiralHit')).toHaveLength(3); // 1 体 1 回
  });
  it('前 15 は 当たらない。前 6・横 0.8 は 当たる・前 6・横 2.0 は 当たらない', () => {
    const r = rig({ yokai: [{ front: 15 }, { front: 6, side: 0.8 }, { front: 6, side: 2.0 }] });
    r.fire();
    r.advance(65);
    const ids = (r.ev('spiralHit') as { yokaiId: number }[]).map((h) => h.yokaiId);
    expect(ids).toEqual([2]);
  });
  it('B の 後ろ 1.0 は 当たらない。体の すぐ後ろ（後ろ 0.5）は 玉の はしが ふれて 当たる', () => {
    const behind = rig({ yokai: [{ front: -1.0 }] });
    behind.fire();
    behind.advance(65);
    expect(behind.ev('spiralHit')).toHaveLength(0);
    const near = rig({ yokai: [{ front: -0.5 }] });
    near.fire();
    near.advance(3);
    expect(near.ev('spiralHit')).toHaveLength(1);
  });
  it('前 2〜12・横 0.8 以内は 必ず 当たる（r 0.9 の 大きい 妖怪も）', () => {
    for (const front of [2, 5, 12]) {
      const r = rig({ yokai: [{ front, side: 0.8, kind: 'nurikabe' }] });
      r.fire();
      r.advance(65);
      expect(r.ev('spiralHit'), `前 ${front}`).toHaveLength(1);
    }
  });
  it('地下（上に ブロック）でも 同じ 当たり', () => {
    const r = rig({
      yokai: [{ front: 3 }, { front: 7 }, { front: 15 }],
      blocks: [{ x0: 0, y0: FLOOR + 5, z0: 0, x1: 47, y1: FLOOR + 5, z1: 47, id: 'stone' }],
    });
    r.fire();
    r.advance(65);
    expect((r.ev('spiralHit') as { yokaiId: number }[]).map((h) => h.yokaiId)).toEqual([1, 2]);
  });
});

describe('AC8: ブロック', () => {
  const wall = (h: number, id: 'stone' | 'water' | 'torch' | 'leaves' = 'stone') => ({ x0: 15, y0: FLOOR + 1, z0: 25, x1: 25, y1: FLOOR + h, z1: 25, id });
  it('高さ 2 の 固い かべ（手前の 面が 前 4.0）→ spiralEnd(block)・position は 前 4.0〜4.2・ブロックは のこる', () => {
    const r = rig({ blocks: [wall(2)], yokai: [{ front: 7 }] });
    r.fire();
    r.advance(30);
    const end = r.ev('spiralEnd') as { reason: string; position: Vec3 }[];
    expect(end).toHaveLength(1);
    expect(end[0]!.reason).toBe('block');
    const front = B.z - end[0]!.position.z;
    expect(front).toBeGreaterThanOrEqual(4.0 - 1e-6);
    expect(front).toBeLessThanOrEqual(4.2 + 1e-6);
    expect(r.world.getBlock(20, FLOOR + 2, 25)).toBe('stone');
    expect(r.ev('spiralHit')).toHaveLength(0);
  });
  it('同じ 所が 高さ 1 の 段差 → 消えず、前 7 の からかさに 当たる', () => {
    const r = rig({ blocks: [wall(1)], yokai: [{ front: 7 }] });
    r.fire();
    r.advance(40);
    expect(r.ev('spiralEnd').filter((e) => (e as { reason: string }).reason === 'block')).toHaveLength(0);
    expect(r.ev('spiralHit')).toHaveLength(1);
  });
  it('はっぱ（高さ 2）→ 消える。水・たいまつ → とおる', () => {
    const leaf = rig({ blocks: [wall(2, 'leaves')] });
    leaf.fire();
    leaf.advance(30);
    expect(leaf.ev('spiralEnd')).toHaveLength(1);
    for (const id of ['water', 'torch'] as const) {
      const r = rig({ blocks: [wall(2, id)] });
      r.fire();
      r.advance(65);
      expect((r.ev('spiralEnd') as { reason: string }[]).map((e) => e.reason), id).toEqual(['range']);
    }
  });
  it('目の前（B + 1.0）が かべ → 出た ステップに spiralStart と spiralEnd(block)', () => {
    const r = rig({ blocks: [{ x0: 15, y0: FLOOR + 1, z0: 29, x1: 25, y1: FLOOR + 3, z1: 29, id: 'stone' }] });
    r.fire();
    expect(r.ev('spiralStart')).toHaveLength(1);
    expect((r.ev('spiralEnd') as { reason: string }[]).map((e) => e.reason)).toEqual(['block']);
    expect(r.w.list().filter((x) => x.kind === 'spiral')).toHaveLength(0);
  });
});

describe('AC10: たいきゅう・上限', () => {
  it('1 体 以上に 当たれば 1 回だけ（3 体でも 1）・空ぶりは 0', () => {
    const r = rig({ yokai: [{ front: 3 }, { front: 4 }, { front: 5 }] });
    r.fire();
    r.advance(65);
    expect(r.wear()).toBe(1);
    const e = rig();
    e.fire();
    e.advance(65);
    expect(e.wear()).toBe(0);
  });
  it('らせんは 1 つまで。真空波の 8 に 数えない（8 つ ある ときも 出る）', () => {
    const r = rig();
    for (let i = 0; i < 8; i++) {
      r.bumpTick();
      r.w.step({ item: FUJIN, tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg: 0, body: B });
    }
    expect(r.w.list().filter((x) => x.kind === 'wave')).toHaveLength(8);
    r.fire();
    expect(r.w.list().filter((x) => x.kind === 'spiral')).toHaveLength(1);
    r.w.launchSpiral({ item: FUJIN, dirDeg: 0, body: B });
    expect(r.w.list().filter((x) => x.kind === 'spiral')).toHaveLength(1);
    expect(r.w.list().filter((x) => x.kind === 'wave').length).toBeLessThanOrEqual(8);
  });
});

describe('AC20・AC33: 見た目の 窓口の 値', () => {
  it('ふつうは spin が 1 ステップに 24 度 以下で ふえる・bodyAlpha 0.5・backAlpha 0.3（a 10 から おわりまで）', () => {
    const r = rig();
    r.fire();
    const rows = r.advance(59);
    for (let i = 1; i < rows.length; i++) {
      const d = rows[i]!.spin - rows[i - 1]!.spin;
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(24);
    }
    for (const s of rows.filter((x) => x.age >= 10)) {
      expect(s.bodyAlpha).toBeCloseTo(0.5, 2);
      expect(s.backAlpha).toBeCloseTo(0.3, 2);
    }
    expect(rows[0]!.face).toBeNull();
  });
  it('「動きを減らす」: spin 0。当たり・traveled・spiralEnd・alpha は ふつうと 同じ', () => {
    const a = rig({ yokai: [{ front: 5 }] });
    const b = rig({ yokai: [{ front: 5 }], reduced: true });
    a.fire();
    b.fire();
    const ra = a.advance(60);
    const rb = b.advance(60);
    expect(rb.every((s) => s.spin === 0)).toBe(true);
    expect(ra.length).toBe(rb.length);
    ra.forEach((s, i) => {
      expect(rb[i]!.traveled).toBeCloseTo(s.traveled, 9);
      expect(rb[i]!.bodyAlpha).toBe(s.bodyAlpha);
    });
    expect(b.ev('spiralHit')).toHaveLength(a.ev('spiralHit').length);
    expect(b.ev('spiralEnd')).toHaveLength(1);
  });
});

describe('AC34: ふつうの 真空波の 見た目の 窓口（drawPos・face）', () => {
  const fireWave = (r: ReturnType<typeof rig>, dirDeg: number) => {
    r.bumpTick();
    r.w.step({ item: FUJIN, tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg, body: B });
    return r.w.list().find((x) => x.kind === 'wave')!;
  };
  it('drawPos − position = dir を 上から見て 右へ 水平 0.4（北向きなら +x）。y は 同じ。position は 当たりの まま', () => {
    const r = rig();
    const w = fireWave(r, 0);
    expect(w.position.x).toBeCloseTo(B.x, 5);
    expect(w.drawPos.x - w.position.x).toBeCloseTo(0.4, 2);
    expect(w.drawPos.y).toBeCloseTo(w.position.y, 5);
    expect(w.drawPos.z - w.position.z).toBeCloseTo(0, 5);
    const e = rig();
    const we = fireWave(e, 90); // 東向き → 右は 南（+z）
    expect(we.drawPos.z - we.position.z).toBeCloseTo(0.4, 2);
    expect(we.drawPos.x - we.position.x).toBeCloseTo(0, 5);
    expect(we.kind).toBe('wave');
    expect(we.bodyAlpha).toBeNull();
    expect(we.backAlpha).toBeNull();
    expect(we.spin).toBe(0);
  });
  it('face: カメラを 横に 置いて 画面で 右へ → 0、左へ → 4、うしろから 遠ざかる → 2、近づく → 6（0〜7 は 右から 反時計回り）', () => {
    const side = (dx: number, dz: number) => {
      // 東から 西を 見る カメラ: 画面の 右 = 北（-z）
      const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
      void world;
      return { forward: { x: -1, y: 0, z: 0 }, project: (p: Vec3, o: { x: number; y: number }) => ((o.x = -p.z), (o.y = p.y), true), dx, dz };
    };
    const behind = {
      forward: { x: 0, y: 0, z: -1 },
      project: (p: Vec3, o: { x: number; y: number }) => ((o.x = p.x), (o.y = p.y - 0.3 * p.z), true),
    };
    const faceOf = (view: { forward: Vec3; project: (p: Vec3, o: { x: number; y: number }) => boolean }, dirDeg: number) => {
      const r = rigWithView(view);
      r.bumpTick();
      r.w.step({ item: FUJIN, tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg, body: B });
      return r.w.list().find((x) => x.kind === 'wave')!.face;
    };
    const s = side(0, 0);
    expect(faceOf(s, 0)).toBe(0); // 北へ = 画面で 右
    expect(faceOf(s, 180)).toBe(4);
    expect(faceOf(behind, 0)).toBe(2); // 遠ざかる
    expect(faceOf(behind, 180)).toBe(6); // 近づく
  });
  it('view が なければ face は 0', () => {
    const r = rig();
    expect(fireWave(r, 0).face).toBe(0);
  });
});

function rigWithView(view: { forward: Vec3; project: (p: Vec3, o: { x: number; y: number }) => boolean }) {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
  const events: LegendEvent[] = [];
  let tick = 1;
  const w = createWaveSystem({
    world,
    yokai: () => ({ list: () => [], damage: () => 1 }) as never,
    settings: createW2Settings(),
    tick: () => tick,
    emit: (e) => events.push(e as LegendEvent),
    view: () => view,
    seed: 1,
  });
  return { w, bumpTick: () => (tick += 1) };
}

describe('LegendSystem と つなぐ: F6 に かぜが 出る', () => {
  it('launchSpiral を LegendSystem から 呼ぶと F6 に spiralStart・音・かぜの 位置', () => {
    const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
    for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
    const S = createW2Settings();
    let tick = 0;
    const out: LegendEvent[] = [];
    const sounds: string[] = [];
    const yw = { list: () => [] as YokaiInfo[], raycast: () => null, damage: () => 1 } as never;
    const legend = createLegendSystem({
      world,
      yokai: () => yw,
      settings: S,
      tick: () => tick,
      launchSpiral: (a) => waves.launchSpiral({ ...a, body: B }),
    });
    const waves = createWaveSystem({ world, yokai: () => yw, settings: S, tick: () => tick, emit: (e) => (legend.emit(e as LegendEvent), out.push(e as LegendEvent)), spiralSound: () => sounds.push('spiralWind') });
    const ctx = { item: FUJIN, active: true, pressed: false, held: false, startOk: true, bladeBusy: false, bladeAccepts: false, bladeChainOpen: false, eye: B, dir: { x: 0, y: 0, z: -1 }, position: { x: B.x, y: FLOOR + 1, z: B.z }, yawDeg: 0, inWater: false };
    const run = (o: object) => {
      tick += 1;
      legend.step({ ...ctx, ...o });
      waves.step(idle);
    };
    run({ pressed: true, held: true });
    for (let i = 1; i < 60; i++) run({ held: true });
    const startF: number[] = [];
    for (let F = 1; F <= 8; F++) {
      run({ held: false });
      if (out.some((e) => e.type === 'spiralStart') && startF.length === 0) startF.push(F);
    }
    expect(startF).toEqual([6]);
    expect(sounds).toEqual(['spiralWind']);
    expect(legend.spiralSound()).toBe('on');
    // F8 = a 2
    expect(waves.list()[0]).toMatchObject({ kind: 'spiral', age: 2 });
  });
});

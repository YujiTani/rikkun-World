import { describe, expect, it } from 'vitest';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import type { YokaiInfo, YokaiWorld } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createHammerSystem, type HammerCtx } from './HammerSystem';

const T = LEGEND4_TUNING.daichi;
const FLOOR = 8; // 石の 床の 高さ。足は y = 9

type P3 = { x: number; y: number; z: number };

function setup(opts: { hp?: number; yokaiAt?: P3; yokaiAts?: P3[]; focus?: { block: P3; face: P3 } | null } = {}) {
  const world = new ArrayVoxelWorld({ x: 32, y: 32, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, FLOOR, z, 'stone');
  const yokai: { hp: number; hits: number[]; ids: number[] } = { hp: opts.hp ?? 99, hits: [], ids: [] };
  const ats = opts.yokaiAts ?? (opts.yokaiAt ? [opts.yokaiAt] : []);
  const list: YokaiInfo[] = ats.map((at, i) => ({ id: i + 1, kind: 'karakasa', position: at, yawDeg: 0, hp: yokai.hp, maxHp: 99, state: 'idle', attackTick: 0, scale: 1, name: '', title: 'none', m: 1, attack: 0 }) as unknown as YokaiInfo);
  const yw = {
    list: () => list,
    damage: (id: number, amount: number) => {
      yokai.hp -= amount;
      yokai.hits.push(amount);
      yokai.ids.push(id);
    },
  } as unknown as YokaiWorld;
  const sounds: string[] = [];
  let wear = 0;
  const broken: string[] = [];
  let focus = opts.focus ?? null;
  const sys = createHammerSystem({
    world,
    yokai: () => yw,
    breakAt: (x, y, z) => {
      broken.push(`${x},${y},${z}`);
      world.setBlock(x, y, z, 'air');
      return true;
    },
    focus: () => focus,
    wear: () => wear++,
    sound: (n) => sounds.push(n),
  });
  const pos = { x: 10.5, y: FLOOR + 1, z: 10.5 };
  let prev = false;
  /** 1 ステップ。motion を かんたんに ためす（controller の かわり: hoverY へ 0.5 まで・かべ〔床〕で とまる） */
  const step = (o: { held?: boolean; item?: string | null; yaw?: number; inWater?: boolean; vy?: number } = {}) => {
    const m = sys.motion();
    if (m.hoverY !== null) pos.y = Math.max(FLOOR + 1, pos.y + Math.max(-0.5, Math.min(0.5, m.hoverY - pos.y)));
    else if (o.vy) pos.y = Math.max(FLOOR + 1, pos.y + o.vy);
    const held = o.held ?? false;
    const ctx: HammerCtx = {
      item: o.item === undefined ? 'daichi_hammer' : (o.item as HammerCtx['item']),
      active: true,
      pressed: held && !prev,
      held,
      position: pos,
      yawDeg: o.yaw ?? 0,
      onGround: pos.y <= FLOOR + 1 + 1e-9,
      inWater: o.inWater ?? false,
    };
    prev = held;
    sys.update(ctx);
  };
  return { world, sys, step, pos, yokai, sounds, broken, getWear: () => wear, setFocus: (f: typeof focus) => (focus = f) };
}

/** 北の かべ（z = 8）を 3 × 3 で 作り、まん中の ブロックを ねらう（面は 南向き） */
const wallFocus = { block: { x: 10, y: FLOOR + 2, z: 8 }, face: { x: 0, y: 0, z: 1 } };
const fillWall = (world: ArrayVoxelWorld) => world.fill(8, FLOOR + 1, 8, 12, FLOOR + 3, 8, 'stone');

describe('HammerSystem 地面の 振り', () => {
  it('D1 当たりは F43〜F51 だけ・押しつづけで F160 に 次の F1', () => {
    const s = setup({ yokaiAt: { x: 10.5, y: FLOOR + 1, z: 9 } });
    const log: { f: number; hits: number }[] = [];
    s.step({ held: true });
    expect(s.sys.view().phase).toBe('swing');
    expect(s.sys.view().f).toBe(1);
    for (let i = 2; i <= 170; i++) {
      s.step({ held: true });
      log.push({ f: s.sys.view().f, hits: s.yokai.hits.length });
    }
    // 1 回目は F43 で 1 回だけ（1 体は 1 回）
    expect(log.find((l) => l.f === 42)!.hits).toBe(0);
    expect(log.find((l) => l.f === 43)!.hits).toBe(1);
    expect(s.sys.view().f).toBe(170 - 159); // 160 ステップ目で 次の F1
    expect(log[log.length - 1]!.hits).toBe(1); // 2 回目の 当たりは F43 まで 来て いない
  });
  it('D2・D4 ねらった かべの 3 × 3（9 マス）だけ こわれる・F43 に 20 を 1 回', () => {
    const s = setup({ yokaiAt: { x: 10.5, y: FLOOR + 1, z: 9.5 }, focus: wallFocus });
    fillWall(s.world);
    s.world.fill(8, FLOOR + 1, 7, 12, FLOOR + 3, 7, 'stone'); // 2 まい目
    s.step({ held: true });
    for (let i = 2; i <= 60; i++) s.step();
    expect(s.broken.length).toBe(9);
    for (const x of [9, 10, 11]) for (const y of [FLOOR + 1, FLOOR + 2, FLOOR + 3]) expect(s.world.getBlock(x, y, 8)).toBe('air');
    expect(s.world.getBlock(8, FLOOR + 2, 8)).toBe('stone'); // よこの そと
    expect(s.world.getBlock(12, FLOOR + 2, 8)).toBe('stone');
    expect(s.world.getBlock(10, FLOOR + 2, 7)).toBe('stone'); // おくは こわさない
    expect(s.yokai.hits).toEqual([T.damage]);
    expect(s.sounds).toContain('hammerSlam');
    expect(s.sys.view().last?.broken.length).toBe(9);
    expect(s.getWear()).toBe(1);
  });
  it('足もと・頭の 上を ねらっても 同じ 3 × 3（面に 沿う）', () => {
    const g = setup({ focus: { block: { x: 10, y: FLOOR, z: 9 }, face: { x: 0, y: 1, z: 0 } } });
    g.step({ held: true });
    for (let i = 2; i <= 60; i++) g.step();
    expect(g.broken.length).toBe(9);
    expect(g.broken.every((b) => b.split(',')[1] === String(FLOOR))).toBe(true);
    const c = setup({ focus: { block: { x: 10, y: FLOOR + 4, z: 10 }, face: { x: 0, y: -1, z: 0 } } });
    c.world.fill(9, FLOOR + 4, 9, 11, FLOOR + 4, 11, 'stone');
    c.step({ held: true });
    for (let i = 2; i <= 60; i++) c.step();
    expect(c.broken.length).toBe(9);
  });
  it('ねらいが ブロックで ない（null）と こわさない・ゴン', () => {
    const s = setup({ focus: null });
    fillWall(s.world);
    s.step({ held: true });
    for (let i = 2; i <= 60; i++) s.step();
    expect(s.broken).toEqual([]);
    expect(s.sounds).toContain('hammerBonk');
  });
  it('射程: 当たった 点の まわり 半径 1.5 の 妖怪（扇の 遠さ 5 より 外）にも 20', () => {
    const far = { x: 10.5, y: FLOOR + 1, z: 4.5 }; // 体から 6 マス
    const s = setup({ yokaiAt: far, focus: { block: { x: 10, y: FLOOR + 2, z: 5 }, face: { x: 0, y: 0, z: 1 } } });
    s.step({ held: true });
    for (let i = 2; i <= 60; i++) s.step();
    expect(s.yokai.hits).toEqual([T.damage]);
    const n = setup({ yokaiAt: { x: 10.5, y: FLOOR + 1, z: 2.5 }, focus: null }); // 点が 前方 5 マス → 8 マスの 妖怪は 当たりの 外
    n.step({ held: true });
    for (let i = 2; i <= 60; i++) n.step();
    expect(n.yokai.hits).toEqual([]);
  });
  it('扇は とどく 距離 5 まで のびた（4.5 マス 先の 妖怪に 当たる）', () => {
    const s = setup({ yokaiAt: { x: 10.5, y: FLOOR + 1, z: 6 } });
    s.step({ held: true });
    for (let i = 2; i <= 60; i++) s.step();
    expect(s.yokai.hits).toEqual([T.damage]);
  });
  it('D3 こわせない 物は そのまま', () => {
    const s = setup({ focus: wallFocus });
    s.world.setBlock(9, FLOOR + 1, 8, 'bedrock');
    s.world.setBlock(10, FLOOR + 2, 8, 'stone');
    s.world.setBlock(11, FLOOR + 1, 8, 'tansu');
    s.world.setBlock(9, FLOOR + 2, 8, 'brick');
    s.world.setBlock(10, FLOOR + 3, 8, 'farmland');
    s.step({ held: true });
    for (let i = 2; i <= 60; i++) s.step();
    expect(s.world.getBlock(10, FLOOR + 2, 8)).toBe('air');
    expect(s.world.getBlock(9, FLOOR + 1, 8)).toBe('bedrock');
    expect(s.world.getBlock(11, FLOOR + 1, 8)).toBe('tansu');
    expect(s.world.getBlock(9, FLOOR + 2, 8)).toBe('brick');
    expect(s.world.getBlock(10, FLOOR + 3, 8)).toBe('farmland');
  });
  it('D8 たいきゅう: 何も なければ 0・失敗の ゴン', () => {
    const s = setup();
    s.step({ held: true });
    for (let i = 2; i <= 60; i++) s.step();
    expect(s.getWear()).toBe(0);
    expect(s.sounds).toContain('hammerBonk');
    expect(s.sounds).not.toContain('hammerSlam');
  });
  it('ほかの 物を 持つと 何も しない・もどると 手を はなす まで 出ない', () => {
    const s = setup();
    s.step({ held: true, item: 'katana' });
    expect(s.sys.view().phase).toBe('idle');
  });
});

describe('HammerSystem 急降下', () => {
  it('D5 6 ステップ 止まる → 0.5 ずつ → 着地 = F43・威力 32・17 マス・まわりの 妖怪 ぜんぶ・落下ダメージなし', () => {
    const s = setup({ yokaiAts: [{ x: 10.5, y: FLOOR + 1, z: 9 }, { x: 12, y: FLOOR + 1, z: 11 }, { x: 10.5, y: FLOOR + 1, z: 14.5 }], focus: wallFocus });
    s.world.fill(9, FLOOR + 1, 9, 11, FLOOR + 1, 11, 'stone'); // 体の マスと まわり 8
    s.world.setBlock(10, FLOOR + 1, 10, 'air'); // 体の マス
    s.world.setBlock(12, FLOOR + 1, 10, 'stone'); // 2 マス はなれは こわさない
    fillWall(s.world); // ねらいは 使わない
    s.pos.y = FLOOR + 1 + 6;
    s.step();
    s.step({ held: true });
    expect(['hover', 'dive']).toContain(s.sys.view().phase);
    expect(s.sys.view().diveFrom).toBe(FLOOR + 7);
    expect(s.sys.noFall()).toBe(true);
    const y0 = s.pos.y;
    for (let i = 0; i < T.diveHover; i++) {
      s.step();
      expect(s.pos.y).toBe(y0);
    }
    s.step();
    expect(s.pos.y).toBeCloseTo(y0 - 0.5, 9);
    let guard = 0;
    while (s.sys.view().phase === 'dive' && guard++ < 40) s.step();
    expect(s.pos.y).toBeCloseTo(FLOOR + 1, 9);
    const v = s.sys.view();
    expect(v.phase).toBe('swing');
    expect(v.f).toBe(43);
    expect(v.last?.damage).toBe(32);
    expect(v.last?.broken.length).toBe(17); // 下の 段 9 ＋ 同じ 段 8（体の マスは 空気）
    expect(s.world.getBlock(10, FLOOR, 10)).toBe('air');
    expect(s.world.getBlock(12, FLOOR + 1, 10)).toBe('stone');
    expect(s.world.getBlock(10, FLOOR + 2, 8)).toBe('stone'); // かべは ねらいで ない
    expect(s.yokai.hits).toEqual([32, 32]); // 1.5・1.8 マスの 2 体。3.5 マス はなれた 1 体は 当たらない
    expect(s.sys.noFall()).toBe(true); // 着地の あとも 数ステップは 落下ダメージを 見ない
  });
  it('D7 水に 入ったら おわり（当たり・こわす なし）', () => {
    const s = setup({ yokaiAt: { x: 10.5, y: FLOOR + 1, z: 9 } });
    s.pos.y = FLOOR + 6;
    s.step();
    s.step({ held: true });
    for (let i = 0; i < 10; i++) s.step({ inWater: i >= 8 });
    expect(s.sys.view().phase).toBe('idle');
    expect(s.yokai.hits).toEqual([]);
    expect(s.broken).toEqual([]);
  });
  it('持ちかえたら その場から ふつうに 落ちる', () => {
    const s = setup();
    s.pos.y = FLOOR + 6;
    s.step();
    s.step({ held: true });
    s.step({ item: 'katana' });
    expect(s.sys.view().phase).toBe('idle');
    expect(s.sys.motion().hoverY).toBeNull();
  });
});

describe('HammerSystem がしゃどくろへの 球', () => {
  it('地面の 振り: F43 に 1 回だけ ねらいの 点に 半径 1.5・20。読んだら 空', () => {
    const s = setup({ focus: wallFocus });
    s.step({ held: true });
    const seen: { c: { x: number; y: number; z: number }; r: number; d: number }[] = [];
    for (let i = 2; i <= 60; i++) {
      s.step();
      for (const b of s.sys.bigHits()) seen.push({ c: { ...b.center }, r: b.radius, d: b.damage });
      expect(s.sys.bigHits().length).toBe(0);
    }
    expect(seen.length).toBe(1);
    expect(seen[0]!.r).toBe(T.hitRadius);
    expect(seen[0]!.d).toBe(T.damage);
    expect(seen[0]!.c).toEqual({ x: 10.5, y: FLOOR + 2.5, z: 9 });
  });
  it('急降下: 着地で プレイヤーの まわり 半径 2.5・32 の 球が 1 つ', () => {
    const s = setup();
    s.pos.y = FLOOR + 7;
    s.step();
    s.step({ held: true });
    let n = 0;
    let got: { r: number; d: number; y: number } | null = null;
    for (let i = 0; i < 40; i++) {
      s.step();
      for (const b of s.sys.bigHits()) { n++; got = { r: b.radius, d: b.damage, y: b.center.y }; }
    }
    expect(n).toBe(1);
    expect(got).toEqual({ r: T.diveRadius, d: 32, y: FLOOR + 2 });
  });
});

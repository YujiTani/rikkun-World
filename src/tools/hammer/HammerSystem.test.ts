import { describe, expect, it } from 'vitest';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import type { YokaiInfo, YokaiWorld } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createHammerSystem, type HammerCtx } from './HammerSystem';

const T = LEGEND4_TUNING.daichi;
const FLOOR = 8; // 石の 床の 高さ。足は y = 9

function setup(opts: { hp?: number; yokaiAt?: { x: number; y: number; z: number } } = {}) {
  const world = new ArrayVoxelWorld({ x: 32, y: 32, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, FLOOR, z, 'stone');
  const yokai: { hp: number; hits: number[] } = { hp: opts.hp ?? 99, hits: [] };
  const list: YokaiInfo[] = opts.yokaiAt
    ? [{ id: 1, kind: 'karakasa', position: opts.yokaiAt, yawDeg: 0, hp: yokai.hp, maxHp: 99, state: 'idle', attackTick: 0, scale: 1, name: '', title: 'none', m: 1, attack: 0 } as unknown as YokaiInfo]
    : [];
  const yw = {
    list: () => list,
    damage: (_id: number, amount: number) => {
      yokai.hp -= amount;
      yokai.hits.push(amount);
    },
  } as unknown as YokaiWorld;
  const sounds: string[] = [];
  let wear = 0;
  const broken: string[] = [];
  const sys = createHammerSystem({
    world,
    yokai: () => yw,
    breakAt: (x, y, z) => {
      broken.push(`${x},${y},${z}`);
      world.setBlock(x, y, z, 'air');
      return true;
    },
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
  return { world, sys, step, pos, yokai, sounds, broken, getWear: () => wear };
}

const fillFront = (world: ArrayVoxelWorld, z0: number, z1: number) => world.fill(9, FLOOR + 1, z0, 11, FLOOR + 2, z1, 'stone');

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
  it('D2・D4 前 1 列の 6 マスだけ こわれる・F43 に 20 を 1 回', () => {
    const s = setup({ yokaiAt: { x: 10.5, y: FLOOR + 1, z: 9.5 } });
    fillFront(s.world, 7, 9);
    s.world.fill(9, FLOOR + 1, 11, 11, FLOOR + 2, 11, 'stone'); // うしろ
    s.step({ held: true });
    for (let i = 2; i <= 60; i++) s.step();
    expect(s.broken.length).toBe(6);
    expect(s.world.getBlock(10, FLOOR + 1, 9)).toBe('air');
    expect(s.world.getBlock(10, FLOOR + 1, 8)).toBe('stone');
    expect(s.world.getBlock(10, FLOOR + 1, 11)).toBe('stone');
    expect(s.world.getBlock(10, FLOOR, 9)).toBe('stone');
    expect(s.yokai.hits).toEqual([T.damage]);
    expect(s.sounds).toContain('hammerSlam');
    expect(s.sys.view().last?.broken.length).toBe(6);
    expect(s.getWear()).toBe(1);
  });
  it('D3 こわせない 物は そのまま', () => {
    const s = setup();
    s.world.setBlock(9, FLOOR + 1, 9, 'bedrock');
    s.world.setBlock(10, FLOOR + 1, 9, 'stone');
    s.world.setBlock(11, FLOOR + 1, 9, 'tansu');
    s.world.setBlock(9, FLOOR + 2, 9, 'brick');
    s.world.setBlock(10, FLOOR + 2, 9, 'farmland');
    s.step({ held: true });
    for (let i = 2; i <= 60; i++) s.step();
    expect(s.world.getBlock(10, FLOOR + 1, 9)).toBe('air');
    expect(s.world.getBlock(9, FLOOR + 1, 9)).toBe('bedrock');
    expect(s.world.getBlock(11, FLOOR + 1, 9)).toBe('tansu');
    expect(s.world.getBlock(9, FLOOR + 2, 9)).toBe('brick');
    expect(s.world.getBlock(10, FLOOR + 2, 9)).toBe('farmland');
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
  it('D5 6 ステップ 止まる → 0.5 ずつ → 着地 = F43・威力 32・奥行き 2 で 12 マス・落下ダメージなし', () => {
    const s = setup({ yokaiAt: { x: 10.5, y: FLOOR + 1, z: 9 } });
    fillFront(s.world, 8, 9);
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
    expect(v.last?.depth).toBe(2);
    expect(v.last?.broken.length).toBe(12);
    expect(s.yokai.hits).toEqual([32]);
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

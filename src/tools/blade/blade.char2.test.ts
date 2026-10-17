import { describe, expect, it } from 'vitest';
import type { BladeStepContext, ItemId, YokaiWorld } from '../../contracts';
import { createW2Settings } from '../../contracts';
import type { ActionState } from '../../input/actions';
import { ActionState as Actions } from '../../input/actions';
import { PlayerController } from '../../player/PlayerController';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createBladeSystem } from './BladeSystem';

const noYokai = { list: () => [], raycast: () => null, damage() {}, occupies: () => false, drainEvents: () => [] } as unknown as YokaiWorld;

function rig() {
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, 'stone');
  const actions: ActionState = new Actions();
  const player = new PlayerController(
    world, actions, { consume: () => ({ dx: 0, dy: 0 }) },
    { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true },
    () => ({ x: 16.5, y: 9, z: 16.5, yawDeg: 0, pitchDeg: 0 }),
  );
  const settings = createW2Settings();
  let tick = 0;
  const blade = createBladeSystem({
    world, yokai: () => noYokai, settings, weaponDamage: () => 4, onHit: () => {},
    lunge: (dx, dz) => player.lunge(dx, dz), tick: () => tick,
  });
  let item: ItemId | null = 'katana';
  let yaw = 0;
  const ctx = (o: Partial<BladeStepContext> = {}): BladeStepContext => {
    const p = player.state.position;
    return {
      item, techPressed: false, techHeld: false, stancePressed: false,
      eye: { x: p.x, y: p.y + 1.62, z: p.z }, dir: { x: Math.sin((yaw * Math.PI) / 180), y: 0, z: -Math.cos((yaw * Math.PI) / 180) },
      position: p, yawDeg: yaw, active: true, ...o,
    };
  };
  const step = (o: Partial<BladeStepContext> = {}) => {
    tick++;
    blade.update(ctx(o));
    player.update(1 / 60);
  };
  step();
  return { world, player, blade, settings, step, steps(n: number) { for (let i = 0; i < n; i++) step(); }, setItem: (i: ItemId | null) => (item = i), setYaw: (y: number) => (yaw = y) };
}

describe('AC15 かべ', () => {
  // 体の 半分の はば 0.3。z=16.5 の 体の 前ふち = 16.2。かべの 面（z=16.1）は 整数でないので、体を 0.4 ずらして 置く
  const put = (r: ReturnType<typeof rig>) => {
    // 体の 前ふち z = 16.2 − … : 体を z=16.4 に 置くと 前ふち 16.1 → かべブロック z=15（面 z=16.0）まで すきま 0.10
    r.player.set({ position: { x: 16.5, y: 9, z: 16.4 }, velocity: { x: 0, y: 0, z: 0 } });
    for (let y = 9; y <= 10; y++) r.world.setBlock(16, y, 15, 'stone');
    r.step();
  };
  it('突き: めりこまず、F41 の おわりに O と 同じ', () => {
    const r = rig();
    put(r);
    const o = { ...r.player.state.position };
    r.step({ techPressed: true });
    for (let f = 1; f <= 41; f++) {
      if (f > 1) r.step();
      const gap = r.player.state.position.z - 0.3 - 16; // かべの 面 z=16 との すきま
      expect(gap, `F${f}`).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(Math.abs(r.player.state.position.z - o.z)).toBeLessThan(0.001);
    expect(Math.abs(r.player.state.position.x - o.x)).toBeLessThan(0.001);
  });
  it('大けさぎり: かべの 前で 止まる（O から 0.10）', () => {
    const r = rig();
    put(r);
    r.blade.setStance('jodan');
    const o = r.player.state.position.z;
    r.step({ techPressed: true });
    r.steps(105);
    expect(r.blade.state().phase).toBe('recovery');
    r.step();
    expect(r.blade.state().phase).toBe('idle');
    expect(Math.abs(o - r.player.state.position.z - 0.1)).toBeLessThan(0.001);
  });
  it('止まった ぶんは 押しつづけるが とおりぬけない（move.moved は 実際の きょり）', () => {
    const r = rig();
    put(r);
    r.blade.setStance('jodan');
    r.step({ techPressed: true });
    r.steps(60);
    const m = r.blade.state().move!;
    expect(m.target).toBeCloseTo(0.8, 3);
    expect(m.moved).toBeCloseTo(0.1, 3);
  });
});

describe('AC16 向き', () => {
  it('始めたステップの yaw が わざの向き。とちゅうで yaw を かえても 北のまま', () => {
    const r = rig();
    r.player.set({ facingDeg: 90 });
    r.blade.setStance('jodan');
    r.step({ techPressed: true });
    const m = r.blade.state().move!;
    expect(m.dirDeg).toBe(0);
    expect(m.origin).toEqual({ x: 16.5, y: 9, z: 16.5 });
    r.setYaw(90);
    const o = { ...r.player.state.position };
    r.steps(30); // active (F29〜34) に 入る
    expect(r.blade.state().move!.dirDeg).toBe(0);
    for (let i = 0; i < 6; i++) {
      r.step();
      const sh = r.blade.shape();
      if (sh && sh.kind === 'fan') {
        expect(sh.forward.x).toBeCloseTo(0, 9);
        expect(sh.forward.z).toBeCloseTo(-1, 9);
      }
    }
    expect(Math.abs(r.player.state.position.x - o.x)).toBeLessThan(1e-9);
    expect(r.player.state.position.z).toBeLessThan(o.z);
  });
  it('突きの 線の 向きは 始めたステップの ねらい（上下ふくむ）', () => {
    const r = rig();
    // 始めたステップは 北むき・少し 上。そのあと ねらいが 東向きに かわっても 線は 北
    const s = createBladeSystem({
      world: r.world, yokai: () => noYokai, settings: createW2Settings(), weaponDamage: () => 4, onHit: () => {}, tick: () => 0,
    });
    const base: BladeStepContext = {
      item: 'katana', techPressed: false, techHeld: false, stancePressed: false,
      eye: { x: 16.5, y: 10.62, z: 16.5 }, dir: { x: 0, y: 0.6, z: -0.8 }, position: { x: 16.5, y: 9, z: 16.5 }, yawDeg: 0, active: true,
    };
    s.update(base);
    s.update({ ...base, techPressed: true });
    for (let i = 0; i < 4; i++) s.update({ ...base, dir: { x: 1, y: 0, z: 0 }, yawDeg: 90 });
    const sh = s.shape();
    expect(sh?.kind).toBe('capsule');
    if (sh?.kind === 'capsule') {
      expect(sh.to.x - sh.from.x).toBeCloseTo(0, 9);
      expect(sh.to.y - sh.from.y).toBeGreaterThan(0);
      expect(sh.to.z - sh.from.z).toBeLessThan(0);
    }
  });
});

describe('AC19 取り消し', () => {
  it('大けさぎりの F20 で 持ちかえ → ふみこみが 止まり move = null', () => {
    const r = rig();
    r.blade.setStance('jodan');
    r.step({ techPressed: true });
    r.steps(19); // F20
    expect(r.blade.state().move).not.toBeNull();
    r.setItem('stone');
    r.step();
    const z = r.player.state.position.z;
    expect(r.blade.state().move).toBeNull();
    r.steps(30);
    expect(r.player.state.position.z).toBe(z);
  });
  it('突きの F10 で 持ちかえ → O に もどらない', () => {
    const r = rig();
    const o = r.player.state.position.z;
    r.step({ techPressed: true });
    r.steps(9);
    const z = r.player.state.position.z;
    expect(o - z).toBeGreaterThan(0.2);
    r.setItem('stone');
    r.steps(40);
    expect(r.player.state.position.z).toBe(z);
    expect(r.blade.state().move).toBeNull();
  });
  it('わざが おわると move = null、かまえ変えでは move = null', () => {
    const r = rig();
    r.step({ stancePressed: true });
    expect(r.blade.state().move).toBeNull();
  });
});

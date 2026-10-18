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
      position: p, yawDeg: yaw, active: true,
      // WEAPON-3: わざの 向き u・T・体の点 B（既定は 北 = カメラの yaw 0 と 同じ。個別に わたす）
      body: { x: p.x, y: p.y + 1.4, z: p.z }, attackDirDeg: yaw, attackTarget: null, ...o,
    } as BladeStepContext;
  };
  const step = (o: Partial<BladeStepContext> = {}) => {
    tick++;
    blade.update(ctx(o));
    player.update(1 / 60);
  };
  step();
  return { world, player, blade, settings, step, steps(n: number, o: Partial<BladeStepContext> = {}) { for (let i = 0; i < n; i++) step(o); }, setItem: (i: ItemId | null) => (item = i), setYaw: (y: number) => (yaw = y) };
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
    expect(m.target).toBeCloseTo(3.1, 3); // WEAPON-4: 大けさぎりの ふみこみ 3.1
    expect(m.moved).toBeCloseTo(0.1, 3);
  });
});

describe('AC16 向き（WEAPON-3: わざの向き = 始めたステップに わたされた u）', () => {
  it('始めたステップの u が わざの向き。とちゅうで u や yaw を かえても 始めのまま', () => {
    const r = rig();
    r.player.set({ facingDeg: 90 });
    r.blade.setStance('jodan');
    // facing 90・yaw 0 で 始める。カメラの yaw ではなく わたした u（東 = 90）が わざの向き
    r.step({ techPressed: true, attackDirDeg: 90 });
    const m = r.blade.state().move!;
    expect(m.dirDeg).toBe(90);
    expect(m.origin).toEqual({ x: 16.5, y: 9, z: 16.5 });
    r.setYaw(180);
    const o = { ...r.player.state.position };
    r.steps(30, { attackDirDeg: 180 }); // active (F29〜34) に 入る。あとから わたす u・yaw は 無視
    expect(r.blade.state().move!.dirDeg).toBe(90);
    for (let i = 0; i < 6; i++) {
      r.step({ attackDirDeg: 180 });
      const sh = r.blade.shape();
      if (sh && sh.kind === 'fan') {
        expect(sh.forward.x).toBeCloseTo(1, 9);
        expect(sh.forward.z).toBeCloseTo(0, 9);
      }
    }
    expect(Math.abs(r.player.state.position.z - o.z)).toBeLessThan(1e-9);
    expect(r.player.state.position.x).toBeGreaterThan(o.x);
  });
  it('突きの 線は u の 水平。T が あれば T への かたむき（上下ふくむ）。始めたステップで 固定（WEAPON-3 §4.5）', () => {
    const r = rig();
    const s = createBladeSystem({
      world: r.world, yokai: () => noYokai, settings: createW2Settings(), weaponDamage: () => 4, onHit: () => {}, tick: () => 0,
    });
    const body = { x: 16.5, y: 10.4, z: 16.5 };
    const base = {
      item: 'katana', techPressed: false, techHeld: false, stancePressed: false,
      // E は もう 突きに 使わない（B から）。わざと 遠い 値を 入れて、使われないことも 確かめる
      eye: { x: 16.5, y: 10.62, z: 16.5 }, dir: { x: 1, y: 0.9, z: 0 }, position: { x: 16.5, y: 9, z: 16.5 }, yawDeg: 90, active: true,
      body, attackDirDeg: 0, attackTarget: null,
    } as BladeStepContext;
    // ① T なし: u = 北 の 水平
    s.update(base);
    s.update({ ...base, techPressed: true });
    for (let i = 0; i < 4; i++) s.update({ ...base, attackDirDeg: 90, attackTarget: { x: 30, y: 15, z: 16.5 } });
    let sh = s.shape();
    expect(sh?.kind).toBe('capsule');
    if (sh?.kind === 'capsule') {
      expect(sh.from).toEqual(body);
      expect(Math.abs(sh.to.x - sh.from.x)).toBeLessThan(1e-9);
      expect(Math.abs(sh.to.y - sh.from.y)).toBeLessThan(0.001);
      expect(sh.to.z - sh.from.z).toBeLessThan(0);
    }
    // ② T あり: 北へ 水平 3.0・中心が B より 1.45 上 → 上へ かたむく
    const t = createBladeSystem({
      world: r.world, yokai: () => noYokai, settings: createW2Settings(), weaponDamage: () => 4, onHit: () => {}, tick: () => 0,
    });
    const tgt = { x: 16.5, y: 11.85, z: 13.5 };
    t.update(base);
    t.update({ ...base, techPressed: true, attackDirDeg: 0, attackTarget: tgt });
    for (let i = 0; i < 4; i++) t.update({ ...base, attackDirDeg: 90, attackTarget: null });
    sh = t.shape();
    expect(sh?.kind).toBe('capsule');
    if (sh?.kind === 'capsule') {
      expect(Math.abs(sh.to.x - sh.from.x)).toBeLessThan(1e-9);
      expect(sh.to.y - sh.from.y).toBeGreaterThan(0);
      expect(sh.to.z - sh.from.z).toBeLessThan(0);
      const tilt = (Math.atan2(sh.to.y - sh.from.y, Math.abs(sh.to.z - sh.from.z)) * 180) / Math.PI;
      expect(tilt).toBeCloseTo((Math.atan2(1.45, 3.0) * 180) / Math.PI, 1);
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

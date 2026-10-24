import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, PlayerState, Vec3, VoxelWorld } from '../contracts';
import { ActionState, type Action } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import { raycastBlocks } from './raycast';
import type { BodyAim, BodyBlocksPort } from './bodyBlocks';

/** #293: 体（がしゃどくろ）の 上に ブロックを 置く・こわす 口（DigSystem 側の ふるまい）。体は にせの 固い マスの 集まり */
class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(): boolean { return true; }
  loadedBounds() { return { x0: 0, z0: 0, x1: 64, z1: 64 }; }
  blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean { this.blocks.set(`${x},${y},${z}`, id); return true; }
  isSolid(x: number, y: number, z: number): boolean { const b = this.getBlock(x, y, z); return b !== 'outside' && b !== 'air' && b !== 'water'; }
}

class FakeBody implements BodyBlocksPort {
  body = new Set<string>(); // 体の 本体の 固い マス
  placed = new Map<string, BlockId>();
  glass = new Set<string>(); // ガラスの 雲の マス（本体の 固い マスの うち）
  calls = { place: 0, remove: 0 };
  private k = (c: Vec3): string => `${c.x},${c.y},${c.z}`;
  solid = (x: number, y: number, z: number): boolean => this.body.has(`${x},${y},${z}`) || this.placed.has(`${x},${y},${z}`);
  private fake = { getBlock: (x: number, y: number, z: number) => (this.solid(x, y, z) ? 'stone' : 'air'), isSolid: (x: number, y: number, z: number) => this.solid(x, y, z) } as unknown as VoxelWorld;
  aim(o: Vec3, d: Vec3, reach: number): BodyAim | null {
    const t = raycastBlocks(this.fake, o.x, o.y, o.z, d.x, d.y, d.z, reach, true);
    const g = t ? this.glass.has(this.k(t.block)) : false;
    return t ? { cell: t.block, face: t.face, place: t.place, distance: t.distance, placed: this.placed.get(this.k(t.block)) ?? (g ? 'leaves' : null), glass: g } : null;
  }
  surfaceBelow(): number | null { return null; }
  accepts(b: BlockId): boolean { return b === 'dirt' || b === 'stone'; }
  canPlace(c: Vec3): boolean { return !this.solid(c.x, c.y, c.z); }
  place(c: Vec3, b: BlockId): boolean { this.calls.place++; this.placed.set(this.k(c), b); return true; }
  remove(c: Vec3): BlockId | null {
    if (this.glass.has(this.k(c))) { this.calls.remove++; this.glass.delete(this.k(c)); this.body.delete(this.k(c)); return null; }
    const id = this.placed.get(this.k(c)) ?? null; if (id) { this.calls.remove++; this.placed.delete(this.k(c)); } return id;
  }
}

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  inv = new InventoryImpl();
  body = new FakeBody();
  player: PlayerState = { position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  dig = new DigSystemImpl(this.world, () => this.player, this.actions, this.lock, this.inv, () => 1.62, createDigConfig(), () => 0, null, { bodyBlocks: this.body });
  constructor() {
    // 体: 目の 高さ（y 10）の 前（x 6〜7）に 2 マス
    for (const x of [6, 7]) this.body.body.add(`${x},10,6`);
    this.step(1);
  }
  step(n = 1) { for (let i = 0; i < n; i++) { this.dig.update(); this.actions.endFrame(); } }
  press(a: string) { this.actions.press(a as Action); }
  release(a: string) { this.actions.release(a as Action); }
}

describe('体の 上に ブロックを 置く・こわす（DigSystem）', () => {
  it('置ける ブロックを 持って 体を ねらうと、体の マスが ねらいに なり、右クリックで となりに 置く（持ち物が 1 つ へる・ワールドは 変わらない）', () => {
    const r = new Rig();
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    expect(r.dig.target()).toMatchObject({ block: { x: 6, y: 10, z: 6 }, place: { x: 5, y: 10, z: 6 } });
    r.press('secondary');
    r.step(1);
    expect(r.body.placed.get('5,10,6')).toBe('dirt');
    expect(r.inv.slots()[0]!.count).toBe(4);
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.dig.drainEvents().filter((e) => e.type === 'place')).toHaveLength(1);
  });

  it('続けて 置くと 橋の ように つながる（置いた ブロックの 面を ねらって 置ける）', () => {
    const r = new Rig();
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    r.press('secondary');
    r.step(1);
    r.release('secondary');
    r.step(1);
    // 置いた 5,10,6 が 手前の ねらいに なる → その となり（4,10,6）に 置ける
    expect(r.dig.target()).toMatchObject({ block: { x: 5, y: 10, z: 6 }, id: 'dirt', place: { x: 4, y: 10, z: 6 } });
    r.press('secondary');
    r.step(1);
    expect(r.body.placed.get('4,10,6')).toBe('dirt');
    expect(r.inv.slots()[0]!.count).toBe(3);
  });

  it('置けない ブロック（こたつ・たいまつ など）や 持ち物が 空なら 体は ねらわない（刀・パンチは いつもどおり）', () => {
    const r = new Rig();
    r.step(1);
    expect(r.dig.target()).toBeNull();
    r.inv.setSlot(0, { item: 'torch', count: 3 });
    r.step(1);
    expect(r.dig.target()).toBeNull();
  });

  it('体の 本体は ほれない（左クリックしても 何も おきない）。置いた ブロックは ほると 1 つ もどる', () => {
    const r = new Rig();
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    r.press('primary');
    r.step(40);
    expect(r.body.body.has('6,10,6')).toBe(true);
    expect(r.dig.drainEvents().filter((e) => e.type === 'break')).toHaveLength(0);
    r.release('primary');
    // 置いて から ほる
    r.press('secondary'); r.step(1); r.release('secondary'); r.step(1);
    expect(r.inv.slots()[0]!.count).toBe(4);
    r.inv.setSlot(1, null as never);
    r.inv.select(1); // からっぽの 手
    r.step(1);
    expect(r.dig.target()).toMatchObject({ block: { x: 5, y: 10, z: 6 } });
    r.press('primary');
    for (let i = 0; i < 400 && r.body.placed.size > 0; i++) {
      r.step(1);
      if (r.dig.state().ready) { r.release('primary'); r.press('primary'); r.step(1); } // MAX: 押し直した ステップで こわれる
    }
    r.release('primary');
    expect(r.body.placed.size).toBe(0);
    expect(r.body.calls.remove).toBe(1);
    expect(r.inv.count('dirt')).toBe(5); // もとの 5 こ に もどった（置いて 1 つ へり、こわして 1 つ もどる）
  });

  it('ワールドの ブロックが 体より 近ければ ワールドが 先（ブロックは ワールドに 置く）', () => {
    const r = new Rig();
    r.world.setBlock(4, 10, 6, 'stone'); // 体の 手前に ワールドの ブロック
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    expect(r.dig.target()).toMatchObject({ block: { x: 4, y: 10, z: 6 }, id: 'stone' });
    r.press('secondary');
    r.step(1);
    expect(r.body.calls.place).toBe(0);
    expect(r.world.getBlock(3, 10, 6)).toBe('dirt');
  });

  it('ガラスの 雲の マスは からっぽの 手でも ほれて 割れる（アイテムは 出ない・ほる 音の 出来事も 出さない）。刀を 持つと ねらわない', () => {
    const r = new Rig();
    r.body.glass.add('6,10,6');
    r.inv.setSlot(1, null as never);
    r.inv.select(1);
    r.step(1);
    expect(r.dig.target()).toMatchObject({ block: { x: 6, y: 10, z: 6 } });
    r.press('primary');
    for (let i = 0; i < 400 && r.body.glass.size > 0; i++) {
      r.step(1);
      if (r.dig.state().ready) { r.release('primary'); r.press('primary'); r.step(1); }
    }
    r.release('primary');
    expect(r.body.glass.size).toBe(0);
    expect(r.body.calls.remove).toBe(1);
    expect(r.inv.count('leaves')).toBe(0);
    expect(r.dig.drainEvents().filter((e) => e.type === 'break')).toHaveLength(0);
  });

  it('刀を 持っている ときは 体を ねらわない（刀の ふりで 雲を 割る）', () => {
    const r = new Rig();
    r.body.glass.add('6,10,6');
    r.inv.setSlot(0, { item: 'bokuto', count: 1 });
    r.inv.select(0);
    r.step(1);
    expect(r.dig.target()).toBeNull();
  });
});

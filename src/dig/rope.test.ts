import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/** ROPE-1 AC1・AC2・AC6・AC7（docs/design/ROPE-1.md）: よこの 面に 使って 下へ たらす・こわすと ぜんぶ もどる。台は gadgetBlocks.test.ts と 同じ */

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (this.getBlock(x, y, z) === 'outside') return false;
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    // 固くない置き物（たいまつ・ちょうちん）は 支えにならない
    return b !== 'outside' && b !== 'air' && b !== 'water' && b !== 'rope' && b !== 'rope_coil';
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  inv = new InventoryImpl();
  player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  dig = new DigSystemImpl(this.world, () => this.player, this.actions, this.lock, this.inv, () => 1.62, createDigConfig(), () => 0);
  constructor() {
    this.world.fill(0, 8, 0, 12, 8, 12, 'stone');
    this.step();
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.dig.update();
      this.actions.endFrame();
    }
  }
  hold(item: ItemId, count = 1) {
    this.inv.clear();
    this.inv.setSlot(0, { item, count });
    this.inv.select(0);
    this.step();
  }
  /** 右クリックを 1 回 */
  rightClick() {
    this.actions.press('secondary');
    this.step();
    this.actions.release('secondary');
    this.step();
  }
  /** ねらっているブロックを ひびが MAX になるまで押して、押し直してこわす */
  breakAimed() {
    this.actions.press('primary');
    for (let i = 0; i < 900 && !this.dig.state().ready; i++) this.step();
    this.actions.release('primary');
    this.actions.press('primary');
    this.step();
    this.actions.release('primary');
    this.step();
  }
}


/** プレイヤー（x=2.5, 目の 高さ 10.62、+x を 向く）の 前に がけ: x=4 の かべ（y 9〜10）、x=3 の 下は floor+1〜8 の あな */
function cliff(r: Rig, floor: number) {
  r.world.fill(4, 9, 6, 4, 10, 6, 'stone');
  r.world.fill(3, floor + 1, 6, 3, 8, 6, 'air');
  for (let y = 0; y <= floor; y++) r.world.setBlock(3, y, 6, 'stone');
  r.step();
}
const column = (r: Rig) => Array.from({ length: 12 }, (_, i) => 10 - i).map((y) => r.world.getBlock(3, y, 6));

describe('ロープを たらす（AC1・AC2）', () => {
  it('がけの よこの 面に 使うと、となりの マスから 下へ たれて 床で ロープだまり。1 本 へる', () => {
    const r = new Rig();
    cliff(r, 3); // y=10〜4 の 7 マス、y=3 が 床
    r.hold('rope', 2);
    expect(r.dig.target()?.block).toEqual({ x: 4, y: 10, z: 6 });
    r.rightClick();
    expect(column(r).slice(0, 7)).toEqual(['rope', 'rope', 'rope', 'rope', 'rope', 'rope', 'rope_coil']);
    expect(r.world.getBlock(3, 3, 6)).toBe('stone');
    expect(r.inv.count('rope')).toBe(1);
  });
  it('1 本だと 10 マスで とまり（ロープだまり なし）、もう 1 本 あれば 11 マス 目で 床に とどく', () => {
    const one = new Rig();
    cliff(one, -1); // あなは 世界の 底まで（y=10〜0 の 11 マス）
    one.world.setBlock(3, 0, 6, 'air');
    one.world.setBlock(3, -1, 6, 'stone');
    one.hold('rope', 1);
    one.rightClick();
    expect(column(one).slice(0, 10).every((b) => b === 'rope')).toBe(true);
    expect(one.world.getBlock(3, 0, 6)).toBe('air');
    expect(one.inv.count('rope')).toBe(0);

    const two = new Rig();
    cliff(two, 0); // y=10〜1 の 10 マス
    two.world.fill(3, 0, 6, 3, 0, 6, 'stone');
    two.hold('rope', 2);
    two.rightClick();
    expect(two.world.getBlock(3, 1, 6)).toBe('rope_coil');
    expect(two.inv.count('rope')).toBe(1); // ちょうど 10 マスなので 1 本
  });
  it('ブロックの 上の 面には 使えない（上へは たらさない）', () => {
    const r = new Rig();
    r.player.pitchDeg = -60; // 足もとの 床（上の 面）を ねらう
    r.hold('rope', 1);
    expect(r.dig.target()?.face.y).toBe(1);
    r.rightClick();
    expect([...r.world.blocks.values()].includes('rope')).toBe(false);
    expect(r.inv.count('rope')).toBe(1);
  });
});

describe('ロープを こわす（AC6・AC7）', () => {
  it('どの マスを こわしても ぜんぶ 消えて、つかった 本数が もどる', () => {
    const r = new Rig();
    cliff(r, 3);
    r.hold('rope', 1);
    r.rightClick();
    expect(r.inv.count('rope')).toBe(0);
    r.hold('stone_pickaxe', 1);
    expect(r.dig.target()?.id).toBe('rope'); // 目の 前の ロープの マス（y=10）
    r.breakAimed();
    expect(column(r).slice(0, 7).every((b) => b === 'air')).toBe(true);
    expect(r.inv.count('rope')).toBe(1);
  });
});

describe('あさ（hemp）が でる（AC14・AC15）', () => {
  /** 目の 前（4,10,6）に id を おいて こわす を n 回。でた あさの 数 */
  const breakMany = (id: 'leaves' | 'stone' | 'grass' | 'flower_y', n: number): number => {
    const r = new Rig();
    r.hold('iron_pickaxe', 1);
    for (let i = 0; i < n; i++) {
      r.world.setBlock(4, 10, 6, id);
      r.step();
      r.breakAimed();
      r.step(7 * (i + 1)); // こわす 時こくを ずらす
    }
    return r.inv.count('hemp');
  };
  it('はっぱ・くさ・はなを 30 回 こわすと だいたい 1/3（3〜20 こ）', () => {
    for (const id of ['leaves', 'grass', 'flower_y'] as const) {
      const n = breakMany(id, 30);
      expect(n, id).toBeGreaterThanOrEqual(3);
      expect(n, id).toBeLessThanOrEqual(20);
    }
  });
  it('いしからは でない', () => {
    expect(breakMany('stone', 15)).toBe(0);
  });
});

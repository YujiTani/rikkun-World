import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, TargetInfo, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import { lanternSupported, torchSupported } from './digCore';
import { previewRightClick } from './rightClick';

/**
 * ITEM-FX-1: AC1（ちょうちんの置き方・落ちる）・AC4・AC5・AC18（こわすと同じアイテム）・
 * AC6/AC8 の右クリックの種類（sleep・kite）。約束は docs/tickets/ITEM-FX-1-contract.md。
 */

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
    return b !== 'outside' && b !== 'air' && b !== 'water' && b !== 'torch' && b !== 'lantern';
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

describe('ちょうちんの支え（AC1）', () => {
  it('lanternSupported: 下・横・上（天井）のどれかが固ければ true。たいまつは上だけでは置けない', () => {
    const w = new FakeWorld();
    expect(lanternSupported(w, 5, 5, 5)).toBe(false);
    w.setBlock(5, 4, 5, 'stone');
    expect(lanternSupported(w, 5, 5, 5)).toBe(true);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]] as const) {
      const v = new FakeWorld();
      v.setBlock(5 + dx, 5 + dy, 5 + dz, 'stone');
      expect(lanternSupported(v, 5, 5, 5), `${dx},${dy},${dz}`).toBe(true);
    }
    const up = new FakeWorld();
    up.setBlock(5, 6, 5, 'stone');
    expect(lanternSupported(up, 5, 5, 5)).toBe(true);
    expect(torchSupported(up, 5, 5, 5)).toBe(false);
  });
  it('天井の下の面をねらって右クリックすると、ちょうちんが置ける（1 つへる）', () => {
    const r = new Rig();
    r.world.setBlock(2, 12, 6, 'stone'); // 頭の上の天井
    r.player.pitchDeg = 89; // 真上を向く
    r.hold('lantern', 2);
    expect(r.dig.target()?.block).toEqual({ x: 2, y: 12, z: 6 });
    r.rightClick();
    expect(r.world.getBlock(2, 11, 6)).toBe('lantern');
    expect(r.inv.count('lantern')).toBe(1);
  });
  it('天井にぶらさがったちょうちんは、天井をこわすと落ちて持ち物に戻る。ほかの支えがあればそのまま', () => {
    const r = new Rig();
    r.world.setBlock(4, 10, 6, 'dirt'); // ねらうブロック（ちょうちんの上の支え）
    r.world.setBlock(4, 9, 6, 'lantern');
    r.world.setBlock(4, 8, 6, 'air'); // 下の床をぬいて、上の支えだけにする
    r.step();
    r.breakAimed();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.world.getBlock(4, 9, 6)).toBe('air');
    expect(r.inv.count('lantern')).toBe(1);

    const q = new Rig();
    q.world.setBlock(4, 10, 6, 'dirt');
    q.world.setBlock(4, 9, 6, 'lantern');
    q.world.setBlock(4, 8, 6, 'air');
    q.world.setBlock(5, 9, 6, 'stone'); // 横にも支え
    q.step();
    q.breakAimed();
    expect(q.world.getBlock(4, 9, 6)).toBe('lantern');
    expect(q.inv.count('lantern')).toBe(0);
  });
});

describe('こわすと同じアイテム 1 つに戻る（AC4・AC5・AC18）', () => {
  for (const id of ['lantern', 'futon', 'haniwa'] as const) {
    it(`${id}: こわすと ${id} 1 つ`, () => {
      const r = new Rig();
      r.world.setBlock(4, 10, 6, id);
      r.world.setBlock(4, 9, 6, 'stone'); // 下の支え
      r.step();
      expect(r.dig.target()?.id).toBe(id);
      r.breakAimed();
      expect(r.world.getBlock(4, 10, 6)).toBe('air');
      expect(r.inv.count(id)).toBe(1);
    });
  }
  for (const id of ['futon', 'haniwa'] as const) {
    it(`${id}: 右クリックで 置ける（1 つへる）`, () => {
      const r = new Rig();
      r.world.setBlock(4, 10, 6, 'stone');
      r.hold(id, 2);
      r.rightClick();
      expect(r.world.getBlock(3, 10, 6)).toBe(id);
      expect(r.inv.count(id)).toBe(1);
    });
  }
});

describe('右クリックの種類（AC6・AC8）', () => {
  const target = (id: BlockId): TargetInfo => ({ block: { x: 4, y: 10, z: 6 }, id, face: { x: -1, y: 0, z: 0 }, place: { x: 3, y: 10, z: 6 }, distance: 1.5 });
  const ctx = (held: ItemId | null, t: TargetInfo | null, canPlace = false) => ({
    target: t,
    held,
    isTansu: () => false,
    isFurnace: () => false,
    canEquip: () => false,
    canPlace: () => canPlace,
  });
  it('ふとんをねらって右クリック → sleep（何を持っていても。置くより先）', () => {
    expect(previewRightClick(ctx(null, target('futon' as BlockId)))?.kind).toBe('sleep');
    expect(previewRightClick(ctx('dirt', target('futon' as BlockId), true))?.kind).toBe('sleep');
    expect(previewRightClick(ctx('futon', target('futon' as BlockId), true))?.kind).toBe('sleep');
    expect(previewRightClick(ctx(null, target('stone')))).toBeNull();
  });
  it('たこを持って右クリック → kite（ねらいがなくても。個数は変わらない）', () => {
    expect(previewRightClick(ctx('kite', null))).toEqual({ kind: 'kite', item: 'kite' });
    expect(previewRightClick(ctx('kite', target('stone')))?.kind).toBe('kite');
  });
});

import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { GADGET_TUNING, jumpHeightWith } from '../content/items/gadgetTuning';
import { CRAFT_DEFAULTS } from '../craft/config';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from './PlayerController';
import { createPlayerSettings } from './config';

/** ITEM-FX-1 AC16・AC17: わらじ（足の防具・守り 0・ジャンプが 1.25 → 1.5）。約束は docs/tickets/ITEM-FX-1-contract.md §7 */

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  private blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 64 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? (y <= 6 ? 'sand' : 'air');
  }
  setBlock(x: number, y: number, z: number, id: BlockId) {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

const SPAWN: SpawnPoint = { x: 32.5, y: 12, z: 32.5, yawDeg: 0, pitchDeg: 0 };

function rig() {
  const world = new FakeWorld();
  const actions = new ActionState();
  const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player = new PlayerController(world, actions, look, lock, () => SPAWN);
  world.fill(0, 8, 0, 12, 8, 12, 'stone');
  player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0 });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  step(2);
  /** その場で 1 回ジャンプして、いちばん高くなった高さ（足もと - 9） */
  const jumpPeak = (): number => {
    actions.press('jump');
    step(1);
    actions.release('jump');
    let top = player.state.position.y;
    for (let i = 0; i < 80; i++) {
      step(1);
      top = Math.max(top, player.state.position.y);
    }
    return top - 9;
  };
  return { world, player, actions, step, jumpPeak };
}

describe('ジャンプの高さ（AC17）', () => {
  it('ふだんは 設定の高さ。setJumpHeight で 表の高さになり、null で元に戻る', () => {
    const r = rig();
    const base = createPlayerSettings().jumpHeight;
    expect(r.jumpPeak()).toBeCloseTo(base, 1);
    r.player.setJumpHeight(GADGET_TUNING.waraji.jumpHeight);
    expect(r.jumpPeak()).toBeCloseTo(GADGET_TUNING.waraji.jumpHeight, 1);
    r.player.setJumpHeight(null);
    expect(r.jumpPeak()).toBeCloseTo(base, 1);
  });
  it('わらじなら 1 段（1 ブロック）の上にのれるが、2 段（2 ブロック）の壁は のぼれない', () => {
    const r = rig();
    r.player.setJumpHeight(jumpHeightWith('waraji', createPlayerSettings().jumpHeight));
    // 1 段
    r.world.fill(4, 9, 0, 4, 9, 12, 'stone');
    r.actions.press('moveForward');
    r.actions.press('jump');
    r.step(90);
    expect(r.player.state.position.x).toBeGreaterThan(4); // 1 段をこえた
    expect(r.player.state.position.y).toBeGreaterThanOrEqual(10 - 0.01);
    // 2 段
    const q = rig();
    q.player.setJumpHeight(jumpHeightWith('waraji', createPlayerSettings().jumpHeight));
    q.world.fill(4, 9, 0, 4, 10, 12, 'stone');
    q.actions.press('moveForward');
    q.actions.press('jump');
    q.step(120);
    expect(q.player.state.position.x).toBeLessThan(4);
    expect(q.player.state.position.y).toBeLessThan(10); // 2 段の上にはのれない
  });
});

describe('わらじを足にはく（AC16）', () => {
  it('手に持って着ると legs に入る。すねあてと入れかえになる。守りの合計は 0 のまま', () => {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    inv.setSlot(0, { item: 'waraji', count: 1 });
    inv.select(0);
    expect(armor.tryEquip('waraji')).toBe(true);
    expect(armor.equipped('legs')).toBe('waraji');
    expect(armor.value()).toBe(0);
    expect(jumpHeightWith(armor.equipped('legs'), 1.25)).toBe(GADGET_TUNING.waraji.jumpHeight);
    // すねあて に はきかえる（どれか 1 つ）
    inv.setSlot(0, { item: 'suneate', count: 1 });
    expect(armor.tryEquip('suneate')).toBe(true);
    expect(armor.equipped('legs')).toBe('suneate');
    expect(inv.count('waraji')).toBe(1); // わらじは 持ち物にもどる
    expect(jumpHeightWith(armor.equipped('legs'), 1.25)).toBe(1.25); // 脱ぐと 元に戻る
  });
});

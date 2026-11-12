// HOUSE-2C（#364）手で 置く・ほる の ユニットテスト用の 道具（テスト専用。本番の コードからは 使わない）。
// src/dig/houseBlocks.test.ts の Rig と 同じ 作り。DigSystemImpl の m4（houseLook・placedLooks〔2C の 約束。src/house/recipes/craftKit.ts〕）を わたせる。
import type { BlockId, ItemId, LockStatus, PlayerState, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { doorInfo } from '../world/blocks/houseBlocks';
import { isWater } from '../world/blocks/water';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import type { DigM4Deps } from './digPorts';

export class PlaceWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  blocks = new Map<string, BlockId>();
  /** setBlock の 知らせ（watchBlocks の かわりに テストが つなぐ）。ほる・置く ・テストの setBlock の どれでも 呼ばれる */
  onSet: ((x: number, y: number, z: number, id: BlockId) => void) | null = null;
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (this.getBlock(x, y, z) === 'outside') return false;
    this.blocks.set(`${x},${y},${z}`, id);
    this.onSet?.(x, y, z, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && !isWater(b) && !(b.startsWith('house_door') && doorInfo(b)!.open);
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

/** 石の ゆか（y = 8）の 上に 立つ。m4 に houseLook・placedLooks を わたして 家の 物を 置く・ほる */
export class PlaceRig {
  world: PlaceWorld;
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
  dig: DigSystemImpl;
  constructor(m4: Record<string, unknown> = {}, world: PlaceWorld = new PlaceWorld()) {
    this.world = world;
    this.dig = new DigSystemImpl(this.world, () => this.player, this.actions, this.lock, this.inv, () => 1.62, createDigConfig(), () => 0, null, m4 as DigM4Deps);
    if (this.world.getBlock(0, 8, 0) === 'air') this.world.fill(0, 8, 0, 30, 8, 30, 'stone');
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
  rightClick() {
    this.actions.press('secondary');
    this.step();
    this.actions.release('secondary');
    this.step();
  }
  /** ねらって いる ブロックを ほる（手ぶら） */
  breakAimed() {
    this.inv.clear();
    this.inv.select(0);
    this.actions.press('primary');
    for (let i = 0; i < 900 && !this.dig.state().ready; i++) this.step();
    this.actions.release('primary');
    this.actions.press('primary');
    this.step();
    this.actions.release('primary');
    this.step();
  }
  /** ゆかを ななめ下に ねらう（yaw 0・90・180・270 ＝ プレイヤーが 南・西・北・東 に 立つ）。置く マス */
  aimFloor(yaw: number) {
    this.player.yawDeg = yaw;
    this.player.pitchDeg = -35;
    const spot: Record<number, [number, number]> = { 0: [10.5, 14.5], 90: [6.5, 10.5], 180: [10.5, 6.5], 270: [14.5, 10.5] };
    const [x, z] = spot[yaw]!;
    this.player.position = { x, y: 9, z };
    this.step();
    return this.dig.target()!.place;
  }
  /** (x, y, z) の ブロックを ほる ねらいに する（南 3.5 マスから）。ねらえなければ false */
  aimAt(x: number, y: number, z: number): boolean {
    for (const pitch of [-30, -15, 0, -45, 15]) {
      this.player.position = { x: x + 0.5, y: y, z: z + 3.5 };
      this.player.yawDeg = 0;
      this.player.pitchDeg = pitch;
      this.step();
      const t = this.dig.target();
      if (t && t.block.x === x && t.block.y === y && t.block.z === z) return true;
    }
    return false;
  }
}

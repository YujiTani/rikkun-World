import { describe, expect, it } from 'vitest';
import type { AnimalHintKind, BlockId, LockStatus, PlayerState, VoxelWorld } from '../contracts';
import { ActionState, type Action } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/** LIVE-2.1 AC3: こたつ を 置く と 足もと が たいら に なる（DigSystem の 置く 所）。 */
class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  blocks = new Map<string, BlockId>();
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < 64 && z < 64;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 64, z1: 64 };
  }
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
    return b !== 'outside' && b !== 'air' && b !== 'water' && b !== 'kusa' && b !== 'flower_y';
  }
}

function rig() {
  const world = new FakeWorld();
  const actions = new ActionState();
  const inv = new InventoryImpl();
  const hints: AnimalHintKind[] = [];
  const player: PlayerState = {
    position: { x: 2.5, y: 10, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: -35,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  // 床 = y 9（いし）。足 の 高さ 10。目 の 高さ 11.62 → y 11 の ブロック を ねらう
  for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) for (let y = 0; y <= 9; y++) world.setBlock(x, y, z, 'stone');
  const animals = { emitHint: (h: AnimalHintKind) => void hints.push(h), rayHit: () => null, coopAt: () => null, kitAt: () => null, coops: () => [], kits: () => [], carrying: () => null, throwSpot: () => null } as never;
  const dig = new DigSystemImpl(world, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, { animals });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  const place = () => {
    actions.press('secondary' as Action);
    step(1);
    actions.release('secondary' as Action);
    step(1);
  };
  inv.setSlot(0, { item: 'nukunuku', count: 3 });
  step(1);
  return { world, dig, inv, hints, place, step, player };
}

describe('LIVE-2.1 AC3 こたつ の たいら', () => {
  it('たいら な 所: 置ける・変える 0・すけた 形 に 足もと の 板（床 の 高さ・2×2）', () => {
    const r = rig();
    const g = r.dig.kotatsuGhost()!;
    expect(g.ok).toBe(true);
    expect(g.flat).toMatchObject({ w: 2, d: 2, y: 10 });
    r.place();
    expect(r.inv.slots()[0]!.count).toBe(2);
    expect(r.world.getBlock(g.x, 10, g.z)).toBe('nukunuku');
    expect(r.dig.takeFlattenDust()).toEqual([]);
  });

  it('くぼみ（床 -1 の くうき）は くさ で うまる・すな は 消える・消えた ものは 持ち物 に 入らない・つぶ 1 列 に 1 つ', () => {
    const r = rig();
    // こたつ が 入る 4 マス を しらべる
    const g0 = r.dig.kotatsuGhost()!;
    const cells = [[g0.x, g0.z], [g0.x + 1, g0.z], [g0.x, g0.z + 1], [g0.x + 1, g0.z + 1]] as const;
    r.world.setBlock(cells[1]![0], 9, cells[1]![1], 'air'); // くぼみ（1）
    r.world.setBlock(cells[2]![0], 10, cells[2]![1], 'sand'); // すな
    r.step(1);
    const g = r.dig.kotatsuGhost()!;
    expect(g.ok).toBe(true);
    const before = r.inv.slots().map((s) => s?.count ?? 0).join();
    r.place();
    expect(r.world.getBlock(cells[1]![0], 9, cells[1]![1])).toBe('grass');
    expect(r.world.getBlock(cells[2]![0], 10, cells[2]![1])).toBe('nukunuku_s');
    expect(r.inv.slots().map((s) => s?.count ?? 0).join()).not.toBe(before); // nukunuku は へる
    expect(r.inv.slots().filter((s) => s && s.item !== 'nukunuku')).toHaveLength(0); // すな・つち は 入らない
    expect(r.dig.takeFlattenDust()).toHaveLength(2);
    expect(r.dig.takeFlattenDust()).toEqual([]); // 取ったら 空
  });

  it('かこい（4 むき とも y に レンガ）／深い あな: 置かない・合図 coopNoRoom・nukunuku へらない・ブロック かわらない・ghost は 赤', () => {
    const r = rig();
    for (const [x, z] of [[4, 6], [4, 7], [5, 5], [6, 5], [7, 5], [8, 6], [8, 7], [5, 8], [6, 8], [7, 7], [5, 7], [7, 6], [5, 6], [6, 7]]) r.world.setBlock(x, 10, z, 'brick');
    r.step(1);
    const before = new Map(r.world.blocks);
    expect(r.dig.kotatsuGhost()!.ok).toBe(false);
    r.place();
    expect(r.hints).toContain('coopNoRoom');
    expect(r.inv.slots()[0]!.count).toBe(3);
    expect(r.world.blocks).toEqual(before);

    // 深さ 3 の あな の 上（あな の ふち を ねらって も、4 マス の 床 が 3 つ いじょう ない）は 置けない
    const d = rig();
    for (let x = 3; x <= 8; x++) for (let z = 4; z <= 9; z++) for (const y of [9, 8, 7]) d.world.setBlock(x, y, z, 'air');
    d.step(1);
    expect(d.dig.kotatsuGhost()?.ok ?? false).toBe(false);
  });
});

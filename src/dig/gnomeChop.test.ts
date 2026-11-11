import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, PlayerState } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createToolConfig } from '../tools/config';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import { digTicksWith } from './toolFamily';

/** LEGEND-4 G1・G2・G5（§7.7）: ノームの斧で まるたを 2 マス きる */
function rig(held: 'gnome_axe' | 'iron_axe') {
  const world = new ArrayVoxelWorld({ x: 32, y: 32, z: 32 });
  const actions = new ActionState();
  const inv = new InventoryImpl();
  inv.add(held, 1);
  const player: PlayerState = { position: { x: 5.5, y: 8, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const tools = createToolConfig();
  const dig = new DigSystemImpl(world, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0);
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  /** ひびが MAX に なるまで 押しつづけ、押しなおして こわす（DigSystem.test の repress と 同じ） */
  const cut = () => {
    actions.press('primary');
    step(300);
    actions.release('primary');
    actions.press('primary');
    step(1);
    actions.release('primary');
    step(2);
  };
  return { world, inv, dig, step, cut, tools };
}
const column = (r: ReturnType<typeof rig>, ids: BlockId[]) => ids.forEach((id, i) => r.world.setBlock(8, 9 + i, 5, id));

describe('G1 まるた 3 つの 下から きる', () => {
  it('下 2 つが 空気・3 つ目は まるたの まま・もちものの まるたは てつの おのの 2 倍', () => {
    const g = rig('gnome_axe');
    column(g, ['log', 'log', 'log']);
    g.step(1);
    g.cut();
    expect(g.world.getBlock(8, 9, 5)).toBe('air');
    expect(g.world.getBlock(8, 10, 5)).toBe('air');
    expect(g.world.getBlock(8, 11, 5)).toBe('log');
    const i = rig('iron_axe');
    column(i, ['log', 'log', 'log']);
    i.step(1);
    i.cut();
    expect(i.world.getBlock(8, 10, 5)).toBe('log');
    expect(g.inv.count('log')).toBe(i.inv.count('log') * 2);
  });
  it('ほる 時間は てつの おのと 同じ', () => {
    const d = createDigConfig();
    const t = createToolConfig();
    expect(digTicksWith(d, t, 'log', 'gnome_axe')).toBe(digTicksWith(d, t, 'log', 'iron_axe'));
    expect(LEGEND4_TUNING.gnome.chopExtra).toBe(1);
  });
});

describe('G2 真上が まるた でない とき', () => {
  it.each(['leaves', 'stone', 'air'] as BlockId[])('真上が %s なら 上は かわらない', (up) => {
    const g = rig('gnome_axe');
    column(g, ['log', up]);
    g.step(1);
    g.cut();
    expect(g.world.getBlock(8, 9, 5)).toBe('air');
    expect(g.world.getBlock(8, 10, 5)).toBe(up);
  });
  it('てつの おのは 1 マス だけ', () => {
    const i = rig('iron_axe');
    column(i, ['log', 'log']);
    i.step(1);
    i.cut();
    expect(i.world.getBlock(8, 10, 5)).toBe('log');
  });
});

describe('G5 たいきゅう（ほる 分）', () => {
  it('2 マス きれた 1 回の へり方は てつの おので 1 マス きった ときと 同じ', () => {
    const g = rig('gnome_axe');
    column(g, ['log', 'log']);
    g.step(1);
    const before = g.inv.held()?.wear ?? 0;
    g.cut();
    const i = rig('iron_axe');
    column(i, ['log']);
    i.step(1);
    i.cut();
    expect(g.inv.held()?.wear ?? 0).toBe(i.inv.held()?.wear ?? 0);
    expect(before).toBe(0);
  });
});

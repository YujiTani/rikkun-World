import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { tetherOf } from '../world/blocks/ropeTether';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from './PlayerController';

/** ROPE-1 版 3（つなぎ・AC26〜AC29）: たいらで くいに つなぐ → 長さより 先へ 行けない・がけから 落ちると ぶら下がる・スペースで のぼる・ダメージ なし */

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
    return b !== 'outside' && b !== 'air' && b !== 'water' && b !== 'rope' && b !== 'rope_coil';
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

const SPAWN: SpawnPoint = { x: 32.5, y: 12, z: 32.5, yawDeg: 0, pitchDeg: 0 };

/** 台地 x=0〜10・y=7〜30（上は y=31）。くい (8,31,5)。x=11 から 先は がけ（床は y=6） */
function rig() {
  const world = new FakeWorld();
  const actions = new ActionState();
  const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player = new PlayerController(world, actions, look, lock, () => SPAWN);
  world.fill(0, 7, 0, 10, 30, 63, 'sand');
  world.setBlock(8, 31, 5, 'rope_stake');
  tetherOf(world).tie({ x: 8, y: 31, z: 5 });
  player.set({ position: { x: 8.5, y: 31, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  return { world, player, actions, step };
}

describe('つなぎ（ROPE-1 版 5）', () => {
  it('たいらでは くいから 半径 5 マスより 先へ 行けない。つないで いても スペースで ふつうに ジャンプ', () => {
    const { player, actions, step } = rig();
    player.set({ yawDeg: 180 }); // +z へ
    actions.press('moveForward');
    step(600);
    expect(player.state.position.z).toBeGreaterThan(5.5 + 4.5);
    expect(player.state.position.z).toBeLessThan(5.5 + 5.05);
    expect(player.state.onGround).toBe(true);
    actions.release('moveForward');
    actions.press('jump');
    step(8);
    expect(player.state.position.y).toBeGreaterThan(31.3);
  });

  /** がけへ 歩いて 落ちる（ダメージを 数える）。かえすのは 落ちて いる 間の y の 記録 */
  function fallOff() {
    const rig0 = rig();
    const { player, actions, step } = rig0;
    const combat = new PlayerCombatImpl({
      world: rig0.world,
      player: { get: () => player.state, set: (v: never) => player.set(v) },
      inventory: new InventoryImpl(),
      yokai: () => ({ occupies: () => false }) as never,
      spawn: () => SPAWN,
      noFall: () => player.onRope(),
    } as never);
    const hp0 = combat.hp();
    const ys: number[] = [];
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        step();
        combat.update();
        ys.push(player.state.position.y);
      }
    };
    player.set({ yawDeg: 90 }); // +x へ（がけ）
    actions.press('moveForward');
    tick(70);
    actions.release('moveForward');
    return { ...rig0, combat, hp0, ys, tick };
  }

  it('がけから 落ちると ゴムで 上下に ゆれて（びよんびよん）、おさまると ぶら下がって とまる。ダメージ 0', () => {
    const r = fallOff();
    r.tick(300);
    // ゆれ: いちばん 低い 所の あと、また 上がって また 下がる
    const low = Math.min(...r.ys);
    const iLow = r.ys.indexOf(low);
    const after = r.ys.slice(iLow);
    expect(Math.max(...after) - low).toBeGreaterThan(0.3);
    expect(r.player.tetherBody.hanging).toBe(true);
    const hangY = r.player.state.position.y;
    expect(hangY).toBeGreaterThan(24); // 床（y=7）まで 落ちて いない。くいから 約 5 マス
    expect(hangY).toBeLessThan(29);
    r.step(60);
    expect(Math.abs(r.player.state.position.y - hangY)).toBeLessThan(0.05);
    expect(r.combat.hp()).toBe(r.hp0);
  });

  it('ぶら下がり: Shift+スペース = のぼる・Shift+C = おりる。スペース だけ・シフト だけ では うごかない。くいの 高さより 上へは 行かない', () => {
    const r = fallOff();
    r.tick(300);
    const hangY = r.player.state.position.y;
    r.actions.press('jump');
    r.tick(30);
    expect(Math.abs(r.player.state.position.y - hangY)).toBeLessThan(0.05);
    r.actions.release('jump');
    r.actions.press('run');
    r.tick(30);
    expect(Math.abs(r.player.state.position.y - hangY)).toBeLessThan(0.05);
    r.actions.press('jump');
    r.tick(30);
    expect(r.player.state.position.y).toBeGreaterThan(hangY + 1);
    r.tick(300); // ずっと 押して いても
    expect(r.player.state.position.y).toBeLessThanOrEqual(31 + 1e-6); // くい (y=31) の 足もとの 高さまで
    r.actions.release('jump');
    const topY = r.player.state.position.y;
    r.actions.press('ropeDown');
    r.tick(30);
    expect(r.player.state.position.y).toBeLessThan(topY - 1);
    expect(r.combat.hp()).toBe(r.hp0);
  });

  it('くいが なくなると つなぎは きれる', () => {
    const { world, player, step } = rig();
    world.setBlock(8, 31, 5, 'air');
    step(2);
    expect(tetherOf(world).anchor).toBeNull();
    expect(player.onRope()).toBe(false);
  });
});

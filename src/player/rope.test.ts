import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { ROPE_TUNING } from '../world/blocks/rope';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { createCombatConfig, fallDamage } from '../combat/config';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from './PlayerController';

/** ROPE-1 AC8〜AC10・AC19・AC20（docs/design/ROPE-1.md 版 3）: ロープに つかまって のぼる・おりる・とまる・落下ダメージ */

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

/** x=5, z=5 の 列に 床（y=6 の すな）の 上 y=7〜20 の ロープ（いちばん 下は ロープだまり） */
function rig() {
  const world = new FakeWorld();
  const actions = new ActionState();
  const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player = new PlayerController(world, actions, look, lock, () => SPAWN);
  for (let y = 8; y <= 20; y++) world.setBlock(5, y, 5, 'rope');
  world.setBlock(5, 7, 5, 'rope_coil');
  player.set({ position: { x: 5.5, y: 12, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  return { world, player, actions, step };
}

describe('ロープに つかまる（AC8〜AC10。版 3: スペース = のぼる・シフト = おりる）', () => {
  it('なにも おさないと 落ちずに その 高さで とまる', () => {
    const r = rig();
    r.step(60);
    expect(r.player.onRope()).toBe(true);
    expect(r.player.state.position.y).toBeCloseTo(12, 5);
  });
  it('スペース（jump）を おしつづけると 1 秒で climbSpeed マス のぼる', () => {
    const r = rig();
    r.actions.press('jump');
    r.step(60);
    expect(r.player.state.position.y).toBeCloseTo(12 + ROPE_TUNING.climbSpeed, 3);
  });
  it('シフト（run）を おしつづけると おりて、ロープだまり（床の 上）に たつ。よこには 動かない', () => {
    const r = rig();
    r.actions.press('run');
    r.step(60);
    expect(r.player.state.position.y).toBeCloseTo(12 - ROPE_TUNING.climbSpeed, 3);
    r.step(120);
    expect(r.player.state.position.y).toBeCloseTo(7, 3);
    expect(r.player.state.position.x).toBeCloseTo(5.5, 5);
    expect(r.player.state.position.z).toBeCloseTo(5.5, 5);
  });
  it('まえ・うしろは もう のぼり おり しない（高さは そのまま）', () => {
    const r = rig();
    r.actions.press('moveForward');
    r.step(10);
    expect(r.player.state.position.y).toBeCloseTo(12, 5);
  });
  it('ロープの ない 所では シフトは ふつうに 走る・スペースは ふつうに ジャンプ', () => {
    const r = rig();
    r.player.set({ position: { x: 8.5, y: 7, z: 8.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
    r.step(5);
    r.actions.press('run');
    r.actions.press('moveForward');
    r.step(30);
    expect(r.player.state.running).toBe(true);
    r.actions.release('run');
    r.actions.release('moveForward');
    r.actions.press('jump');
    r.step(5);
    expect(r.player.state.position.y).toBeGreaterThan(7.3);
  });
  it('ロープの ない 所では ふつうに 落ちる', () => {
    const r = rig();
    r.player.set({ position: { x: 8.5, y: 12, z: 8.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
    r.step(60);
    expect(r.player.onRope()).toBe(false);
    expect(r.player.state.position.y).toBeCloseTo(7, 3);
  });
});

describe('落下ダメージ（AC19・AC20）', () => {
  /** controller と combat を ゲームと 同じ 順で 回す（noFall = ロープに つかまって いる 間） */
  function withCombat(guard = true) {
    const r = rig();
    for (let y = 21; y <= 30; y++) r.world.setBlock(5, y, 5, 'rope');
    r.player.set({ position: { x: 5.5, y: 30, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
    const combat = new PlayerCombatImpl({
      world: r.world,
      player: { get: () => r.player.state, set: (v: never) => r.player.set(v) },
      inventory: new InventoryImpl(),
      yokai: () => ({ occupies: () => false }) as never,
      spawn: () => SPAWN,
      noFall: () => guard && r.player.onRope(),
    } as never);
    const tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        r.step();
        combat.update();
      }
    };
    return { ...r, combat, tick };
  }
  it('シフトで 23 マス おりて ロープだまりに ついても ダメージ 0', () => {
    const r = withCombat();
    const hp = r.combat.hp();
    r.actions.press('run');
    r.tick(60 * 9);
    expect(r.player.state.position.y).toBeCloseTo(7, 3);
    expect(r.combat.hp()).toBe(hp);
  });
  it('（くらべ）ロープの まもりが なければ 同じ おり方でも ダメージが 出る', () => {
    const r = withCombat(false);
    const hp = r.combat.hp();
    r.actions.press('run');
    r.tick(60 * 9);
    expect(r.combat.hp()).toBeLessThan(hp);
  });
  it('とちゅうで ロープから はなれて 落ちたら、はなれた 高さから だけ 数える（ためた 高さは つかわない）', () => {
    const r = withCombat();
    r.actions.press('run');
    r.tick(60 * 4); // 30 → 18 くらい
    r.actions.release('run');
    const leaveY = r.player.state.position.y;
    const hp = r.combat.hp();
    r.actions.press('moveRight'); // よこへ はなれる
    r.tick(120);
    expect(r.player.onRope()).toBe(false);
    expect(r.player.state.position.y).toBeCloseTo(7, 3);
    const cfg = createCombatConfig();
    expect(hp - r.combat.hp()).toBeLessThanOrEqual(fallDamage(leaveY - 7 + 1, cfg.safeFallHeight, cfg.fallDamagePerBlock));
    expect(hp - r.combat.hp()).toBeLessThan(fallDamage(30 - 7, cfg.safeFallHeight, cfg.fallDamagePerBlock));
  });
});

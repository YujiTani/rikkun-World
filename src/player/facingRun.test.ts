import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, VoxelWorld } from '../contracts';
import { ActionState, type Action } from '../input/actions';
import { PlayerController, turnToward } from './PlayerController';
import { createPlayerHook } from './hook';

/** 仮の世界: y<=8 は いし（床の上面 y=9）。fill で足す */
class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  private blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 64 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? (y <= 6 ? 'sand' : 'air');
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  dx = 0;
  look: LookSource = {
    consume: () => {
      const r = { dx: this.dx, dy: 0 };
      this.dx = 0;
      return r;
    },
  };
  lock: LockStatus = {
    locked: () => true,
    overlayVisible: () => false,
    realtimeAllowed: () => true,
    playInputEnabled: () => true,
  };
  player = new PlayerController(this.world, this.actions, this.look, this.lock, () => ({
    x: 32.5,
    y: 12,
    z: 32.5,
    yawDeg: 0,
    pitchDeg: 0,
  }));
  get s() {
    return this.player.state;
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.player.update(1 / 60);
      this.actions.endFrame();
    }
  }
  press(...a: Action[]) {
    a.forEach((x) => this.actions.press(x));
  }
  release(...a: Action[]) {
    a.forEach((x) => this.actions.release(x));
  }
  floor(pos = { x: 2.5, y: 9, z: 6.5 }, yaw = 0) {
    this.world.fill(0, 8, 0, 12, 8, 12, 'stone');
    this.player.set({ position: pos, velocity: { x: 0, y: 0, z: 0 }, yawDeg: yaw, pitchDeg: 0 });
    this.step(2);
  }
}

const speed = (r: Rig) => Math.hypot(r.s.velocity.x, r.s.velocity.z);

describe('turnToward', () => {
  it('近いほうへ。ちょうど 180 度は 時計まわり', () => {
    expect(turnToward(350, 0, 12)).toBeCloseTo(0, 9);
    expect(turnToward(340, 0, 12)).toBeCloseTo(352, 9);
    expect(turnToward(10, 0, 12)).toBeCloseTo(0, 9);
    expect(turnToward(0, 180, 12)).toBeCloseTo(12, 9);
    expect(turnToward(90, 0, 12)).toBeCloseTo(78, 9);
    expect(turnToward(0, 270, 12)).toBeCloseTo(348, 9);
  });
});

describe('CHAR-1 向き（facing）', () => {
  it('AC9: yaw 0・facing 0 で D: 1 ステップで 12、8 ステップ以内に 90 で止まる', () => {
    const r = new Rig();
    r.floor();
    r.player.set({ facingDeg: 0 });
    r.press('moveRight');
    r.step(1);
    expect(r.s.facingDeg).toBeCloseTo(12, 5);
    r.step(7);
    expect(r.s.facingDeg).toBeCloseTo(90, 5);
    r.release('moveRight');
    r.step(60);
    expect(r.s.facingDeg).toBeCloseTo(90, 5);
  });

  it('AC10: S で 15 ステップ以内に 180。W＋D で 45。止まっているとき マウスでは facing は変わらない', () => {
    const r = new Rig();
    r.floor();
    r.player.set({ facingDeg: 0 });
    r.press('moveBack');
    r.step(15);
    expect(r.s.facingDeg).toBeCloseTo(180, 5);
    r.release('moveBack');
    r.player.set({ facingDeg: 0 });
    r.press('moveForward', 'moveRight');
    r.step(5);
    expect(r.s.facingDeg).toBeCloseTo(45, 5);
    r.release('moveForward', 'moveRight');
    r.step(40);
    r.dx = 100;
    r.step(1);
    expect(r.s.yawDeg).toBeCloseTo(12, 5);
    expect(r.s.facingDeg).toBeCloseTo(45, 5);
  });

  it('壁を押していても 入力の向きへ向く', () => {
    const r = new Rig();
    r.floor({ x: 2.5, y: 9, z: 6.5 });
    r.world.fill(0, 9, 0, 12, 12, 4, 'stone'); // 北に壁
    r.player.set({ facingDeg: 90 });
    r.press('moveForward');
    r.step(10);
    expect(r.s.facingDeg).toBeCloseTo(0, 5);
  });

  it('AC11: 左クリックで カメラの yaw へ。押したまま S でも変わらない。はなして 30 ステップ保つ', () => {
    const r = new Rig();
    r.floor();
    r.player.set({ facingDeg: 90 });
    r.press('primary');
    r.step(8);
    expect(r.s.facingDeg).toBeCloseTo(0, 5);
    r.press('moveBack');
    r.step(5);
    expect(r.s.facingDeg).toBeCloseTo(0, 5);
    r.release('primary');
    r.step(30);
    expect(r.s.facingDeg).toBeCloseTo(0, 5);
    r.step(1);
    expect(r.s.facingDeg).toBeCloseTo(12, 5); // S の向き（180）へ回り始める
  });

  it('AC12: Q（すてる）のあとも 同じ', () => {
    const r = new Rig();
    r.floor();
    r.player.set({ facingDeg: 90 });
    r.press('drop');
    r.step(1);
    r.release('drop');
    r.press('moveRight');
    r.step(7);
    expect(r.s.facingDeg).toBeCloseTo(0, 5);
  });

  it('スタート・やり直しは yaw と同じ向き', () => {
    const r = new Rig();
    r.player.set({ facingDeg: 123 });
    r.player.respawn();
    expect(r.s.facingDeg).toBe(r.s.yawDeg);
  });

  it('hook: facing を読める・置ける', () => {
    const r = new Rig();
    const hook = createPlayerHook(r.player) as unknown as {
      get: () => { facing: number };
      set: (v: { facing: number }) => void;
    };
    hook.set({ facing: 725 });
    expect(hook.get().facing).toBeCloseTo(5, 5);
  });
});

describe('CHAR-1 走る', () => {
  it('AC22: シフト＋W で 20 ステップ以内に 5.6、running が立つ。はなすと歩く速さへ', () => {
    const r = new Rig();
    r.floor();
    r.press('run', 'moveForward');
    r.step(20);
    expect(speed(r)).toBeCloseTo(5.6, 2);
    expect(r.s.running).toBe(true);
    r.release('run');
    r.step(20);
    expect(speed(r)).toBeCloseTo(4.0, 2);
    expect(r.s.running).toBe(false);
  });

  it('歩く入力がなければ running ではない', () => {
    const r = new Rig();
    r.floor();
    r.press('run');
    r.step(5);
    expect(r.s.running).toBe(false);
  });

  it('水の中は 半分（2.8）', () => {
    const r = new Rig();
    r.floor();
    r.world.fill(0, 9, 0, 12, 9, 12, 'water');
    r.player.set({ position: { x: 6.5, y: 9, z: 6.5 } });
    r.press('run', 'moveForward');
    r.step(30);
    expect(r.s.inWater).toBe(true);
    expect(speed(r)).toBeCloseTo(2.8, 2);
  });

  it('刀・弓の倍率は かけ算で効く', () => {
    const r = new Rig();
    r.floor();
    r.player.motion.speedMul = 0.5;
    r.press('run', 'moveForward');
    r.step(30);
    expect(speed(r)).toBeCloseTo(2.8, 2);
  });

  it('ジャンプの高さは 走っても 今のまま（1.25）', () => {
    const r = new Rig();
    r.floor();
    r.press('run', 'jump');
    let maxY = 0;
    for (let i = 0; i < 60; i++) {
      r.step(1);
      maxY = Math.max(maxY, r.s.position.y);
    }
    expect(maxY - 9).toBeGreaterThan(1.2);
    expect(maxY - 9).toBeLessThan(1.3);
  });
});

import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { ActionState, type Action } from '../input/actions';
import { PlayerController } from './PlayerController';
import { createPlayerHook } from './hook';

/** 仮の世界: y<=6 は すな、y=7 は みず、あとは くうき（M1-01 4-11 のテスト場所と同じ） */
class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  private blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 64 || z >= 64) return 'outside';
    const b = this.blocks.get(`${x},${y},${z}`);
    if (b) return b;
    return y <= 6 ? 'sand' : y === 7 ? 'water' : 'air';
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

const SPAWN: SpawnPoint = { x: 32.5, y: 12, z: 32.5, yawDeg: 0, pitchDeg: 0 };

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  locked = true;
  dx = 0;
  dy = 0;
  look: LookSource = {
    consume: () => {
      const r = this.locked ? { dx: this.dx, dy: this.dy } : { dx: 0, dy: 0 };
      this.dx = this.dy = 0;
      return r;
    },
  };
  lock: LockStatus = {
    locked: () => this.locked,
    overlayVisible: () => !this.locked,
    realtimeAllowed: () => this.locked,
    playInputEnabled: () => this.locked,
  };
  player = new PlayerController(this.world, this.actions, this.look, this.lock, () => SPAWN);

  get s() {
    return this.player.state;
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.player.update(1 / 60);
      this.actions.endFrame();
    }
  }
  mouse(dx: number, dy: number) {
    this.dx += dx;
    this.dy += dy;
  }
  press(...a: Action[]) {
    a.forEach((x) => this.actions.press(x));
  }
  release(...a: Action[]) {
    a.forEach((x) => this.actions.release(x));
  }
  /** 基本の床（上面 y=9）に P を置く */
  floor(pos = { x: 2.5, y: 9, z: 6.5 }, yaw = 90) {
    this.world.fill(0, 8, 0, 12, 8, 12, 'stone');
    this.player.set({ position: pos, velocity: { x: 0, y: 0, z: 0 }, yawDeg: yaw, pitchDeg: 0 });
    this.step(2);
  }
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe('歩く・ジャンプ', () => {
  it('AC1: 60 ステップで 3.75〜4.05 進む', () => {
    const r = new Rig();
    r.floor();
    const x0 = r.s.position.x;
    r.press('moveForward');
    r.step(60);
    const d = r.s.position.x - x0;
    expect(d).toBeGreaterThan(3.75);
    expect(d).toBeLessThan(4.05);
    expect(near(r.s.position.z, 6.5, 0.01)).toBe(true);
    expect(near(r.s.position.y, 9, 0.01)).toBe(true);
  });

  it('AC2: はなすと 7 ステップ以内に止まり、0.3 以下しか進まない', () => {
    const r = new Rig();
    r.floor();
    r.press('moveForward');
    r.step(60);
    r.release('moveForward');
    const x0 = r.s.position.x;
    r.step(7);
    expect(Math.hypot(r.s.velocity.x, r.s.velocity.z)).toBe(0);
    expect(r.s.position.x - x0).toBeLessThanOrEqual(0.3);
  });

  it('AC3: ななめでも速くならない。前後同時は止まる', () => {
    const r = new Rig();
    r.floor();
    r.press('moveForward', 'moveRight');
    r.step(60);
    const d = Math.hypot(r.s.position.x - 2.5, r.s.position.z - 6.5);
    expect(d).toBeGreaterThan(3.75);
    expect(d).toBeLessThan(4.05);

    const r2 = new Rig();
    r2.floor();
    r2.press('moveForward', 'moveBack');
    r2.step(60);
    expect(Math.abs(r2.s.position.x - 2.5)).toBeLessThanOrEqual(0.05);
  });

  it('AC4: 右に 90 度向きを変えると南へ進む', () => {
    const r = new Rig();
    r.floor();
    r.mouse(750, 0);
    r.press('moveForward');
    r.step(30);
    expect(r.s.yawDeg).toBeCloseTo(180, 3);
    const dx = r.s.position.x - 2.5;
    const dz = r.s.position.z - 6.5;
    expect(dz).toBeGreaterThan(0);
    expect(Math.abs(Math.atan2(dx, dz)) * (180 / Math.PI)).toBeLessThan(5);
  });

  it('AC5: ジャンプの高さ 1.25・36 ステップ目に着地', () => {
    const r = new Rig();
    r.floor();
    r.press('jump');
    r.step(1);
    r.release('jump');
    let maxY = r.s.position.y;
    let landed = 0;
    for (let i = 2; i <= 60 && !landed; i++) {
      r.step(1);
      maxY = Math.max(maxY, r.s.position.y);
      if (r.s.onGround) landed = i;
    }
    expect(maxY - 9).toBeGreaterThan(1.2);
    expect(maxY - 9).toBeLessThan(1.3);
    expect(landed).toBeGreaterThanOrEqual(34);
    expect(landed).toBeLessThanOrEqual(38);
  });

  it('AC6: 空中では跳び直さない', () => {
    const r = new Rig();
    r.floor();
    r.press('jump');
    r.step(1);
    r.release('jump');
    r.step(5);
    const vy = r.s.velocity.y;
    r.press('jump');
    r.step(1);
    expect(r.s.velocity.y).toBeLessThan(vy);
  });

  it('AC7: 押しっぱなしで 180 ステップに 4 回以上跳ぶ', () => {
    const r = new Rig();
    r.floor();
    r.press('jump');
    let jumps = 0;
    let prevGround = true;
    for (let i = 0; i < 180; i++) {
      r.step(1);
      if (prevGround && !r.s.onGround) jumps++;
      prevGround = r.s.onGround;
    }
    expect(jumps).toBeGreaterThanOrEqual(4);
  });
});

describe('段・壁・天井', () => {
  it('AC8: autoJump オフ・段 1 には乗らず x=2.70 で止まる', () => {
    const r = new Rig();
    r.floor();
    r.world.fill(3, 9, 5, 10, 9, 7, 'stone');
    r.player.settings.autoJump = false;
    r.press('moveForward');
    r.step(120);
    expect(near(r.s.position.y, 9, 0.01)).toBe(true);
    expect(near(r.s.position.x, 2.7, 0.01)).toBe(true);
  });

  it('AC9: autoJump オフ・手動ジャンプで段に乗る', () => {
    const r = new Rig();
    r.floor();
    r.world.fill(3, 9, 5, 10, 9, 7, 'stone');
    r.player.settings.autoJump = false;
    r.press('moveForward', 'jump');
    r.step(1);
    r.release('jump');
    r.step(59);
    expect(near(r.s.position.y, 10, 0.01)).toBe(true);
    expect(r.s.onGround).toBe(true);
  });

  it('AC10: autoJump オンで段に乗る', () => {
    const r = new Rig();
    r.floor();
    r.world.fill(3, 9, 5, 10, 9, 7, 'stone');
    r.press('moveForward');
    r.step(60);
    expect(near(r.s.position.y, 10, 0.01)).toBe(true);
    expect(r.s.onGround).toBe(true);
  });

  it('AC11/12: 壁 2 は越えず、めりこまない', () => {
    for (const auto of [true, false]) {
      const r = new Rig();
      r.floor();
      r.world.fill(3, 9, 5, 10, 10, 7, 'stone');
      r.player.settings.autoJump = auto;
      r.press('moveForward', 'jump');
      for (let i = 0; i < 240; i++) {
        r.step(1);
        expect(r.s.position.x).toBeLessThanOrEqual(2.71);
        const { x, y, z } = r.s.position;
        for (let bx = Math.floor(x - 0.3 + 1e-4); bx <= Math.floor(x + 0.3 - 1e-4); bx++)
          for (let by = Math.floor(y + 1e-4); by <= Math.floor(y + 1.8 - 1e-4); by++)
            for (let bz = Math.floor(z - 0.3 + 1e-4); bz <= Math.floor(z + 0.3 - 1e-4); bz++)
              expect(r.world.isSolid(bx, by, bz)).toBe(false);
      }
    }
  });

  it('AC13: ななめの壁にそってすべる', () => {
    const r = new Rig();
    r.floor();
    r.world.fill(4, 9, 0, 4, 10, 12, 'stone');
    r.player.set({ yawDeg: 45 });
    r.press('moveForward');
    r.step(60);
    expect(r.s.position.x).toBeLessThanOrEqual(3.71);
    expect(6.5 - r.s.position.z).toBeGreaterThanOrEqual(2.0);
  });

  it('AC14: 天井に頭をぶつける', () => {
    const r = new Rig();
    r.floor();
    r.world.fill(1, 11, 5, 4, 11, 8, 'stone');
    r.press('jump');
    r.step(1);
    r.release('jump');
    let landed = 0;
    for (let i = 2; i <= 40; i++) {
      r.step(1);
      expect(r.s.position.y).toBeLessThanOrEqual(9.21);
      if (r.s.onGround && !landed) landed = i;
    }
    expect(landed).toBeGreaterThan(0);
    expect(landed).toBeLessThanOrEqual(21);
  });

  it('AC15: 高さ 2 のすき間は通れ、高さ 1 は通れない', () => {
    const a = new Rig();
    a.floor();
    a.world.fill(5, 9, 0, 5, 11, 12, 'stone');
    a.world.setBlock(5, 9, 6, 'air');
    a.world.setBlock(5, 10, 6, 'air');
    a.press('moveForward');
    a.step(120);
    expect(a.s.position.x).toBeGreaterThanOrEqual(6.4);

    const b = new Rig();
    b.floor();
    b.world.fill(5, 9, 0, 5, 11, 12, 'stone');
    b.world.setBlock(5, 9, 6, 'air');
    b.player.settings.autoJump = false;
    b.press('moveForward');
    b.step(120);
    expect(b.s.position.x).toBeLessThanOrEqual(4.71);
  });

  it('AC16: 高さ 20 から落ちても 30 を超えず、9.00 に着地', () => {
    const r = new Rig();
    r.floor({ x: 6.5, y: 29, z: 6.5 });
    r.player.set({ position: { x: 6.5, y: 29, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
    let steps = 0;
    for (let i = 1; i <= 120; i++) {
      r.step(1);
      expect(r.s.velocity.y).toBeGreaterThanOrEqual(-30.0000001);
      if (r.s.onGround) {
        steps = i;
        break;
      }
    }
    expect(steps).toBe(73);
    expect(near(r.s.position.y, 9, 0.01)).toBe(true);
  });
});

describe('世界の端', () => {
  it('AC17: 西・北・北西のすみで 0.30 に止まる', () => {
    const r = new Rig();
    r.floor({ x: 2.5, y: 9, z: 6.5 }, 270);
    r.press('moveForward');
    for (let i = 0; i < 120; i++) {
      r.step(1);
      expect(r.s.position.x).toBeGreaterThanOrEqual(0.29);
    }
    expect(near(r.s.position.x, 0.3, 0.01)).toBe(true);

    const n = new Rig();
    n.floor({ x: 6.5, y: 9, z: 2.5 }, 0);
    n.press('moveForward');
    n.step(120);
    expect(near(n.s.position.z, 0.3, 0.01)).toBe(true);

    const c = new Rig();
    c.floor(undefined, 315);
    c.press('moveForward');
    c.step(240);
    expect(near(c.s.position.x, 0.3, 0.01)).toBe(true);
    expect(near(c.s.position.z, 0.3, 0.01)).toBe(true);
  });

  it('東と南の端は size-0.3', () => {
    const r = new Rig();
    r.player.set({ position: { x: 60, y: 8, z: 60 }, yawDeg: 90 });
    r.world.fill(50, 7, 50, 63, 7, 63, 'stone');
    r.press('moveForward');
    r.step(120);
    expect(near(r.s.position.x, 63.7, 0.01)).toBe(true);
  });
});

describe('水の中', () => {
  it('AC18: 水の中は歩く速さ×0.5・ジャンプの高さ×0.6', () => {
    const r = new Rig();
    r.player.set({ position: { x: 2.5, y: 7, z: 6.5 }, yawDeg: 90 });
    r.step(60);
    expect(near(r.s.position.y, 7, 0.01)).toBe(true);
    expect(r.s.onGround).toBe(true);
    expect(r.s.inWater).toBe(true);
    r.press('moveForward');
    r.step(60);
    const d = r.s.position.x - 2.5;
    expect(d).toBeGreaterThan(1.85);
    expect(d).toBeLessThan(2.05);

    const j = new Rig();
    j.player.set({ position: { x: 2.5, y: 7, z: 6.5 } });
    j.step(2);
    j.press('jump');
    j.step(1);
    j.release('jump');
    let maxY = 0;
    let landed = 0;
    for (let i = 2; i <= 60 && !landed; i++) {
      j.step(1);
      maxY = Math.max(maxY, j.s.position.y);
      if (j.s.onGround) landed = i;
    }
    expect(maxY - 7).toBeGreaterThan(0.72);
    expect(maxY - 7).toBeLessThan(0.78);
    expect(landed).toBeGreaterThanOrEqual(26);
    expect(landed).toBeLessThanOrEqual(31);
  });

  it('AC19: 浜の段（オート／手動）', () => {
    for (const auto of [true, false]) {
      const r = new Rig();
      r.world.fill(8, 7, 0, 12, 7, 12, 'sand');
      r.player.settings.autoJump = auto;
      r.player.settings.waterJumpMul = 1; // 段の判定だけを見る（水の中のジャンプ ×0.6 では 1 段は登れない）
      r.player.set({ position: { x: 6.5, y: 7, z: 6.5 }, yawDeg: 90 });
      r.step(2);
      r.press('moveForward');
      if (!auto) {
        r.press('jump');
        r.step(1);
        r.release('jump');
        r.step(59);
      } else {
        r.step(60);
      }
      expect(near(r.s.position.y, 8, 0.01)).toBe(true);
      expect(r.s.onGround).toBe(true);
    }
  });
});

describe('向き', () => {
  it('AC20/21/22: yaw・pitch の計算とはんい', () => {
    const r = new Rig();
    const hook = createPlayerHook(r.player) as unknown as {
      get(): { forward: { x: number; z: number }; yaw: number };
      set(v: { yaw?: number; pitch?: number }): void;
    };
    hook.set({ yaw: 0, pitch: 0 });
    expect(hook.get().forward.x).toBeCloseTo(0, 3);
    expect(hook.get().forward.z).toBeCloseTo(-1, 3);
    hook.set({ yaw: 90 });
    expect(hook.get().forward.x).toBeCloseTo(1, 3);
    expect(hook.get().forward.z).toBeCloseTo(0, 3);

    hook.set({ yaw: 0, pitch: 0 });
    r.mouse(100, 0);
    r.step(1);
    expect(r.s.yawDeg).toBeCloseTo(12, 1);
    r.mouse(-200, 0);
    r.step(1);
    expect(r.s.yawDeg).toBeCloseTo(348, 1);
    r.mouse(0, -100);
    r.step(1);
    expect(r.s.pitchDeg).toBeCloseTo(12, 1);
    r.mouse(0, -100000);
    r.step(1);
    expect(r.s.pitchDeg).toBe(89);
    r.mouse(0, 100000);
    r.step(1);
    expect(r.s.pitchDeg).toBe(-89);
  });

  it('上を向いて歩いても飛ばない', () => {
    const r = new Rig();
    r.floor();
    r.player.set({ pitchDeg: 80 });
    r.press('moveForward');
    r.step(30);
    expect(near(r.s.position.y, 9, 0.01)).toBe(true);
  });
});

describe('ロックなし・もどる', () => {
  it('ロックなしでは歩かず、向きも変わらないが、重力は働く', () => {
    const r = new Rig();
    r.floor();
    r.locked = false;
    r.press('moveForward', 'jump');
    r.mouse(100, 100);
    r.step(60);
    expect(near(r.s.position.x, 2.5, 0.01)).toBe(true);
    expect(near(r.s.position.y, 9, 0.01)).toBe(true);
    expect(r.s.yawDeg).toBe(90);

    r.player.set({ position: { x: 2.5, y: 20, z: 6.5 } });
    r.step(60);
    expect(near(r.s.position.y, 9, 0.01)).toBe(true);
  });

  it('y<-10 でスタート地点に戻る（速さ 0・向き北）', () => {
    const r = new Rig();
    r.player.set({ position: { x: 2.5, y: -9.9, z: 2.5 }, velocity: { x: 0, y: -30, z: 0 }, yawDeg: 123 });
    // 床のない穴を作る
    r.world.fill(0, 0, 0, 12, 7, 12, 'air');
    for (let i = 0; i < 20 && r.s.position.y < 0; i++) r.step(1);
    expect(r.s.position).toEqual({ x: 32.5, y: 12, z: 32.5 });
    expect(r.s.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.s.yawDeg).toBe(0);
  });

  it('set は書かなかった項目をそのままにする', () => {
    const r = new Rig();
    r.player.set({ yawDeg: -30, pitchDeg: 200 });
    expect(r.s.yawDeg).toBe(330);
    expect(r.s.pitchDeg).toBe(89);
    expect(r.s.position).toEqual({ x: 32.5, y: 12, z: 32.5 });
  });
});

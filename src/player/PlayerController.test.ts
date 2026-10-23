import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld, YokaiInfo } from '../contracts';
import { ActionState, type Action } from '../input/actions';
import { PlayerController } from './PlayerController';
import { createPlayerHook } from './hook';

/** 仮の世界: y<=6 は すな、y=7 は みず、あとは くうき（M1-01 4-11 のテスト場所と同じ） */
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
  it('AC18: 水の中は歩く速さ×0.5・ジャンプの高さ×0.85', () => {
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
    expect(maxY - 7).toBeGreaterThan(1.03);
    expect(maxY - 7).toBeLessThan(1.09);
    expect(landed).toBeGreaterThanOrEqual(30);
    expect(landed).toBeLessThanOrEqual(35);
  });

  it('AC19: 浜の段（オート／手動）', () => {
    for (const auto of [true, false]) {
      const r = new Rig();
      r.world.fill(8, 7, 0, 12, 7, 12, 'sand');
      r.player.settings.autoJump = auto;
      r.player.set({ position: { x: 7.0, y: 7, z: 6.5 }, yawDeg: 90 }); // 水の中は歩きが半分なので、浜のすぐ手前から
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

describe('CHAR-2: lunge の戻り値・向きの指定・すぐ止まる', () => {
  it('lunge は 実際に動いた量を 返す（ひらけた所は 言われたぶん・かべでは 手前まで）', () => {
    const r = new Rig();
    r.floor({ x: 2.5, y: 9, z: 6.5 }, 90);
    const got = r.player.lunge(0.5, 0);
    expect(got.x).toBeCloseTo(0.5, 9);
    expect(got.z).toBe(0);
    expect(r.s.position.x).toBeCloseTo(3.0, 9);
    r.world.fill(5, 9, 6, 5, 10, 6, 'stone'); // 体の 前ふち 3.3 → かべの 面 x=5 まで 1.7
    const g2 = r.player.lunge(3, 0);
    expect(g2.x).toBeCloseTo(1.7, 6);
    expect(r.s.position.x).toBeCloseTo(4.7, 6);
  });
  it('WEAPON-4: がけ（足場が 2 段 ない所）の 手前で 止まる。1 段 下がる 所と 水は すすむ', () => {
    const r = new Rig();
    r.floor({ x: 2.5, y: 9, z: 6.5 }, 90);
    r.world.fill(5, 7, 0, 12, 8, 12, 'air'); // x >= 5: 足もとの 1 段下・2 段下が くうき
    const got = r.player.lunge(3, 0);
    expect(r.s.position.x).toBeLessThan(5.3 + 1e-6); // 箱の 半分 0.3 までは 足場の 上
    expect(r.s.position.x).toBeGreaterThan(5.0);
    expect(got.x).toBeCloseTo(r.s.position.x - 2.5, 9);
    // 1 段 下がるだけ（y=8 は くうき、y=7 に ブロック）→ 進む
    const r2 = new Rig();
    r2.floor({ x: 2.5, y: 9, z: 6.5 }, 90);
    r2.world.fill(5, 8, 0, 12, 8, 12, 'air');
    r2.world.fill(5, 7, 0, 12, 7, 12, 'stone');
    r2.player.lunge(3, 0);
    expect(r2.s.position.x).toBeCloseTo(5.5, 6);
    // 水は 足場
    const r3 = new Rig();
    r3.floor({ x: 2.5, y: 9, z: 6.5 }, 90);
    r3.world.fill(5, 8, 0, 12, 8, 12, 'water');
    r3.player.lunge(3, 0);
    expect(r3.s.position.x).toBeCloseTo(5.5, 6);
  });
  it('WEAPON-4: 妖怪の 手前（半径 + 0.3 + 0.1）で 止まる。どいたら のこりを すすむ', () => {
    const r = new Rig();
    r.floor({ x: 2.5, y: 9, z: 6.5 }, 90);
    const y = { id: 1, kind: 'nurikabe', position: { x: 5.5, y: 9, z: 6.5 }, scale: 1, state: 'idle' } as unknown as YokaiInfo;
    let list: YokaiInfo[] = [y];
    r.player.lungeYokai = () => list;
    r.player.lunge(3, 0);
    expect(r.s.position.x).toBeGreaterThanOrEqual(5.5 - 1.3 - 1e-9);
    expect(r.s.position.x).toBeLessThan(5.5 - 1.3 + 0.06);
    list = [];
    r.player.lunge(1, 0);
    expect(r.s.position.x).toBeGreaterThan(4.9);
    // 消えかけは 止めない
    const r2 = new Rig();
    r2.floor({ x: 2.5, y: 9, z: 6.5 }, 90);
    r2.player.lungeYokai = () => [{ ...y, state: 'dying' } as YokaiInfo];
    r2.player.lunge(3, 0);
    expect(r2.s.position.x).toBeCloseTo(5.5, 6);
  });
  it('faceDeg が あるあいだ facing は それ（歩く向き・ねらう向きでは かわらない）', () => {
    const r = new Rig();
    r.floor({ x: 6.5, y: 9, z: 6.5 }, 0);
    r.player.motion.faceDeg = 45;
    r.press('moveBack');
    r.step(3);
    expect(r.s.facingDeg).toBeCloseTo(45, 9);
    r.release('moveBack');
    r.player.motion.faceDeg = null;
    r.press('moveBack');
    r.step(40);
    expect(r.s.facingDeg).toBeCloseTo(180, 0);
  });
  it('stopNow の ステップは 水平の速さが 0', () => {
    const r = new Rig();
    r.floor();
    r.press('moveForward');
    r.step(30);
    expect(Math.hypot(r.s.velocity.x, r.s.velocity.z)).toBeGreaterThan(3);
    r.player.motion.stopNow = true;
    r.step(1);
    expect(Math.hypot(r.s.velocity.x, r.s.velocity.z)).toBe(0);
  });
});

describe('HURT-1 motion.noMoveInput（怯み）', () => {
  it('true の あいだは 歩く・走る・ジャンプの 入力が きかない。false に もどせば 動く', () => {
    const r = new Rig();
    r.floor();
    r.player.motion.noMoveInput = true;
    r.press('moveForward', 'run', 'jump');
    const p0 = { ...r.s.position };
    r.step(24);
    expect(Math.hypot(r.s.position.x - p0.x, r.s.position.z - p0.z)).toBeLessThan(0.01);
    expect(r.s.position.y).toBeCloseTo(p0.y, 2);
    r.player.motion.noMoveInput = false;
    r.step(10);
    expect(Math.hypot(r.s.position.x - p0.x, r.s.position.z - p0.z)).toBeGreaterThan(0.3);
  });

  it('重力はのこる（空中なら落ちる）・マウスで向きは変えられる', () => {
    const r = new Rig();
    r.floor({ x: 2.5, y: 12, z: 6.5 });
    r.player.motion.noMoveInput = true;
    const y0 = r.s.position.y;
    const yaw0 = r.s.yawDeg;
    r.mouse(100, 0);
    r.step(5);
    expect(r.s.position.y).toBeLessThan(y0);
    expect(r.s.yawDeg).not.toBe(yaw0);
  });
});

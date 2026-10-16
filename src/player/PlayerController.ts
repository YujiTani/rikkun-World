import type { LockStatus, LookSource, PlayerState, SpawnPoint, VoxelWorld } from '../contracts';
import type { ActionState } from '../input/actions';
import {
  AUTOJUMP_CLEAR_TOP,
  AUTOJUMP_HEAD_TOP,
  AUTOJUMP_PROBE,
  BODY_HALF,
  BODY_HEIGHT,
  EPS,
  MOVING_SPEED_EPS,
  PITCH_LIMIT_DEG,
  VOID_Y,
  createPlayerSettings,
  type PlayerSettings,
} from './config';

const DEG = Math.PI / 180;

/** 箱の各軸の足もとからの範囲 [下, 上] */
const LO = [-BODY_HALF, 0, -BODY_HALF] as const;
const HI = [BODY_HALF, BODY_HEIGHT, BODY_HALF] as const;

export function normalizeYaw(yaw: number): number {
  let y = ((yaw % 360) + 360) % 360;
  if (y >= 360) y = 0;
  return y;
}

function clampPitch(p: number): number {
  return Math.max(-PITCH_LIMIT_DEG, Math.min(PITCH_LIMIT_DEG, p));
}

type Vec = Partial<{ x: number; y: number; z: number }>;

/**
 * プレイヤーの動き（M1-02）。描画には何も触らない。
 * 位置は足もとの中央。順番: 向き → 水平の速さ → ジャンプ → 上下の速さ → 軸ごとに動かす。
 */
export class PlayerController {
  readonly state: PlayerState;
  readonly settings: PlayerSettings;
  /** WEAPON-2: 刀・弓が かける 歩く倍率と ジャンプ止め（つなぎ込みが 毎ステップ 書く） */
  readonly motion = { speedMul: 1, jumpLocked: false };
  private readonly p = [0, 0, 0]; // 作業用: 位置
  private readonly idx = [0, 0, 0];

  constructor(
    private readonly world: VoxelWorld,
    private readonly actions: ActionState,
    private readonly look: LookSource,
    private readonly lock: LockStatus,
    private readonly spawn: () => SpawnPoint,
    settings: PlayerSettings = createPlayerSettings(),
  ) {
    this.settings = settings;
    this.state = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      yawDeg: 0,
      pitchDeg: 0,
      onGround: false,
      inWater: false,
      moving: false,
    };
    this.respawn();
  }

  /** スタート地点に戻す（速さ 0、向きはスタートの向き） */
  respawn(): void {
    const s = this.spawn();
    const st = this.state;
    st.position.x = s.x;
    st.position.y = s.y;
    st.position.z = s.z;
    st.velocity.x = st.velocity.y = st.velocity.z = 0;
    st.yawDeg = normalizeYaw(s.yawDeg);
    st.pitchDeg = clampPitch(s.pitchDeg);
    st.onGround = false;
    st.moving = false;
    this.updateWater();
  }

  /** テスト用: 置き直す。書かなかった項目はそのまま */
  set(v: { position?: Vec; velocity?: Vec; yawDeg?: number; pitchDeg?: number }): void {
    const st = this.state;
    if (v.position) {
      Object.assign(st.position, v.position);
      st.onGround = false; // 次のステップで決め直す
    }
    if (v.velocity) Object.assign(st.velocity, v.velocity);
    if (v.yawDeg !== undefined) st.yawDeg = normalizeYaw(v.yawDeg);
    if (v.pitchDeg !== undefined) st.pitchDeg = clampPitch(v.pitchDeg);
    this.updateWater();
  }

  /** 突きの ふみこみ: 水平に dx, dz だけ 動かす（かべで 止まる） */
  lunge(dx: number, dz: number): void {
    const st = this.state;
    const p = this.p;
    p[0] = st.position.x;
    p[1] = st.position.y;
    p[2] = st.position.z;
    this.sweep(0, dx);
    this.sweep(2, dz);
    st.position.x = p[0];
    st.position.z = p[2];
  }

  /** 1 ステップ進める（通常 1/60 秒） */
  update(dt: number): void {
    const st = this.state;
    const cfg = this.settings;
    const enabled = this.lock.playInputEnabled();

    // 向き（ロックなしのときは動きを捨てる）
    const { dx, dy } = this.look.consume();
    if (enabled) {
      st.yawDeg = normalizeYaw(st.yawDeg + dx * cfg.mouseSensitivity);
      st.pitchDeg = clampPitch(st.pitchDeg - dy * cfg.mouseSensitivity);
    }

    // 移動の入力 → 水平の目標速度
    let fwd = 0;
    let right = 0;
    let jumpHeld = false;
    if (enabled) {
      const a = this.actions;
      fwd = (a.isHeld('moveForward') ? 1 : 0) - (a.isHeld('moveBack') ? 1 : 0);
      right = (a.isHeld('moveRight') ? 1 : 0) - (a.isHeld('moveLeft') ? 1 : 0);
      jumpHeld = a.isHeld('jump');
    }
    const yaw = st.yawDeg * DEG;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    let wx = fwd * sin + right * cos;
    let wz = -fwd * cos + right * sin;
    const wlen = Math.hypot(wx, wz);
    if (wlen > 1e-9) {
      wx /= wlen;
      wz /= wlen;
    } else {
      wx = wz = 0;
    }

    // 水平の速さ: 目標へ一定の割合で近づける（先に速さを変えてから位置を動かす）
    const walkSpeed = st.inWater ? cfg.walkSpeed * cfg.waterSpeedMul : cfg.walkSpeed;
    const mul = this.motion.speedMul;
    const tx = wx * walkSpeed * mul;
    const tz = wz * walkSpeed * mul;
    const maxDelta = (walkSpeed / Math.max(cfg.accelTime, 1e-6)) * dt;
    const ex = tx - st.velocity.x;
    const ez = tz - st.velocity.z;
    const elen = Math.hypot(ex, ez);
    if (elen <= maxDelta) {
      st.velocity.x = tx;
      st.velocity.z = tz;
    } else {
      st.velocity.x += (ex / elen) * maxDelta;
      st.velocity.z += (ez / elen) * maxDelta;
    }

    // ジャンプ（地面にいるときだけ。押しっぱなしで着地のたびに続けて跳ぶ）
    const p = this.p;
    p[0] = st.position.x;
    p[1] = st.position.y;
    p[2] = st.position.z;
    let vy = st.velocity.y;
    if (st.onGround && !this.motion.jumpLocked && (jumpHeld || (wlen > 0 && cfg.autoJump && this.shouldAutoJump(wx, wz)))) {
      vy = Math.sqrt(2 * cfg.gravity * cfg.jumpHeight * (st.inWater ? cfg.waterJumpMul : 1));
    }

    // 上下: はじめと終わりの速さの平均で動かす（§4.5）
    const vyNew = Math.max(vy - cfg.gravity * dt, -cfg.maxFallSpeed);
    const moveY = ((vy + vyNew) / 2) * dt;

    const hitX = this.sweep(0, st.velocity.x * dt);
    const hitZ = this.sweep(2, st.velocity.z * dt);
    const hitY = this.sweep(1, moveY);
    if (hitX) st.velocity.x = 0;
    if (hitZ) st.velocity.z = 0;
    st.velocity.y = hitY ? 0 : vyNew;

    st.position.x = p[0];
    st.position.y = p[1];
    st.position.z = p[2];
    st.onGround = hitY && moveY < 0;
    st.moving = wlen > 0 || Math.hypot(st.velocity.x, st.velocity.z) > MOVING_SPEED_EPS;
    this.updateWater();

    if (st.position.y < VOID_Y) this.respawn();
  }

  // ------------------------------------------------------------ 当たり判定

  /** 軸 a（0=x,1=y,2=z）に d だけ動かす。ぶつかったら true（面で止める） */
  private sweep(a: 0 | 1 | 2, d: number): boolean {
    if (d === 0) return false;
    const p = this.p;
    let hit = false;
    let target = p[a] + d;

    // 世界の端の面（x・z のみ）
    if (a !== 1) {
      const eb = this.world.loadedBounds();
      const lo = (a === 0 ? eb.x0 : eb.z0) - LO[a];
      const hi = (a === 0 ? eb.x1 : eb.z1) - HI[a];
      if (target < lo) {
        target = lo;
        hit = true;
      } else if (target > hi) {
        target = hi;
        hit = true;
      }
    }

    if (d > 0) {
      const edge0 = p[a] + HI[a];
      const edge1 = target + HI[a];
      for (let c = Math.floor(edge0 - EPS) + 1; c <= Math.floor(edge1 - EPS); c++) {
        if (this.cellBlocked(a, c)) {
          target = c - HI[a];
          hit = true;
          break;
        }
      }
    } else {
      const edge0 = p[a] + LO[a];
      const edge1 = target + LO[a];
      for (let c = Math.floor(edge0 + EPS) - 1; c >= Math.floor(edge1 + EPS); c--) {
        if (this.cellBlocked(a, c)) {
          target = c + 1 - LO[a];
          hit = true;
          break;
        }
      }
    }
    p[a] = target;
    return hit;
  }

  /** 軸 a の c 番目の層に、箱と重なる固いブロックがあるか */
  private cellBlocked(a: 0 | 1 | 2, c: number): boolean {
    const p = this.p;
    const b = a === 0 ? 1 : 0;
    const e = a === 2 ? 1 : 2;
    const b0 = Math.floor(p[b] + LO[b] + EPS);
    const b1 = Math.floor(p[b] + HI[b] - EPS);
    const e0 = Math.floor(p[e] + LO[e] + EPS);
    const e1 = Math.floor(p[e] + HI[e] - EPS);
    const idx = this.idx;
    idx[a] = c;
    for (let i = b0; i <= b1; i++) {
      for (let j = e0; j <= e1; j++) {
        idx[b] = i;
        idx[e] = j;
        if (this.world.isSolid(idx[0], idx[1], idx[2])) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ オートジャンプ（§4.6 の 3〜5）

  private shouldAutoJump(wx: number, wz: number): boolean {
    const w = this.world;
    const [x, y, z] = this.p;
    const sx = x + wx * AUTOJUMP_PROBE;
    const sz = z + wz * AUTOJUMP_PROBE;
    const x0 = Math.floor(sx - BODY_HALF + EPS);
    const x1 = Math.floor(sx + BODY_HALF - EPS);
    const z0 = Math.floor(sz - BODY_HALF + EPS);
    const z1 = Math.floor(sz + BODY_HALF - EPS);
    const f0 = Math.floor(y + EPS);
    const f1 = Math.floor(y + 1 - EPS);
    const c0 = Math.floor(y + 1 + EPS);
    const c1 = Math.floor(y + AUTOJUMP_CLEAR_TOP - EPS);
    let hit = false;
    for (let i = x0; i <= x1; i++) {
      for (let k = z0; k <= z1; k++) {
        let foot = false;
        for (let j = f0; j <= f1; j++) if (w.isSolid(i, j, k)) foot = true;
        if (!foot) continue;
        hit = true;
        for (let j = c0; j <= c1; j++) if (w.isSolid(i, j, k)) return false; // 段の上に体が入らない
      }
    }
    if (!hit) return false;
    // 頭の上が空いているか
    const hx0 = Math.floor(x - BODY_HALF + EPS);
    const hx1 = Math.floor(x + BODY_HALF - EPS);
    const hz0 = Math.floor(z - BODY_HALF + EPS);
    const hz1 = Math.floor(z + BODY_HALF - EPS);
    const h0 = Math.floor(y + BODY_HEIGHT + EPS);
    const h1 = Math.floor(y + AUTOJUMP_HEAD_TOP - EPS);
    for (let i = hx0; i <= hx1; i++)
      for (let k = hz0; k <= hz1; k++)
        for (let j = h0; j <= h1; j++) if (w.isSolid(i, j, k)) return false;
    return true;
  }

  private updateWater(): void {
    const { x, y, z } = this.state.position;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    this.state.inWater =
      this.world.getBlock(bx, Math.floor(y + EPS), bz) === 'water' ||
      this.world.getBlock(bx, Math.floor(y + 0.9), bz) === 'water';
  }
}

import type { LockStatus, LookSource, PlayerState, SpawnPoint, VoxelWorld, YokaiInfo } from '../contracts';
import { KIND_AI } from '../yokai/ai/config';
import { WORLD_LIMIT } from '../contracts';
import type { ActionState } from '../input/actions';
import {
  AUTOJUMP_CLEAR_TOP,
  AUTOJUMP_HEAD_TOP,
  AUTOJUMP_PROBE,
  BODY_HALF,
  BODY_HEIGHT,
  AIM_HOLD_STEPS,
  EPS,
  MOVING_SPEED_EPS,
  PITCH_LIMIT_DEG,
  VOID_Y,
  createPlayerSettings,
  type PlayerSettings,
} from './config';

const DEG = Math.PI / 180;
/** ふみこみを 区切る 長さ（がけ・妖怪の 手前で 止める 細かさ） */
const LUNGE_SUBSTEP = 0.05;

/** 箱の各軸の足もとからの範囲 [下, 上] */
const LO = [-BODY_HALF, 0, -BODY_HALF] as const;
const HI = [BODY_HALF, BODY_HEIGHT, BODY_HALF] as const;

export function normalizeYaw(yaw: number): number {
  let y = ((yaw % 360) + 360) % 360;
  if (y >= 360) y = 0;
  return y;
}

/** 近いほうへ回る（ちょうど 180 度のときは 時計まわり＝プラス）。1 回に step 度まで */
export function turnToward(from: number, to: number, step: number): number {
  let diff = (((to - from) % 360) + 360) % 360; // 0 以上 360 未満
  if (diff > 180) diff -= 360;
  if (Math.abs(diff) <= step) return normalizeYaw(to);
  return normalizeYaw(from + Math.sign(diff) * step);
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
  readonly motion: { speedMul: number; jumpLocked: boolean; faceDeg: number | null; stopNow: boolean; leftAims: boolean; noRun: boolean } = {
    speedMul: 1,
    jumpLocked: false,
    /** CHAR-2: null でない あいだ facing は これ（わざの向き）。回らない */
    faceDeg: null,
    /** CHAR-2: true の ステップは 水平の速さを 0 に する */
    stopNow: false,
    /** WEAPON-3: false の ステップは 左クリックを「ねらう行動」にしない（刀・パンチの 攻撃・空ぶり） */
    leftAims: true,
    /** WEAPON-7: true の あいだは はしらない（ため中） */
    noRun: false,
  };
  /** WEAPON-4: ふみこみが 手前で 止まる 妖怪の 一覧（つなぎ込みが わたす） */
  lungeYokai: (() => ReadonlyArray<YokaiInfo>) | null = null;
  private readonly p = [0, 0, 0]; // 作業用: 位置
  private readonly idx = [0, 0, 0];
  /** ねらう行動のあと、向きをねらいに合わせつづける残りステップ */
  private aimHold = 0;

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
      facingDeg: 0,
      running: false,
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
    st.facingDeg = st.yawDeg;
    st.running = false;
    this.aimHold = 0;
    st.onGround = false;
    st.moving = false;
    this.updateWater();
  }

  /** テスト用: 置き直す。書かなかった項目はそのまま */
  set(v: { position?: Vec; velocity?: Vec; yawDeg?: number; pitchDeg?: number; facingDeg?: number }): void {
    const st = this.state;
    if (v.position) {
      Object.assign(st.position, v.position);
      st.onGround = false; // 次のステップで決め直す
    }
    if (v.velocity) Object.assign(st.velocity, v.velocity);
    if (v.yawDeg !== undefined) st.yawDeg = normalizeYaw(v.yawDeg);
    if (v.pitchDeg !== undefined) st.pitchDeg = clampPitch(v.pitchDeg);
    if (v.facingDeg !== undefined) st.facingDeg = normalizeYaw(v.facingDeg);
    this.updateWater();
  }

  /**
   * わざの ふみこみ: 水平に dx, dz だけ 動かす。実際に 動いた量を 返す。
   * 止まるもの（WEAPON-4 §4.5）: かべ・1 段の段差（`sweep`）、がけ（体の箱の下 2 段に 足場が 1 つも ない所）、
   * 妖怪（体の半分 + 妖怪の半径 + 0.1 より 近づく所）。水は 足場。
   */
  lunge(dx: number, dz: number): { x: number; z: number } {
    const st = this.state;
    const p = this.p;
    const x0 = st.position.x;
    const z0 = st.position.z;
    p[0] = x0;
    p[1] = st.position.y;
    p[2] = z0;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / LUNGE_SUBSTEP));
    const sx = dx / n;
    const sz = dz / n;
    const yl = len > 0 ? this.lungeYokai?.() : undefined;
    for (let i = 0; i < n; i++) {
      const px = p[0];
      const pz = p[2];
      this.sweep(0, sx);
      this.sweep(2, sz);
      if (p[0] === px && p[2] === pz) continue;
      if (!this.hasSupport(p[0], p[1], p[2]) || (yl !== undefined && this.nearYokai(yl, px, pz, p[0], p[1], p[2]))) {
        p[0] = px;
        p[2] = pz;
        break;
      }
    }
    st.position.x = p[0];
    st.position.z = p[2];
    return { x: p[0] - x0, z: p[2] - z0 };
  }

  /** 体の箱の 下（足もとの 1 段下・2 段下）に 固いブロックか 水が 1 つでも あるか。読みこんでいない列は あるとする */
  private hasSupport(x: number, y: number, z: number): boolean {
    const w = this.world;
    const i0 = Math.floor(x - BODY_HALF + EPS);
    const i1 = Math.floor(x + BODY_HALF - EPS);
    const k0 = Math.floor(z - BODY_HALF + EPS);
    const k1 = Math.floor(z + BODY_HALF - EPS);
    const j1 = Math.floor(y + EPS) - 1;
    for (let i = i0; i <= i1; i++) {
      for (let k = k0; k <= k1; k++) {
        if (!w.isLoaded(i, k)) return true;
        for (let j = j1; j >= j1 - 1; j--) if (w.isSolid(i, j, k) || w.getBlock(i, j, k) === 'water') return true;
      }
    }
    return false;
  }

  /** (nx, nz) が 高さの かさなる 妖怪の 手前の きょりより 近く、しかも 今より 近づくか */
  private nearYokai(list: ReadonlyArray<YokaiInfo>, ox: number, oz: number, nx: number, y: number, nz: number): boolean {
    for (const e of list) {
      if (e.state === 'dying' || e.state === 'leaving') continue;
      const ai = KIND_AI[e.kind];
      if (e.position.y + ai.height * e.scale <= y || e.position.y >= y + BODY_HEIGHT) continue;
      const lim = ai.radius * e.scale + BODY_HALF + 0.1;
      const dn = Math.hypot(nx - e.position.x, nz - e.position.z);
      if (dn >= lim) continue;
      if (dn < Math.hypot(ox - e.position.x, oz - e.position.z) - 1e-9) return true;
    }
    return false;
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
    let runHeld = false;
    let aiming = false;
    if (enabled) {
      const a = this.actions;
      fwd = (a.isHeld('moveForward') ? 1 : 0) - (a.isHeld('moveBack') ? 1 : 0);
      right = (a.isHeld('moveRight') ? 1 : 0) - (a.isHeld('moveLeft') ? 1 : 0);
      jumpHeld = a.isHeld('jump');
      runHeld = a.isHeld('run');
      aiming =
        (this.motion.leftAims && (a.isHeld('primary') || a.wasPressed('primary'))) ||
        a.isHeld('secondary') || a.isHeld('drop') || a.isHeld('dropStack') ||
        a.wasPressed('secondary') || a.wasPressed('drop') || a.wasPressed('dropStack');
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
    const waterMul = st.inWater ? cfg.waterSpeedMul : 1;
    const walkSpeed = cfg.walkSpeed * waterMul;
    const running = runHeld && wlen > 0 && !this.motion.noRun;
    const topSpeed = (running ? cfg.runSpeed : cfg.walkSpeed) * waterMul;
    const mul = this.motion.speedMul;
    const tx = wx * topSpeed * mul;
    const tz = wz * topSpeed * mul;
    // 加速は 歩く速さ基準のまま（仕様 §4.4: 0.1 秒で歩く速さぶん → 走る 5.6 までは 約 0.14 秒）
    const maxDelta = (walkSpeed / Math.max(cfg.accelTime, 1e-6)) * dt;
    st.running = running;

    // キャラの向き（CHAR-1 §4.2）: ねらう行動のあいだと、そのあと 30 ステップはカメラの yaw、そうでなければ歩く向き
    if (aiming) this.aimHold = AIM_HOLD_STEPS;
    let faceTo = -1;
    if (aiming || this.aimHold > 0) {
      if (!aiming) this.aimHold--;
      faceTo = st.yawDeg;
    } else if (wlen > 0) {
      faceTo = normalizeYaw(Math.atan2(wx, -wz) / DEG);
    }
    if (this.motion.faceDeg !== null) st.facingDeg = normalizeYaw(this.motion.faceDeg);
    else if (faceTo >= 0) st.facingDeg = turnToward(st.facingDeg, faceTo, cfg.turnDegPerSecond * dt);
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
    if (this.motion.stopNow) st.velocity.x = st.velocity.z = 0;

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

    // 世界の果ての見えない壁（x・z のみ。VOX-D W2。読みこんでいない列は 'outside'＝固いので、それ以外のはしは要らない）
    if (a !== 1) {
      const lo = -WORLD_LIMIT - LO[a];
      const hi = WORLD_LIMIT - HI[a];
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
        // 読みこんでいない列は 固い（'outside'。VOX-D: 世界のはしの面のかわり）
        if (!this.world.isLoaded(idx[0], idx[2]) || this.world.isSolid(idx[0], idx[1], idx[2])) return true;
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

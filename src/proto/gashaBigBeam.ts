/**
 * #293 試作: 攻撃 3「目から 光線」の 動き（画面・DOM・three には さわらない。ユニットテストで 動かせる）。
 *  Beam      … タイムライン（予兆 → 照射 → 終わり（大きな 煙）→ もどる）。目の 光の 強さ（glow）も ここ。
 *  BeamAim   … 着弾点の ねらい（最初は プレイヤーの 少し 前 → ダッシュ速度で 追う）・ブロックに さえぎられる か・当たり と ダメージの 間かく。
 *  clipBeam  … 目 → 着弾点の 線を ブロックで 止める（貫通しない）。
 * 数は gashaBigTuning.ts の beam。描画は gashaBigBeamFx.ts、つなぎは gashaBig.ts の stepBeam。
 */
import { TUNE as T } from './gashaBigTuning';

export interface V3 { x: number; y: number; z: number }

export type BeamPhase = 'idle' | 'charge' | 'fire' | 'finale' | 'recover' | 'done';

export interface BeamEvent {
  /** この コマで 光線が 出はじめた */
  fireStart?: boolean;
  /** この コマで 光線が 止まった（大きな 煙） */
  fireEnd?: boolean;
}

export class Beam {
  phase: BeamPhase = 'idle';
  /** いまの 局面に なって からの 秒 */
  t = 0;
  /** 目の 光の 強さ 0〜1（予兆で 上がり、照射中は 1、おわりで 下がる） */
  glow = 0;

  get firing(): boolean { return this.phase === 'fire'; }
  get done(): boolean { return this.phase === 'done'; }
  /** 予兆の 進み 0〜1（charge の 間だけ。それ以外は 予兆 前 0・あと 1） */
  get charge(): number {
    if (this.phase === 'idle') return 0;
    if (this.phase === 'charge') return Math.min(1, this.t / Math.max(1e-3, T.beam.chargeSec));
    return 1;
  }

  start(): void { this.phase = 'charge'; this.t = 0; this.glow = 0; }

  update(dt: number): BeamEvent {
    const K = T.beam, ev: BeamEvent = {};
    if (this.phase === 'idle' || this.phase === 'done') return ev;
    this.t += dt;
    if (this.phase === 'charge') {
      this.glow = Math.min(1, this.t / Math.max(1e-3, K.chargeSec));
      if (this.t >= K.chargeSec) { this.phase = 'fire'; this.t -= K.chargeSec; this.glow = 1; ev.fireStart = true; }
    }
    if (this.phase === 'fire' && this.t >= K.fireSec) { this.phase = 'finale'; this.t -= K.fireSec; ev.fireEnd = true; }
    if (this.phase === 'finale' && this.t >= K.finaleSec) { this.phase = 'recover'; this.t -= K.finaleSec; }
    if (this.phase === 'recover') {
      this.glow = Math.max(0, 1 - this.t / Math.max(1e-3, K.recoverSec));
      if (this.t >= K.recoverSec) { this.phase = 'done'; this.glow = 0; }
    }
    return ev;
  }
}

export type Solid = (x: number, y: number, z: number) => boolean;

export interface ClipResult {
  /** 光線の 先（ブロックに ぶつかれば その 手前） */
  end: V3;
  /** 着弾点に とどく まえに ブロックで 止まった */
  blocked: boolean;
}

/** 線 from → to を step ごとに 調べ、ブロック（solid）に ぶつかったら その 手前で 止める。ぶつかるのが to の すぐ そば（tol いない）なら とどいた ことに する */
export function clipBeam(from: V3, to: V3, solid: Solid, step: number, tol: number): ClipResult {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const L = Math.hypot(dx, dy, dz);
  const n = Math.max(1, Math.ceil(L / Math.max(0.05, step)));
  let lx = from.x, ly = from.y, lz = from.z;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = from.x + dx * t, y = from.y + dy * t, z = from.z + dz * t;
    if (solid(Math.floor(x), Math.floor(y), Math.floor(z))) {
      const rest = L * (1 - t);
      if (rest <= tol) return { end: { x: to.x, y: to.y, z: to.z }, blocked: false };
      return { end: { x: lx, y: ly, z: lz }, blocked: true };
    }
    lx = x; ly = y; lz = z;
  }
  return { end: { x: to.x, y: to.y, z: to.z }, blocked: false };
}

export interface AimEnv {
  /** プレイヤーの 足もと */
  player: V3;
  /** プレイヤーの 水平の 速さ */
  vel: { x: number; z: number };
  yawDeg: number;
  /** 左右の 目の 世界の 位置 */
  eyes: [V3, V3];
  /** 体の まん中（水平） */
  body: { x: number; z: number };
  /** ブロックの マス（整数）が かたいか（地面も ブロック） */
  solid: Solid;
}

export type AimMode = 'ground' | 'body' | 'safe';

export interface AimStep {
  mode: AimMode;
  ends: [ClipResult, ClipResult];
  /** 光線が 着弾点まで とどいて いる（どちらかの 目から） */
  reached: boolean;
  /** 着弾点が プレイヤーに 当たって いる */
  hit: boolean;
  /** この コマで 与える ダメージ（0 = なし。hitEverySec ごとに 1 回） */
  damage: number;
}

const SURFACE_UP = 4, SURFACE_DOWN = 70;

/** (x, z) の 列で、hint の すこし 上から 下へ たどって いちばん 上の かたい マスの 上の 面（なければ hint） */
export function surfaceY(solid: Solid, x: number, z: number, hint: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const y0 = Math.floor(hint) + SURFACE_UP;
  if (solid(ix, y0, iz)) {
    let y = y0;
    while (y < y0 + 60 && solid(ix, y, iz)) y++;
    return y;
  }
  for (let y = y0; y >= y0 - SURFACE_DOWN; y--) if (solid(ix, y, iz)) return y + 1;
  return hint;
}

/** (x, z) の 列で、fromY から 下へ たどって 最初の かたい マスの 上の 面（なければ -Infinity） */
function floorBelow(solid: Solid, x: number, z: number, fromY: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), y0 = Math.floor(fromY);
  for (let y = y0; y >= y0 - 120; y--) if (solid(ix, y, iz)) return y + 1;
  return -Infinity;
}

export class BeamAim {
  /** 着弾点（世界の 座標） */
  a: V3 = { x: 0, y: 0, z: 0 };
  mode: AimMode = 'ground';
  private cool = 0;

  /** 最初の ねらい: プレイヤーから 体の ほうへ leadDist（プレイヤーの 少し 前の 地面） */
  begin(env: AimEnv): void {
    const K = T.beam, p = env.player;
    let dx = env.body.x - p.x, dz = env.body.z - p.z;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) { const y = (env.yawDeg * Math.PI) / 180; dx = Math.sin(y); dz = -Math.cos(y); } else { dx /= l; dz /= l; }
    this.a.x = p.x + dx * K.leadDist; this.a.z = p.z + dz * K.leadDist;
    this.a.y = surfaceY(env.solid, this.a.x, this.a.z, p.y) + 0.05;
    this.cool = 0;
    this.mode = 'ground';
  }

  private modeOf(env: AimEnv): AimMode {
    const K = T.beam, p = env.player;
    const eyeY = (env.eyes[0].y + env.eyes[1].y) / 2;
    if (p.y > eyeY - K.safeMargin) return 'safe';
    const near = Math.hypot(p.x - env.body.x, p.z - env.body.z) <= K.bodyRadius;
    if (near && p.y - floorBelow(env.solid, p.x, p.z, p.y - 0.01) > K.bodyMinHeight) return 'body';
    return 'ground';
  }

  step(dt: number, env: AimEnv): AimStep {
    const K = T.beam, p = env.player, a = this.a;
    const mode = this.modeOf(env);
    this.mode = mode;
    const v = K.runSpeed * K.chaseMul * dt;
    if (mode === 'body') {
      const tx = p.x, ty = p.y + 1, tz = p.z;
      const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz);
      if (d <= v) { a.x = tx; a.y = ty; a.z = tz; } else { a.x += (dx / d) * v; a.y += (dy / d) * v; a.z += (dz / d) * v; }
    } else {
      let tx = p.x, tz = p.z;
      if (mode === 'safe') {
        // 目の とどかない 所に いる: 体の ずっと 前の 地面に 撃つ（だれも いない）
        let dx = p.x - env.body.x, dz = p.z - env.body.z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        tx = env.body.x + dx * 14; tz = env.body.z + dz * 14;
      }
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      if (d <= v) { a.x = tx; a.z = tz; } else { a.x += (dx / d) * v; a.z += (dz / d) * v; }
      a.y = surfaceY(env.solid, a.x, a.z, a.y) + 0.05;
    }
    const ends: [ClipResult, ClipResult] = [
      clipBeam(env.eyes[0], a, env.solid, K.stepBlocks, K.reachTol),
      clipBeam(env.eyes[1], a, env.solid, K.stepBlocks, K.reachTol),
    ];
    const reached = !ends[0].blocked || !ends[1].blocked;
    let hit = false;
    if (reached && mode === 'ground') hit = Math.hypot(a.x - p.x, a.z - p.z) <= K.hitRadius && Math.abs(a.y - p.y) <= K.hitYTol;
    else if (reached && mode === 'body') hit = Math.hypot(a.x - p.x, a.y - (p.y + 1), a.z - p.z) <= K.hitRadius;
    this.cool = Math.max(0, this.cool - dt);
    let damage = 0;
    if (hit && this.cool <= 0) { damage = K.damage; this.cool = K.hitEverySec; }
    return { mode, ends, reached, hit, damage };
  }
}

import type { Vec3 } from '../contracts';

/**
 * やさしい ねらい補助（CHAR-1 第 5.2 版 §4.5）。妖怪だけ。ブロックには補助しない。
 * 純粋な関数: 妖怪の当たりの箱の一覧と「この線は固いブロックを通るか」を受けとり、えらんだ妖怪の id か null を返す。
 * 呼ぶ側（PlayerCombat）は、先に「S からの線がそのまま妖怪に当たるか」を見て、当たらないときだけ これを使う。
 */

/** 妖怪の当たりの箱（今のねらいで使う 広げた箱。世界の座標） */
export interface AimAssistBox {
  id: number;
  min: Vec3;
  max: Vec3;
}

export interface AimAssistInput {
  /** カメラの位置 */
  camera: Vec3;
  /** 見ている向き D（長さ 1） */
  dir: Vec3;
  /** 肩の点 S */
  shoulder: Vec3;
  /** 体の基準点 P（届く距離のはかり始め） */
  pivot: Vec3;
  /** 届く距離（武器・道具ごと） */
  reach: number;
  /** 補助の角（度。`aimAssistDeg`。0 以下で補助なし） */
  assistDeg: number;
  boxes: readonly AimAssistBox[];
  /** from から to への線が 固いブロックを通るなら true */
  blocked: (from: Vec3, to: Vec3) => boolean;
}

/** 同じ角とみなす差（度） */
const TIE_DEG = 0.01;
const EPS_FWD = 1e-4;
const RAD = 180 / Math.PI;

export interface AimAssistCandidate {
  id: number;
  angleDeg: number;
  reachDist: number;
}

/** 箱の 12 本の辺（頂点の番号の組。番号の下 3 ビット = x・y・z が max か） */
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const cx: number[] = new Array(8).fill(0);
const cy: number[] = new Array(8).fill(0);
const cz: number[] = new Array(8).fill(0);

/** 点 (ax, ay)–(bx, by) の線分から 原点までの距離 */
function segDist(ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? -(ax * ex + ay * ey) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + ex * t, ay + ey * t);
}

/** 線 o + t·d (t ≥ 0) が 箱に当たるか（o が箱の中でも true） */
export function rayHitsBox(o: Vec3, d: Vec3, min: Vec3, max: Vec3): boolean {
  let t0 = 0;
  let t1 = Infinity;
  const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
  for (const a of axes) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < min[a] || o[a] > max[a]) return false;
    } else {
      let ta = (min[a] - o[a]) / d[a];
      let tb = (max[a] - o[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * カメラから見て、D と、箱のどこかの点への向きとの角のいちばん小さい値（度）。
 * 画面で「＋」から その箱の形までの角。箱がカメラのうしろだけなら Infinity。
 */
export function angleToBox(camera: Vec3, dir: Vec3, min: Vec3, max: Vec3): number {
  if (rayHitsBox(camera, dir, min, max)) return 0;
  // D に直角な面（距離 1）へ 頂点を うつした図で、箱の辺から 原点までの距離を測る
  // D に直角な 2 本の軸 u・v をつくる
  let ux: number, uy: number, uz: number;
  if (Math.abs(dir.y) < 0.9) {
    // u = D × (0,1,0) を正規化
    ux = -dir.z;
    uy = 0;
    uz = dir.x;
  } else {
    // u = D × (1,0,0)
    ux = 0;
    uy = dir.z;
    uz = -dir.y;
  }
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = dir.y * uz - dir.z * uy;
  const vy = dir.z * ux - dir.x * uz;
  const vz = dir.x * uy - dir.y * ux;
  for (let i = 0; i < 8; i++) {
    cx[i] = (i & 1 ? max.x : min.x) - camera.x;
    cy[i] = (i & 2 ? max.y : min.y) - camera.y;
    cz[i] = (i & 4 ? max.z : min.z) - camera.z;
  }
  let best = Infinity;
  for (const [i, j] of EDGES) {
    let ax = cx[i], ay = cy[i], az = cz[i];
    let bx = cx[j], by = cy[j], bz = cz[j];
    let fa = ax * dir.x + ay * dir.y + az * dir.z;
    let fb = bx * dir.x + by * dir.y + bz * dir.z;
    if (fa <= EPS_FWD && fb <= EPS_FWD) continue;
    if (fa <= EPS_FWD || fb <= EPS_FWD) {
      // 前（D の向き）に出ている部分だけ残す
      const t = (EPS_FWD - fa) / (fb - fa);
      const mx = ax + (bx - ax) * t;
      const my = ay + (by - ay) * t;
      const mz = az + (bz - az) * t;
      if (fa <= EPS_FWD) {
        ax = mx; ay = my; az = mz; fa = EPS_FWD;
      } else {
        bx = mx; by = my; bz = mz; fb = EPS_FWD;
      }
    }
    const d = segDist(
      (ax * ux + ay * uy + az * uz) / fa,
      (ax * vx + ay * vy + az * vz) / fa,
      (bx * ux + by * uy + bz * uz) / fb,
      (bx * vx + by * vy + bz * vz) / fb,
    );
    if (d < best) best = d;
  }
  return best === Infinity ? Infinity : Math.atan(best) * RAD;
}

/** 点 p から 箱までの いちばん近い距離 */
export function distanceToBox(p: Vec3, min: Vec3, max: Vec3): number {
  const dx = Math.max(min.x - p.x, 0, p.x - max.x);
  const dy = Math.max(min.y - p.y, 0, p.y - max.y);
  const dz = Math.max(min.z - p.z, 0, p.z - max.z);
  return Math.hypot(dx, dy, dz);
}

const centerScratch = { x: 0, y: 0, z: 0 };

/**
 * 補助で ねらう妖怪の id。なければ null。
 * 条件（ぜんぶ）: ア）画面の角 ≤ assistDeg　イ）P から箱まで ≤ reach　ウ）S から 箱の中心への線が 固いブロックを通らない。
 * えらび方: アの角が いちばん小さい。差 0.01 度未満なら P に近い方。
 */
export function pickAimAssist(input: AimAssistInput): number | null {
  if (!(input.assistDeg > 0)) return null;
  let bestId: number | null = null;
  let bestAngle = Infinity;
  let bestDist = Infinity;
  for (const b of input.boxes) {
    const reachDist = distanceToBox(input.pivot, b.min, b.max);
    if (reachDist > input.reach) continue;
    const angle = angleToBox(input.camera, input.dir, b.min, b.max);
    if (angle > input.assistDeg) continue;
    if (bestId !== null) {
      if (angle > bestAngle + TIE_DEG) continue;
      if (angle >= bestAngle - TIE_DEG && reachDist >= bestDist) continue;
    }
    centerScratch.x = (b.min.x + b.max.x) / 2;
    centerScratch.y = (b.min.y + b.max.y) / 2;
    centerScratch.z = (b.min.z + b.max.z) / 2;
    if (input.blocked(input.shoulder, centerScratch)) continue;
    bestId = b.id;
    bestAngle = angle;
    bestDist = reachDist;
  }
  return bestId;
}

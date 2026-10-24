import type { BladeTech, ItemId, Vec3, VoxelWorld, W2Settings, YokaiInfo } from '../contracts';
import { raycastBlocks } from '../dig/raycast';
import { KIND_AI } from '../yokai/ai/config';
import { TECH_PHASES } from '../char/techCurves';
import { bladeReachOf, techAdvance } from '../tools/blade/advance';

/**
 * WEAPON-3 近接の 攻撃の 向きの 決まり（仕様書 §4.2〜§4.4）。純粋な 計算だけ（描画・入力に 触らない）。
 * 向き（度）は yaw と 同じ 数え方（0 = 北 −Z、90 = 東 +X、0 以上 360 未満）。
 */

const DEG = Math.PI / 180;

export type AttackHold = 'blade' | 'punch' | 'bow' | 'none';

export interface AttackKeys {
  forward: boolean;
  back: boolean;
  right: boolean;
  left: boolean;
}

export interface AttackInput {
  settings: W2Settings;
  /** 手に 持っているものの なかま。bow・none は 向きの 決まりを 使わない */
  hold: AttackHold;
  /** 刀の 今の かまえの わざ（hold が blade の ときだけ 見る） */
  tech: BladeTech;
  /** WEAPON-6: 何段目か（なければ 1 段目と 同じ）。2・3 段目は 出だしが 短く、2 段目は ふみこむ */
  step?: 1 | 2 | 3;
  /** 持っている刀（射程 R を 引く。なければ かたなの R） */
  item?: ItemId | null;
  /** パンチの 届く距離（すで 3.5・なぎなた 5.0 など） */
  punchReach: number;
  yawDeg: number;
  facingDeg: number;
  keys: AttackKeys;
  /** 足もと P */
  position: Vec3;
  /** 体の点 B */
  body: Vec3;
  yokai: ReadonlyArray<YokaiInfo>;
  world: VoxelWorld;
  /**
   * ＋マークの 結果: ねらっている 妖怪（4° の ねらい補助 ふくむ）と、先の ブロック。
   * yokaiBeforeBlock: ＋マークの 線で ブロックより 手前に 妖怪が いる（届かなくても。M3 AC18・#34）
   */
  aim: { yokaiId: number | null; block: 'block' | 'crop' | null; yokaiBeforeBlock?: boolean };
}

export type AttackUse = 'attack' | 'dig' | 'harvest' | 'whiff' | 'none';

export interface AttackDecision {
  use: AttackUse;
  rule: 1 | 2 | 3 | 4 | null;
  /** もとの 向き a₀ */
  baseDeg: number;
  /** キーの向き k（押していなければ null） */
  keyDeg: number | null;
  /** 攻撃の向き u（弓・何も 持てないとき null） */
  dirDeg: number | null;
  targetId: number | null;
}

export function normDeg(a: number): number {
  let r = ((a % 360) + 360) % 360;
  if (r >= 360) r = 0;
  return r;
}

export function angleDiff(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/** P から 点への 水平の 向き（度） */
export function bearingDeg(dx: number, dz: number): number {
  return normDeg((Math.atan2(dx, -dz) * 180) / Math.PI);
}

/** 方向キーの 向き k（歩くのと 同じ 計算。打ち消しあう・押していない → null） */
export function keyDirDeg(yawDeg: number, keys: AttackKeys): number | null {
  const fwd = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const right = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (fwd === 0 && right === 0) return null;
  const yaw = yawDeg * DEG;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const wx = fwd * sin + right * cos;
  const wz = -fwd * cos + right * sin;
  return bearingDeg(wx, wz);
}

/** 妖怪の 当たりの箱（円柱で 近づける） */
export function boxOf(y: YokaiInfo): { r: number; h: number } {
  const ai = KIND_AI[y.kind];
  return { r: ai.radius * y.scale, h: ai.height * y.scale };
}

/** 妖怪の 当たりの箱の 中心 */
export function centerOfYokai(y: YokaiInfo, out: Vec3): Vec3 {
  const { h } = boxOf(y);
  out.x = y.position.x;
  out.y = y.position.y + h / 2;
  out.z = y.position.z;
  return out;
}

/** 突きの かたむき（度。上が 正）: B から 中心 c へ。上限 maxDeg まで */
export function thrustTilt(body: Vec3, c: Vec3, maxDeg: number): number {
  const dh = Math.hypot(c.x - body.x, c.z - body.z);
  const t = (Math.atan2(c.y - body.y, dh) * 180) / Math.PI;
  const m = Math.max(0, maxDeg);
  return Math.max(-m, Math.min(m, t));
}

/**
 * 突きの カプセル（from → 向き dir〈長さ 1〉に len、半径 rad）が 妖怪の 箱に 当たるか。当たれば 線の上の 近さ、当たらなければ -1。
 * 箱は 円柱で 近づける。
 */
export function capsuleDist(from: Vec3, dir: Vec3, len: number, rad: number, y: YokaiInfo): number {
  const { r, h } = boxOf(y);
  const vy = dir.y * len;
  const lo = y.position.y - rad;
  const hi = y.position.y + h + rad;
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(vy) < 1e-9) {
    if (from.y < lo || from.y > hi) return -1;
  } else {
    const a = (lo - from.y) / vy;
    const b = (hi - from.y) / vy;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return -1;
  }
  const vx = dir.x * len;
  const vz = dir.z * len;
  const wx = y.position.x - from.x;
  const wz = y.position.z - from.z;
  const vv = vx * vx + vz * vz;
  let t = vv < 1e-12 ? t0 : (wx * vx + wz * vz) / vv;
  t = Math.max(t0, Math.min(t1, t));
  const px = from.x + vx * t - y.position.x;
  const pz = from.z + vz * t - y.position.z;
  if (Math.hypot(px, pz) > r + rad) return -1;
  return t * len;
}

/** B から 妖怪の 箱の 中心への 線が 固い ブロックに さえぎられるか */
export function wallBetween(world: VoxelWorld, from: Vec3, cx: number, cy: number, cz: number): boolean {
  const dx = cx - from.x;
  const dy = cy - from.y;
  const dz = cz - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  return raycastBlocks(world, from.x, from.y, from.z, dx / len, dy / len, dz / len, len, true) !== null;
}

/** 扇の柱に 妖怪が 入るか（刀の 大げさ斬り・切り上げ。箱は 円柱）。forward は 水平の 向き（fx, fz） */
export function inFanColumn(
  center: Vec3,
  fx: number,
  fz: number,
  halfAngleDeg: number,
  rMax: number,
  yMin: number,
  yMax: number,
  y: YokaiInfo,
  extraR = 0,
  extraY = 0,
): boolean {
  const { r, h } = boxOf(y);
  if (y.position.y + h < center.y + yMin - extraY || y.position.y > center.y + yMax + extraY) return false;
  const dx = y.position.x - center.x;
  const dz = y.position.z - center.z;
  const d = Math.hypot(dx, dz);
  const rr = r + extraR;
  if (d > rMax + rr) return false;
  if (d <= rr) return true;
  const cos = (dx * fx + dz * fz) / d;
  const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
  const tol = Math.asin(Math.min(1, rr / d));
  return ang <= halfAngleDeg * DEG + tol;
}

/**
 * パンチの 扇の柱（§4.5）: 中心 P、前 f(u)、左右 halfAngleDeg（妖怪の 中心の 向きで 見る）、
 * 水平の 距離 = 広げた箱（半径 + 0.3）の いちばん近い所まで reach 以下、高さ P.y + yMin 〜 yMax（箱は ±0.3）。
 */
export function inPunchFan(P: Vec3, uDeg: number, shape: { halfAngleDeg: number; yMin: number; yMax: number }, reach: number, y: YokaiInfo): boolean {
  const { r, h } = boxOf(y);
  if (y.position.y + h < P.y + shape.yMin - 0.3 || y.position.y > P.y + shape.yMax + 0.3) return false;
  const dx = y.position.x - P.x;
  const dz = y.position.z - P.z;
  const dh = Math.hypot(dx, dz);
  if (dh - (r + 0.3) > reach) return false;
  if (dh < 0.01) return true;
  return angleDiff(bearingDeg(dx, dz), uDeg) <= shape.halfAngleDeg;
}

const cTmp: Vec3 = { x: 0, y: 0, z: 0 };
const dirTmp: Vec3 = { x: 0, y: 0, z: 0 };

/** 当たりの おわりまでに 進む 量（大げさぎりは とびこみ・2 段目は ふみこみ。WEAPON-4 §4.2・WEAPON-6 §4.4） */
function stepLunge(s: W2Settings, tech: BladeTech, step: 1 | 2 | 3 = 1): number {
  const base = s.bladeTech[tech];
  const f = step > 1 ? { startup: s.bladeCombo.stepStartup[tech], active: base.active, recovery: base.recovery } : base;
  const curve = (step === 2 ? s.bladeCombo.step2Advance[tech] : undefined) ?? s.bladeAdvance[tech];
  if (tech === 'thrust' && step !== 2) return 0;
  if (tech === 'kiriage' && step !== 2) return 0;
  return techAdvance(curve, TECH_PHASES[tech], f, f.startup + f.active);
}

/** 妖怪 y を その 中心の 向きに 攻撃したら 当たりの形に 入るか（条件 イ） */
function reachable(inp: AttackInput, y: YokaiInfo, c: Vec3, bearing: number | null, a0: number): boolean {
  const s = inp.settings;
  const P = inp.position;
  const { r } = boxOf(y);
  const dh = Math.hypot(c.x - P.x, c.z - P.z);
  const u = bearing ?? a0;
  const ur = u * DEG;
  const fx = Math.sin(ur);
  const fz = -Math.cos(ur);
  if (inp.hold === 'punch') {
    const ps = s.punchShape;
    // 広げた箱（半径 + 0.3・高さ ±0.3）が 扇の柱に 入る。届く距離は 広げた箱の いちばん近い所まで
    return inFanColumn(P, fx, fz, 180, inp.punchReach + 0.3, ps.yMin, ps.yMax, y, 0.3, 0.3) && dh - (r + 0.3) <= inp.punchReach;
  }
  if (inp.tech === 'thrust') {
    const sh = s.bladeShape.thrust;
    const R = bladeReachOf(s, inp.item) + stepLunge(s, inp.tech, inp.step);
    const tilt = thrustTilt(inp.body, c, s.thrustTiltMaxDeg) * DEG;
    const ct = Math.cos(tilt);
    dirTmp.x = fx * ct;
    dirTmp.y = Math.sin(tilt);
    dirTmp.z = fz * ct;
    return capsuleDist(inp.body, dirTmp, R, sh.radius, y) >= 0;
  }
  const sh = inp.tech === 'kesa' ? s.bladeShape.kesa : s.bladeShape.kiriage;
  // WEAPON-4 §4.2: 刀の 射程 R。大けさぎりは とびこみで 当たりの おわり（F = 出だし + 当たり）までに 進む ぶんを 足す
  const rMax = bladeReachOf(s, inp.item) + stepLunge(s, inp.tech, inp.step);
  return inFanColumn(P, fx, fz, sh.halfAngleDeg, rMax, sh.yMin, sh.yMax, y);
}

/** 向きの補助で えらぶ 妖怪（§4.3）。いなければ null */
function pickAssist(inp: AttackInput, a0: number): { y: YokaiInfo; bearing: number | null } | null {
  const assist = inp.settings.bladeFaceAssistDeg;
  if (!(assist > 0)) return null;
  const P = inp.position;
  let best: YokaiInfo | null = null;
  let bestD = 0;
  let bestAng = 0;
  let bestBearing: number | null = null;
  for (const y of inp.yokai) {
    if (y.state === 'dying' || y.state === 'leaving') continue;
    const c = centerOfYokai(y, cTmp);
    const dx = c.x - P.x;
    const dz = c.z - P.z;
    const dh = Math.hypot(dx, dz);
    const bearing = dh < 0.01 ? null : bearingDeg(dx, dz);
    const ang = bearing === null ? 0 : angleDiff(bearing, a0);
    if (ang > assist) continue;
    if (!reachable(inp, y, c, bearing, a0)) continue;
    if (wallBetween(inp.world, inp.body, c.x, c.y, c.z)) continue;
    let better = best === null;
    if (best !== null) {
      if (dh < bestD - 0.01) better = true;
      else if (dh > bestD + 0.01) better = false;
      else if (ang < bestAng - 1e-9) better = true;
      else if (ang > bestAng + 1e-9) better = false;
      else better = y.id < best.id;
    }
    if (better) {
      best = y;
      bestD = dh;
      bestAng = ang;
      bestBearing = bearing;
    }
  }
  return best ? { y: best, bearing: bestBearing } : null;
}

/** 左クリックの 使いみちと 攻撃の向き（§4.4）。刀・パンチの 持ち物で 毎ステップ 聞ける */
export function decideAttack(inp: AttackInput): AttackDecision {
  const keyDeg = keyDirDeg(inp.yawDeg, inp.keys);
  const a0 = keyDeg ?? normDeg(inp.facingDeg);
  if (inp.hold === 'bow' || inp.hold === 'none') {
    return { use: 'none', rule: null, baseDeg: a0, keyDeg, dirDeg: null, targetId: null };
  }
  // (1) 向いている方の 妖怪（補助）
  const t = pickAssist(inp, a0);
  if (t) {
    return { use: 'attack', rule: 1, baseDeg: a0, keyDeg, dirDeg: t.bearing ?? a0, targetId: t.y.id };
  }
  // (2) キーなし・＋マークで 妖怪を ねらっている
  if (keyDeg === null && inp.aim.yokaiId !== null) {
    const y = inp.yokai.find((q) => q.id === inp.aim.yokaiId);
    if (y) {
      const c = centerOfYokai(y, cTmp);
      const dx = c.x - inp.position.x;
      const dz = c.z - inp.position.z;
      const dir = Math.hypot(dx, dz) < 0.01 ? a0 : bearingDeg(dx, dz);
      return { use: 'attack', rule: 2, baseDeg: a0, keyDeg, dirDeg: dir, targetId: y.id };
    }
  }
  // (3) ＋マークの先の 作物・ブロック（線で 手前に 妖怪が いれば ほらない。妖怪が じゃまをする、M3 AC18）
  if (inp.aim.block !== null && !inp.aim.yokaiBeforeBlock) {
    return { use: inp.aim.block === 'crop' ? 'harvest' : 'dig', rule: 3, baseDeg: a0, keyDeg, dirDeg: a0, targetId: null };
  }
  // (4) 空ぶり
  return { use: 'whiff', rule: 4, baseDeg: a0, keyDeg, dirDeg: a0, targetId: null };
}

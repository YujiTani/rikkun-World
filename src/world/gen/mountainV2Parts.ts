import { hash01, valueNoise } from './random';
import { cone, smooth, type Bridge, type Params } from './mountainV2Params';
import { T, TAU } from './mountainV2Table';

/** 山の形 v2 の 部品（段・柱・かべ・橋）。数は mountainV2Table.ts */

/** 折れ線の表（T.spline）で 0〜1 の 高さを 変える */
export function splineOf(n: number): number {
  const t = T.spline;
  if (n <= 0) return n;
  for (let i = 1; i < t.length; i++) {
    const [x1, y1] = t[i]!;
    if (n <= x1) {
      const [x0, y0] = t[i - 1]!;
      return y0 + ((n - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return n;
}

/**
 * a 段の高さ: なめらかな 高さ h → 平らな 段（段ごとに 広さと かべの高さが ちがう）。
 * かべの 下には ところどころ がれ（1〜2 高い）。かべの 線は ノイズで くずす（まっすぐに しない）
 */
export function stairOf(p: Params, h: number, x: number, z: number): number {
  if (h <= 0) return h;
  const R = T.rubble;
  const hh = h + (valueNoise(p.sRub, x, z, R.wobbleScale) - 0.5) * 2 * R.wobble;
  let i = p.stairA.length - 1;
  while (i > 0 && p.stairA[i]! > hh) i--;
  let o = p.stairO[i]!;
  if (i < p.stairA.length - 1 && p.stairA[i + 1]! - hh < p.k * R.foot) {
    const n = valueNoise(p.sRub, x + 91, z - 57, R.scale);
    if (n > R.over) o += 1 + Math.floor(((n - R.over) / (1 - R.over)) * R.hMax * 0.999);
  }
  return o;
}

/**
 * b 岩の柱の群れ（石林）。かたまり 2〜4 こ、1 かたまり 2〜5 本。断面は ノイズで いびつ、下が太く 上が 細い。てっぺんは 平ら（3×3 以上）。
 * 返す値 = 柱の高さ（なければ -Infinity）
 */
export function pillarsAt(p: Params, px: number, pz: number, x: number, z: number): number {
  const q = T.pillar;
  let best = -Infinity;
  for (const pl of p.pillars) {
    if (Math.abs(x - pl.cx) > pl.cr || Math.abs(z - pl.cz) > pl.cr) continue;
    const dist = Math.hypot(x - pl.x, z - pl.z);
    if (dist > pl.rad * (1 + q.wobble) + 1) continue;
    const wob = 1 + (valueNoise(p.sPil, x, z, q.wobbleScale) - 0.5) * 2 * q.wobble;
    const dn = dist / (pl.rad * wob);
    if (dn >= 1) continue;
    const base = cone(p.top, p.k, p.plateau, Math.hypot(pl.x - px, pl.z - pz));
    // 平らな てっぺん（dn < taper）→ 少し 細る → つけねへ。つけねより 8 低い所まで のばす
    best = Math.max(best, base - 8 + (pl.height + 8) * (1 - smooth(q.taper, 1, dn)));
  }
  return best;
}

/**
 * c 大きな垂直のかべ: 山の 中で おわる 台地。かべの 面は ゆがめた 線（くねり ＋ たてのみぞ）で、途中に 小さな 段。
 * 長さは 山の 半径の 0.6〜1.2 倍、両はしは ある かくりつで 切り口、のこりは 高さを なめらかに おとす。台地は 面から うしろへ 8 以上。山の ふちの 外へは 出ない。
 * dx, dz = ゆがめた 山の点からの ずれ。d = ゆがめた きょり。返す値 = 持ち上げる 高さ
 */
export function wallLift(p: Params, dx: number, dz: number, d: number): number {
  const W = T.wall;
  const cs = Math.cos(p.sideA);
  const sn = Math.sin(p.sideA);
  const t = dx * cs + dz * sn;
  const s = -dx * sn + dz * cs - p.wallS0;
  const as = Math.abs(s);
  if (as > p.wallHalf) return 0;
  // 面の 位置: くねり ＋ たてのみぞ（s だけで きまる → たてのすじ）
  const groove = (valueNoise(p.sWall, s, 7, W.grooveScale) - 0.5) * 2 * W.groove;
  const edge = p.wallDist + Math.sin(s / W.bendLen + p.wallPhase) * W.bend + groove;
  if (t >= edge) return 0;
  const lift = Math.min(p.w[2] * p.wallH, Math.max(0, T.maxH - p.top));
  // はし: 切り口（垂直）で おわる か、なめらかに おちる
  const ends = p.wallCut[s < 0 ? 0 : 1] ? 1 : 1 - smooth(0.55 * p.wallHalf, p.wallHalf, as);
  const back = smooth(-p.wallDepth - W.backFade, -p.wallDepth, t);
  const step = t > edge - W.ledgeW ? W.ledgeFrac : 1;
  const foot = 1 - smooth(W.footFrom * p.r0, W.footTo * p.r0, d);
  return lift * ends * back * step * foot;
}

/**
 * 柱の橋: かたまりごとに ある かくりつで、頂上に いちばん ちかい 柱の てっぺんから、登れる道（すそ → 頂上）の 同じ高さの 所まで 細い 岩の道（くねる）。
 * 高さは 柱の てっぺんと 同じで 一定（下は 岩で うまる）。登れる道の 高さが 柱の てっぺんと 同じに なる 点で つなぐ（道は すそと つながっている）。
 * pathAt(along) = 登れる道の まん中の 点（along = 頂上から の きょり）。高さは 頂上 − 坂 × along
 */
export function buildBridges(p: Params, px: number, pz: number, pathAt: (along: number) => { x: number; z: number; tx: number; tz: number }): Bridge[] {
  const B = T.bridge;
  const out: Bridge[] = [];
  const seen = new Set<string>();
  p.pillars.forEach((pl, idx) => {
    const key = `${pl.cx}:${pl.cz}`;
    if (seen.has(key)) return;
    seen.add(key);
    // かたまりの 中で 頂上に いちばん ちかい 柱
    let best = idx;
    p.pillars.forEach((q, j) => {
      if (q.cx === pl.cx && q.cz === pl.cz && Math.hypot(q.x - px, q.z - pz) < Math.hypot(p.pillars[best]!.x - px, p.pillars[best]!.z - pz)) best = j;
    });
    const c = p.pillars[best]!;
    if (hash01(p.sPil, Math.round(pl.cx), Math.round(pl.cz), 77) >= B.chance) return;
    const topH = Math.min(cone(p.top, p.k, p.plateau, Math.hypot(c.x - px, c.z - pz)) + c.height, T.maxH);
    const along = (p.apex - topH) / T.path.k;
    if (along < 0) return;
    const T0 = pathAt(along);
    // 道には 道と 直角に つなぐ（さいごの 数マスは まっすぐ）。柱の がわから
    const nxp = -T0.tz;
    const nzp = T0.tx;
    const side = (c.x - T0.x) * nxp + (c.z - T0.z) * nzp >= 0 ? 1 : -1;
    const to = { x: T0.x + side * nxp * B.joinLen, z: T0.z + side * nzp * B.joinLen };
    const len = Math.hypot(to.x - c.x, to.z - c.z);
    if (len + B.joinLen > B.maxLen) return;
    const n = Math.max(1, Math.ceil(len));
    const phase = hash01(p.sPil, Math.round(c.x), Math.round(c.z), 78) * TAU;
    // 柱 → 道の てまえ。まっすぐに しない（はしは ぴったり、まん中ほど くねる）
    const nx = -(to.z - c.z) / len;
    const nz = (to.x - c.x) / len;
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bend = Math.sin(i / B.bendLen + phase) * B.bend * Math.sin(Math.PI * t);
      pts.push(c.x + (to.x - c.x) * t + nx * bend, c.z + (to.z - c.z) * t + nz * bend, topH);
    }
    // 道の 帯を よこぎる 橋は つくらない（道に けずられて きれる）。さいごの 直角の 部分は のぞく
    let crosses = false;
    for (let i = 0; i < pts.length && !crosses; i += 3) {
      for (let a = 0; a * T.path.k < p.apex + 2; a += 2) {
        const q = pathAt(a);
        if (Math.hypot(pts[i]! - q.x, pts[i + 1]! - q.z) < T.path.edge + 1.5) {
          crosses = true;
          break;
        }
      }
    }
    // ほかの 橋と まじわる 橋も つくらない（高さが ちがう ので どちらかが きれる）
    for (const o of out) {
      for (let i = 0; i < pts.length && !crosses; i += 3) {
        for (let j = 0; j < o.pts.length; j += 3) {
          if (Math.hypot(pts[i]! - o.pts[j]!, pts[i + 1]! - o.pts[j + 1]!) < B.edge + 1.5) {
            crosses = true;
            break;
          }
        }
      }
    }
    if (crosses) return;
    // てまえ → 道の まん中（直角）
    for (let i = 1; i <= B.joinLen; i++) pts.push(to.x + (T0.x - to.x) * (i / B.joinLen), to.z + (T0.z - to.z) * (i / B.joinLen), topH);
    out.push({ pts, px: c.x, pz: c.z });
  });
  return out;
}

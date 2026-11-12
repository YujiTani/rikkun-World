import type { CountryKind } from './config';
import { valueNoise } from './random';
import { cone, paramsFor, smooth, type Params } from './mountainV2Params';
import { choosePath, buildPath, pathAt, pathCell } from './mountainV2Path';
import { buildBridges, pillarsAt, splineOf, stairOf, wallLift } from './mountainV2Parts';
import { T, TAU, type MountainKind } from './mountainV2Table';

/**
 * 山の形 v2（試作。URL `?mountain=v2` のときだけ。既定の山は biome.ts の円すいのまま）。
 * 山の種類（いわやま・てんぐ・もみじ・ゆき）では 形を分けない。形の部品 a〜e を 山 1 つずつ シードで ちがう強さに まぜる（2〜3 こが 強く、のこりは 弱い）。
 * 種類の ちがいは 表面（ゆき・使うブロック・木）で 出す（mountainV2Table.ts の V2_SURFACE。使うのは biome.ts の topBlock）。
 * 部品: a 段々・b 岩の柱の群れ・c 大きな垂直のかべ・d するどい峰と尾根と谷・e ゆるい こぶ（部品の 中身は mountainV2Parts.ts）。
 * 全体は ノイズで ゆがめ（domain warp）、だ円にして 向きを シードで 決める → 円にも 左右対称にも ならない。高さの地図なので 張り出しは ない。
 * 返す値 = 海からの高さ（ざらざら 前）。
 */

/** `?mountain=v2` か（Node のテストでは location が ないので false） */
export const MOUNTAIN_V2: boolean = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mountain') === 'v2';

/** ためし・図 用: 頂上（山の点）の 高さと、橋で つながった 柱の てっぺん（x, z, 高さ） */
export function v2Landmarks(seed: number, kind: CountryKind, px: number, pz: number): { apex: number; bank: number; bridged: { x: number; z: number; h: number }[] } {
  const p = paramsFor(seed, kind as MountainKind, px, pz);
  const apex = mountainOffsetV2(seed, kind, px, pz, px, pz);
  return { apex, bank: p.bank, bridged: p.bridges!.map((b) => ({ x: b.px, z: b.pz, h: b.pts[2]! })) };
}

/** 海からの高さ（ざらざら 前）。kind は 山の 4 種のどれか。柱の 橋と、すそ → 頂上の 登れる道（坂 T.path.k）を 1 本 ほる */
export function mountainOffsetV2(seed: number, kind: CountryKind, px: number, pz: number, x: number, z: number): number {
  const p = paramsFor(seed, kind as MountainKind, px, pz);
  let h = shapeOf(p, px, pz, x, z);
  if (Number.isNaN(p.apex)) {
    p.apex = shapeOf(p, px, pz, px, pz);
    const best = choosePath(p, px, pz, (sx, sz) => shapeOf(p, px, pz, sx, sz));
    buildPath(p, px, pz, best.a0, best.dir);
    p.bank = best.bank;
  }
  if (p.bridges === null) p.bridges = buildBridges(p, px, pz, (a) => pathAt(p, a));
  const B = T.bridge;
  for (const br of p.bridges) {
    // いちばん ちかい 道の 点（1 マスごと）
    let bd = Infinity;
    let bl = 0;
    for (let i = 0; i < br.pts.length; i += 3) {
      const ddx = x - br.pts[i]!;
      const ddz = z - br.pts[i + 1]!;
      if (Math.abs(ddx) > B.edge || Math.abs(ddz) > B.edge) continue;
      const dd = ddx * ddx + ddz * ddz;
      if (dd < bd) {
        bd = dd;
        bl = br.pts[i + 2]!;
      }
    }
    if (bd < B.edge * B.edge) h = h + (bl - h) * (1 - smooth(B.flat, B.edge, Math.sqrt(bd)));
  }
  // 登れる道（らせん）: 道の まわりの 列に 道の 高さを かける
  const c = pathCell(p, x, z);
  return c ? h * (1 - c.w) + c.hp * c.w : h;
}

/**
 * 主峰: 小さな すそ（半径 = 山の 0.2〜0.3 倍）の するどい 峰。3〜5 本の 尾根（角度）で 星形に のびたり へこんだり、ぎざぎざに ゆらし、
 * 小さな 段（かた）に 刻む。なめらかな 円すいに ならない。返す値 = 海からの 高さ（すその 外は -Infinity）
 */
function spireAt(p: Params, d: number, ang: number, x: number, z: number): number {
  const S = T.spire;
  let q = 0;
  for (const s of p.ridges) {
    let da = Math.abs(ang - s.a) % TAU;
    if (da > Math.PI) da = TAU - da;
    q = Math.max(q, s.h * Math.exp(-((da / S.ridgeWidth) ** 2)));
  }
  const reach = p.spireR * (S.valley + (1 - S.valley) * q);
  const dd = d + (valueNoise(p.sJag, x + 33, z - 71, S.wobbleScale) - 0.5) * 2 * S.wobble;
  const t = dd / reach;
  if (t >= 1) return -Infinity;
  const topS = Math.min(p.top + p.spireH, T.maxH);
  const raw = topS - p.spireH * Math.max(0, (t - S.flat) / (1 - S.flat)) ** S.pow;
  return topS - S.step * Math.floor((topS - raw) / S.step);
}

function shapeOf(p: Params, px: number, pz: number, x: number, z: number): number {
  // 部品の 強さは 山ごとの 数 × 場所ごとの 大きな 地図（山の中でも 場所で 部品が いれかわる）
  const M = T.map;
  const loc = (i: number): number => p.w[i]! * (M.floor + (1 - M.floor) * smooth(0.3, 0.7, valueNoise(p.sMap[i]!, x, z, M.scale)));
  // 段々は どの山でも 最低の 強さで 出す（なめらかな 円すい・ドームで おわる 山を なくす）
  const wa = Math.max(T.stair.minStrength, loc(0));
  const wd = loc(3);
  const we = loc(4);
  const wx = (valueNoise(p.sWarpX, x, z, T.warp.scale) - 0.5) * 2 * T.warp.amp;
  const wz = (valueNoise(p.sWarpZ, x, z, T.warp.scale) - 0.5) * 2 * T.warp.amp;
  const dx = x - px + wx;
  const dz = z - pz + wz;
  // だ円: 向きの軸（u）を のばし、よこ（v）を つぶす
  const u = (dx * p.cos + dz * p.sin) / p.stretch;
  const v = (-dx * p.sin + dz * p.cos) * p.stretch;
  const d = Math.hypot(u, v);
  const ang = Math.atan2(v, u);

  // 土台: 円すい → こぶ（e）
  let h = cone(p.top, p.k, p.plateau, d);
  if (we > 0.05) {
    const L = T.lump;
    let lh = -Infinity;
    for (const s of p.lumps) lh = Math.max(lh, cone(p.top * L.topMul - s.h, L.k, L.plateau, Math.hypot(u - s.r, v)));
    h = h * (1 - we) + lh * we;
  }
  // 尾根と 谷（d）
  const P = T.peak;
  if (wd > 0.05) {
    let ridge = 0;
    for (const s of p.ridges) {
      let da = Math.abs(ang - s.a) % TAU;
      if (da > Math.PI) da = TAU - da;
      ridge = Math.max(ridge, s.h * Math.exp(-((da / P.ridgeWidth) ** 2)));
    }
    h -= wd * P.valleyDepth * (1 - ridge) * smooth(P.valleyFrom, P.valleyTo, d);
  }
  // けわしさの 地図が 高い所は 折れ線の表で 急に 立ちあげる（岩かべ・段の 急な 立ち上がり）
  const steepMix = smooth(M.steepFrom, M.steepTo, valueNoise(p.sSteep, x, z, M.steepScale)) * Math.max(wa, p.w[2]);
  if (steepMix > 0.02) h = h * (1 - steepMix) + p.top * splineOf(h / p.top) * steepMix;
  // 段々（a）: なめらかな 高さを 平らな 段に
  h = h * (1 - Math.min(1, wa * T.stair.gain)) + stairOf(p, h, x, z) * Math.min(1, wa * T.stair.gain);
  // 主峰: まわりより 25〜45 高い とがった 峰（ゆきやま・てんぐ は 出やすい）
  if (p.spireH > 0) h = Math.max(h, spireAt(p, d, ang, x, z));
  // するどい てっぺんと 小さな峰（d）
  if (wd > 0.05) {
    h += wd * P.tipH * Math.max(0, 1 - d / P.tipR) ** 2;
    for (const s of p.subs) {
      const sd = Math.hypot(u - Math.cos(s.a) * s.r, v - Math.sin(s.a) * s.r);
      h = Math.max(h, cone(p.top - s.h - (1 - wd) * P.subWeak, p.k * 1.4, 1, sd));
    }
  }
  // するどい 峰は 高くて けわしい 所にだけ ぎざぎざ
  if (wd > 0.3) {
    const J = T.jag;
    h += wd * J.amp * (1 - Math.abs(2 * valueNoise(p.sJag, x, z, J.scale) - 1)) * smooth(J.from * p.top, J.to * p.top, h);
  }
  // 大きな 垂直の かべ（c）: 山の 中で おわる 台地
  if (p.w[2] >= T.wall.minStrength) h += wallLift(p, dx, dz, d);
  // 岩の柱の群れ（b）
  if (p.pillars.length > 0) h = Math.max(h, pillarsAt(p, px, pz, x, z));
  return Math.min(h, T.maxH);
}

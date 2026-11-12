import { hash01, subSeed } from './random';
import { T, TAU, type MountainKind } from './mountainV2Table';

/** 山 1 つの 数（シードと 山の点で 決まる）。形の 計算は mountainV2.ts・mountainV2Parts.ts */

interface Item {
  a: number;
  r: number;
  h: number;
}

interface Pillar {
  x: number;
  z: number;
  rad: number;
  height: number;
  /** かたまりの 中心と はんい */
  cx: number;
  cz: number;
  cr: number;
}

export interface Bridge {
  /** 道の 点 [x, z, 高さ, ...] */
  pts: number[];
  /** つながる 柱の 中心 */
  px: number;
  pz: number;
}

export interface Params {
  sWarpX: number;
  sWarpZ: number;
  sWall: number;
  sPil: number;
  sMap: number[];
  sSteep: number;
  sJag: number;
  sRub: number;
  cos: number;
  sin: number;
  stretch: number;
  /** 部品 a〜e の 強さ（0〜1） */
  w: readonly [number, number, number, number, number];
  top: number;
  k: number;
  plateau: number;
  /** 山の すその 半径（top ÷ k） */
  r0: number;
  /** かべ: 面が むく 向き・かべの 中心の ずれ（面に そった 向き）・長さの 半分・かべの 中心からの きょり・うしろの 台地の ふかさ・くねりの 位相・高さ */
  sideA: number;
  wallS0: number;
  wallHalf: number;
  wallDist: number;
  wallDepth: number;
  wallPhase: number;
  /** かべの はし（s が 負 / 正）が 切り口で おわるか */
  wallCut: readonly [boolean, boolean];
  wallH: number;
  /** 段の はじまりの高さ（なめらかな 高さ）と その 段の 高さ */
  stairA: number[];
  stairO: number[];
  ridges: Item[];
  subs: Item[];
  lumps: Item[];
  pillars: Pillar[];
  /** 主峰の 上乗せ（0 = なし） */
  spireH: number;
  /** 主峰の すその 半径（ゆがめる まえの きょり） */
  spireR: number;
  pathA: number;
  /** 柱の 橋（はじめて 使うとき 作る）。頂上の 高さも 同じ */
  bridges: Bridge[] | null;
  /** 登れる道: 点（x, z の 列）と、道の まわりの 列ごとの 高さ（はじめて 使うとき 作る） */
  pathPts: number[] | null;
  pathCells: Map<number, { d: number; hp: number }> | null;
  apex: number;
  /** 道の 土手の 高さ（道が 地面より 高く 浮く ぶんの 最大） */
  bank: number;
  /** 頂上からの きょり r ごとの 段面の 高さ（道を 作るとき 作る） */
  prof: number[] | null;
}

export const cone = (top: number, k: number, plateau: number, d: number): number => top - k * Math.max(0, d - plateau);

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const cache = new Map<string, Params>();

export function paramsFor(seed: number, kind: MountainKind, px: number, pz: number): Params {
  const key = `${seed}:${px}:${pz}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = (n: number): number => hash01(seed, px, pz, 900 + n);
  const B = T.base[kind];
  // 部品の 強さ: 2〜3 こを 強く。そのあと 種類ごとの 下限・上限と 段々の 最低（どの山でも 出す）に おさめる
  const order = [0, 1, 2, 3, 4].sort((i, j) => r(100 + i) - r(100 + j));
  const nStrong = T.mix.strongN0 + Math.floor(r(110) * (T.mix.strongN1 - T.mix.strongN0 + 1));
  const w = [0, 0, 0, 0, 0];
  order.forEach((idx, rank) => {
    const v = rank < nStrong ? T.mix.strongMin + r(120 + idx) * (1 - T.mix.strongMin) : r(120 + idx) * T.mix.weakMax;
    w[idx] = Math.min(B.max[idx]!, Math.max(B.min[idx]!, v));
  });
  w[0] = Math.max(w[0]!, T.stair.minStrength);
  const top = B.top * (0.92 + r(130) * 0.16);
  // 段: 外がわの 低い所から 上へ
  const stairA: number[] = [];
  const stairO: number[] = [];
  let a = 0;
  let o = 0;
  const S = T.stair;
  for (let i = 0; i < 40 && a < top; i++) {
    stairA.push(a);
    stairO.push(o);
    a += (S.runMin + r(200 + i) ** S.runPow * (S.runMax - S.runMin)) * B.k;
    o += S.wallMin + r(250 + i) * (S.wallMax - S.wallMin);
  }
  stairA.push(a);
  stairO.push(o);
  const scale = top / o;
  for (let i = 0; i < stairO.length; i++) stairO[i] = stairO[i]! * scale;
  const P = T.peak;
  const a0 = r(301) * TAU;
  const ridges: Item[] = [];
  const nR = P.ridgeMin + Math.floor(r(300) * (P.ridgeMax - P.ridgeMin + 1));
  for (let i = 0; i < nR; i++) ridges.push({ a: a0 + (i / nR) * TAU + (r(310 + i) - 0.5) * 0.5, r: 0, h: 0.7 + r(320 + i) * 0.3 });
  const subs: Item[] = [];
  const nS = P.subMin + Math.floor(r(330) * (P.subMax - P.subMin + 1));
  for (let i = 0; i < nS; i++) subs.push({ a: a0 + (i / nS) * TAU + (r(340 + i) - 0.5) * 0.6, r: P.subR0 + r(350 + i) * (P.subR1 - P.subR0), h: P.subDrop0 + r(360 + i) * (P.subDrop1 - P.subDrop0) });
  const L = T.lump;
  const lumps: Item[] = [];
  const nL = L.min + Math.floor(r(370) * (L.max - L.min + 1));
  for (let i = 0; i < nL; i++) lumps.push({ a: 0, r: (i - (nL - 1) / 2) * L.spacing, h: i === Math.floor(nL / 2) ? 0 : L.drop * (0.6 + r(380 + i) * 0.8) });
  const pillars: Pillar[] = [];
  const Q = T.pillar;
  if (w[1]! >= Q.minStrength) {
    const nCl = Q.clMin + Math.floor(r(400) * (Q.clMax - Q.clMin + 1));
    for (let c = 0; c < nCl; c++) {
      const ca = r(410) * TAU + (c / nCl) * TAU;
      const cd = Q.from + r(420 + c) * (Q.to - Q.from);
      const cx = px + Math.cos(ca) * cd;
      const cz = pz + Math.sin(ca) * cd;
      const n = Q.n0 + Math.floor(r(430 + c) * (Q.n1 - Q.n0 + 1));
      for (let m = 0; m < n; m++) {
        const k = 500 + c * 40 + m * 4;
        const a2 = r(k) * TAU;
        const d2 = r(k + 1) * Q.spread;
        pillars.push({ x: cx + Math.cos(a2) * d2, z: cz + Math.sin(a2) * d2, rad: (Q.wMin + r(k + 2) * (Q.wMax - Q.wMin)) / 2, height: Q.hMin + r(k + 3) * (Q.hMax - Q.hMin), cx, cz, cr: Q.spread + Q.wMax });
      }
    }
  }
  const W = T.wall;
  const r0 = top / B.k;
  const p: Params = {
    pillars,
    spireH: r(600) < B.spire ? T.spire.hMin + r(601) * (T.spire.hMax - T.spire.hMin) : 0,
    spireR: r0 * (T.spire.footMin + r(602) * (T.spire.footMax - T.spire.footMin)),
    pathA: r(610) * TAU,
    sRub: subSeed(seed, 940),
    apex: NaN,
    bank: 0,
    prof: null,
    bridges: null,
    pathPts: null,
    pathCells: null,
    sWarpX: subSeed(seed, 911),
    sWarpZ: subSeed(seed, 912),
    sWall: subSeed(seed, 914),
    sPil: subSeed(seed, 915),
    sMap: [0, 1, 2, 3, 4].map((i) => subSeed(seed, 920 + i)),
    sSteep: subSeed(seed, 930),
    sJag: subSeed(seed, 931),
    cos: Math.cos(r(0) * Math.PI),
    sin: Math.sin(r(0) * Math.PI),
    stretch: T.ellipse.min + r(1) * (T.ellipse.max - T.ellipse.min),
    w: w as unknown as Params['w'],
    top,
    k: B.k,
    plateau: B.plateau,
    r0,
    sideA: r(7) * TAU,
    wallS0: (r(10) - 0.5) * 0.3 * r0,
    wallHalf: (r0 * (W.lenMin + r(11) * (W.lenMax - W.lenMin))) / 2,
    wallDist: W.distMin + r(8) * (W.distMax - W.distMin),
    wallDepth: W.depthMin + r(12) * (W.depthMax - W.depthMin),
    wallPhase: r(13) * TAU,
    wallCut: [r(14) < W.cutChance, r(15) < W.cutChance],
    wallH: W.hMin + r(9) * (W.hMax - W.hMin),
    stairA,
    stairO,
    ridges,
    subs,
    lumps,
  };
  if (cache.size > 64) cache.clear();
  cache.set(key, p);
  return p;
}

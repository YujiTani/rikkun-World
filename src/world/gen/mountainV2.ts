import type { CountryKind } from "./config";
import { hash01, subSeed, valueNoise } from "./random";

/**
 * 山の形 v2（試作。URL `?mountain=v2` のときだけ。既定の山は biome.ts の円すいのまま）。
 * 山の種類（いわやま・てんぐ・もみじ・ゆき）では 形を分けない。形の部品 a〜e を 山 1 つずつ シードで ちがう強さに まぜる（2〜3 こが 強く、のこりは 弱い）。
 * 種類の ちがいは 表面（ゆき・使うブロック・木）で 出す（V2_SURFACE。使うのは biome.ts の topBlock）。
 * 部品: a 段々（段ごとに 広さと かべの高さが ランダム）・b 岩の柱の群れ・c 大きな垂直のかべ・d するどい峰と尾根と谷・e ゆるい こぶ。
 * 全体は ノイズで ゆがめ（domain warp）、だ円にして 向きを シードで 決める → 円にも 左右対称にも ならない。高さの地図なので 張り出しは ない。
 * 返す値 = 海からの高さ（ざらざら 前）。
 */

/** `?mountain=v2` か（Node のテストでは location が ないので false） */
export const MOUNTAIN_V2: boolean =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("mountain") === "v2";

type MountainKind = "iwayama" | "tengu" | "momiji" | "yuki";

/**
 * 種類ごとの 表面（形とは べつ）。steep = 岩に する かたむき（となりの列との高さの差）。steepSnow = 雪の線より上で 岩に する かたむき。
 * rockFrom = これより 上（海から）は ゆるい面でも 岩（段の上の 広い 平らな所 = まわり flatR マスが 高さの差 1 以下 だけ くさ）。なし = 999。
 * rockHalf = 岩はだの 帯の はば（0 = ぜんぶ いし。大きいほど つち・せきたん が ふえる）
 */
export const V2_SURFACE = {
  iwayama: { steep: 2, steepSnow: 2, rockFrom: 12, flatR: 3, rockHalf: 0.16 },
  tengu: { steep: 2, steepSnow: 2, rockFrom: 999, flatR: 3, rockHalf: 0.18 },
  momiji: { steep: 4, steepSnow: 4, rockFrom: 999, flatR: 3, rockHalf: 0.18 },
  yuki: { steep: 2, steepSnow: 3, rockFrom: 999, flatR: 3, rockHalf: 0.18 },
} as const satisfies Record<
  MountainKind,
  {
    steep: number;
    steepSnow: number;
    rockFrom: number;
    flatR: number;
    rockHalf: number;
  }
>;

/** 数の表（単位は ブロック。角度は ラジアン。高さは 海から） */
const T = {
  /** 場所ごとの 強さの 地図: ノイズの格子（マス）・地図が 低い所でも のこる ぶん・けわしさの地図の格子・けわしい 所の 判定の はば */
  map: { scale: 70, floor: 0.3, steepScale: 80, steepFrom: 0.45, steepTo: 0.7 },
  /** 高さの 折れ線の表（スプライン）: [今の 高さ ÷ 主峰, 変えたあとの 高さ ÷ 主峰]。0.5〜0.6 の あいだで 急に 立ちあがる（岩かべ）。けわしさの 地図が 高い所に だけ かける */
  spline: [
    [0, 0],
    [0.3, 0.1],
    [0.5, 0.18],
    [0.6, 0.55],
    [0.75, 0.78],
    [1, 1],
  ] as const,
  /** するどい峰の ぎざぎざ: 大きさ・ノイズの格子・かかる 高さ（主峰÷）の はば */
  jag: { amp: 6, scale: 11, from: 0.55, to: 0.8 },
  /** 種類ごとの 主峰の高さ top・すその 坂 k・てっぺんの 平ら plateau（形の 部品とは べつ。ゆきやま は 高め） */
  base: {
    iwayama: { top: 75, k: 0.8, plateau: 3, spire: 0.1 },
    tengu: { top: 75, k: 0.9, plateau: 1, spire: 0.9 },
    momiji: { top: 64, k: 0.6, plateau: 5, spire: 0 },
    yuki: { top: 80, k: 0.75, plateau: 2, spire: 0.9 },
  } satisfies Record<
    MountainKind,
    { top: number; k: number; plateau: number; spire: number }
  >,
  /** 主峰（まわりより 25〜45 高い とがった 峰）: 高さの 上乗せ・峰の 坂（大きい = するどい） */
  spire: { hMin: 25, hMax: 45, k: 1.6 },
  /** 登れる道（すそ → 頂上）: 道の 坂（1 以下）・道の はば（まん中の 平ら / まわりへ なだらかに）・道の くねり（大きさ・格子） */
  path: { k: 0.7, flat: 1.5, edge: 4.5, wiggle: 6, wiggleScale: 40 },
  /** 柱の 橋（細い 岩の道）: つながる かくりつ・橋の はば（まん中の 平ら / まわりへ）・橋の 坂（1 以下）・くねり（大きさ・長さ）・さがす 長さの 上限 */
  bridge: {
    chance: 0.55,
    flat: 1.2,
    edge: 2.4,
    k: 0.45,
    bend: 5,
    bendLen: 12,
    maxLen: 110,
  },
  /** 段の かべの 下の がれ: かべの 下 この くらいの 高さ分（坂の 何倍）・高さ 1〜2・ところどころ（ノイズの しきい）・線を くずす ゆらぎ（マス・格子） */
  rubble: {
    foot: 1.6,
    hMax: 2,
    over: 0.45,
    scale: 5,
    wobble: 3,
    wobbleScale: 7,
  },
  /** 高さの 上限（海から。世界の 上限 270 − 海 144 = 126 の 中） */
  maxH: 120,
  /** きょりを ゆがめる: 大きさ（マス）・ノイズの格子（マス） */
  warp: { amp: 14, scale: 48 },
  /** だ円の ひしゃげ具合の はば（1 = 円） */
  ellipse: { min: 1.0, max: 1.4 },
  /** 部品の 強さ: 強い（2〜3 こ）の 下限〜1・弱い のこりの 上限 */
  mix: { strongMin: 0.7, weakMax: 0.25, strongN0: 2, strongN1: 3 },
  /** a 段々: 平らな所の はば（2〜4 から 広場 15〜30）・かべの高さ（3〜20）・せまい段が 多くなる ぶん（2 じょう） */
  stair: { runMin: 2, runMax: 30, wallMin: 3, wallMax: 20, runPow: 2 },
  /** b 岩の柱: かたまり 2〜4 こ（1 かたまり 2〜5 本）・かたまりの はんい・太さ 6〜14（てっぺん 3×3 以上が 平ら）・高さ 12〜45・かたまりの 立つ きょり（頂上から）・上の細り（平らな 部分の わりあい）・断面の いびつさ（大きさ・格子）・柱が 立つ 山の 強さの 下限 */
  pillar: {
    clMin: 2,
    clMax: 4,
    n0: 2,
    n1: 5,
    spread: 12,
    wMin: 6,
    wMax: 14,
    hMin: 12,
    hMax: 45,
    from: 30,
    to: 75,
    taper: 0.7,
    wobble: 0.25,
    wobbleScale: 6,
    minStrength: 0.3,
  },
  /** c 垂直のかべ: かべの高さ 40〜80・かべが ある 中心からの きょり・かべの ざらざら・うらがわの 持ち上げが きえる きょり */
  wall: {
    hMin: 40,
    hMax: 80,
    distMin: 12,
    distMax: 28,
    rough: 1.5,
    roughScale: 6,
    fadeFrom: 30,
    fadeTo: 95,
  },
  /** d 峰と尾根: 尾根 3〜5・尾根の角度の はば・谷の ふかさ・谷が ふかくなる きょり・てっぺんの とがり・小さな峰 2〜4・峰の きょり・峰の さがり */
  peak: {
    ridgeMin: 3,
    ridgeMax: 5,
    ridgeWidth: 0.38,
    valleyDepth: 46,
    valleyFrom: 4,
    valleyTo: 28,
    tipH: 12,
    tipR: 16,
    subMin: 2,
    subMax: 4,
    subR0: 30,
    subR1: 60,
    subDrop0: 20,
    subDrop1: 40,
    subWeak: 40,
  },
  /** e こぶ: 2〜3 こ・ならぶ ま・こぶの高さの さがり・こぶの 坂・平ら */
  lump: {
    min: 2,
    max: 3,
    spacing: 46,
    drop: 12,
    k: 0.6,
    plateau: 5,
    topMul: 0.9,
  },
} as const;

const TAU = Math.PI * 2;

interface Item {
  a: number;
  r: number;
  h: number;
}

interface Params {
  sWarpX: number;
  sWarpZ: number;
  sWall: number;
  sPil: number;
  sMap: number[];
  sSteep: number;
  sJag: number;
  cos: number;
  sin: number;
  stretch: number;
  /** 部品 a〜e の 強さ（0〜1） */
  w: readonly [number, number, number, number, number];
  top: number;
  k: number;
  plateau: number;
  sideA: number;
  wallDist: number;
  wallH: number;
  /** 段の はじまりの高さ（なめらかな 高さ）と その 段の 高さ */
  stairA: number[];
  stairO: number[];
  ridges: Item[];
  subs: Item[];
  lumps: Item[];
  /** 岩の柱（まとめて 作る）: 中心・はんけい・高さ・かたまりの 中心と はんい */
  pillars: {
    x: number;
    z: number;
    rad: number;
    height: number;
    cx: number;
    cz: number;
    cr: number;
  }[];
  /** 主峰の 上乗せ（0 = なし） */
  spireH: number;
  pathA: number;
  sRub: number;
  sPath: number;
  /** 柱の 橋（はじめて 使うとき 作る。つながらない 柱は なし）: 道の 点 [x, z, 高さ, ...]・柱の てっぺんの 位置 */
  bridges: { pts: number[]; px: number; pz: number }[] | null;
  /** 頂上（山の点）の 高さ。はじめて 使うとき 計算する */
  apex: number;
}

const cache = new Map<string, Params>();

function paramsFor(
  seed: number,
  kind: MountainKind,
  px: number,
  pz: number,
): Params {
  const key = `${seed}:${px}:${pz}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = (n: number): number => hash01(seed, px, pz, 900 + n);
  const B = T.base[kind];
  // 部品の 強さ: 2〜3 こを 強く
  const order = [0, 1, 2, 3, 4].sort((i, j) => r(100 + i) - r(100 + j));
  const nStrong =
    T.mix.strongN0 + Math.floor(r(110) * (T.mix.strongN1 - T.mix.strongN0 + 1));
  const w = [0, 0, 0, 0, 0];
  order.forEach((idx, rank) => {
    w[idx] =
      rank < nStrong
        ? T.mix.strongMin + r(120 + idx) * (1 - T.mix.strongMin)
        : r(120 + idx) * T.mix.weakMax;
  });
  const top = B.top * (0.92 + r(130) * 0.16);
  // 段: 外がわの 低い所から 上へ
  const stairA: number[] = [];
  const stairO: number[] = [];
  let a = 0;
  let o = 0;
  const S = T.stair;
  for (let i = 0; i < 40 && a < top; i++) {
    const run = S.runMin + r(200 + i) ** S.runPow * (S.runMax - S.runMin);
    const wall = S.wallMin + r(250 + i) * (S.wallMax - S.wallMin);
    stairA.push(a);
    stairO.push(o);
    a += run * B.k;
    o += wall;
  }
  stairA.push(a);
  stairO.push(o);
  const scale = top / o;
  for (let i = 0; i < stairO.length; i++) stairO[i] = stairO[i]! * scale;
  const P = T.peak;
  const ridges: Item[] = [];
  const nR = P.ridgeMin + Math.floor(r(300) * (P.ridgeMax - P.ridgeMin + 1));
  const a0 = r(301) * TAU;
  for (let i = 0; i < nR; i++)
    ridges.push({
      a: a0 + (i / nR) * TAU + (r(310 + i) - 0.5) * 0.5,
      r: 0,
      h: 0.7 + r(320 + i) * 0.3,
    });
  const subs: Item[] = [];
  const nS = P.subMin + Math.floor(r(330) * (P.subMax - P.subMin + 1));
  for (let i = 0; i < nS; i++)
    subs.push({
      a: a0 + (i / nS) * TAU + (r(340 + i) - 0.5) * 0.6,
      r: P.subR0 + r(350 + i) * (P.subR1 - P.subR0),
      h: P.subDrop0 + r(360 + i) * (P.subDrop1 - P.subDrop0),
    });
  const L = T.lump;
  const lumps: Item[] = [];
  const nL = L.min + Math.floor(r(370) * (L.max - L.min + 1));
  for (let i = 0; i < nL; i++)
    lumps.push({
      a: 0,
      r: (i - (nL - 1) / 2) * L.spacing,
      h: i === Math.floor(nL / 2) ? 0 : L.drop * (0.6 + r(380 + i) * 0.8),
    });
  const pillars: Params["pillars"] = [];
  const Q = T.pillar;
  if (w[1]! >= Q.minStrength) {
    const nCl = Q.clMin + Math.floor(r(400) * (Q.clMax - Q.clMin + 1));
    for (let c = 0; c < nCl; c++) {
      const ca = r(410) * TAU + (c / nCl) * TAU;
      const cd = Q.from + r(420 + c) * (Q.to - Q.from);
      const cx = px + Math.cos(ca) * cd;
      const cz = pz + Math.sin(ca) * cd;
      const n = Q.n0 + Math.floor(r(430 + c) * (Q.n1 - Q.n0 + 1));
      const cr = Q.spread + Q.wMax;
      for (let m = 0; m < n; m++) {
        const k = 500 + c * 40 + m * 4;
        const a2 = r(k) * TAU;
        const d2 = r(k + 1) * Q.spread;
        pillars.push({
          x: cx + Math.cos(a2) * d2,
          z: cz + Math.sin(a2) * d2,
          rad: (Q.wMin + r(k + 2) * (Q.wMax - Q.wMin)) / 2,
          height: Q.hMin + r(k + 3) * (Q.hMax - Q.hMin),
          cx,
          cz,
          cr,
        });
      }
    }
  }
  const p: Params = {
    pillars,
    spireH:
      r(600) < B.spire
        ? T.spire.hMin + r(601) * (T.spire.hMax - T.spire.hMin)
        : 0,
    pathA: r(610) * TAU,
    sRub: subSeed(seed, 940),
    sPath: subSeed(seed, 941),
    apex: NaN,
    bridges: null,
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
    w: w as unknown as Params["w"],
    top,
    k: B.k,
    plateau: B.plateau,
    sideA: r(7) * TAU,
    wallDist: T.wall.distMin + r(8) * (T.wall.distMax - T.wall.distMin),
    wallH: T.wall.hMin + r(9) * (T.wall.hMax - T.wall.hMin),
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

const cone = (top: number, k: number, plateau: number, d: number): number =>
  top - k * Math.max(0, d - plateau);

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 折れ線の表（T.spline）で 0〜1 の 高さを 変える */
function splineOf(n: number): number {
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
 * 段の高さ: なめらかな 高さ h → 平らな 段（段ごとに 広さと かべの高さが ちがう）。
 * かべの 下には ところどころ がれ（1〜2 高い）。かべの 線は ノイズで くずす（まっすぐに しない）
 */
function stairOf(p: Params, h: number, x: number, z: number): number {
  if (h <= 0) return h;
  const R = T.rubble;
  const hh = h + (valueNoise(p.sRub, x, z, R.wobbleScale) - 0.5) * 2 * R.wobble;
  let i = p.stairA.length - 1;
  while (i > 0 && p.stairA[i]! > hh) i--;
  let o = p.stairO[i]!;
  if (i < p.stairA.length - 1 && p.stairA[i + 1]! - hh < p.k * R.foot) {
    const n = valueNoise(p.sRub, x + 91, z - 57, R.scale);
    if (n > R.over)
      o += 1 + Math.floor(((n - R.over) / (1 - R.over)) * R.hMax * 0.999);
  }
  return o;
}

/**
 * 岩の柱の群れ（石林）。かたまり 2〜4 こ、1 かたまり 2〜5 本。断面は ノイズで いびつ、下が太く 上が 細い。てっぺんは 平ら（3×3 以上）。
 * 返す値 = 柱の高さ（なければ -Infinity）
 */
function pillarsAt(
  p: Params,
  px: number,
  pz: number,
  x: number,
  z: number,
): number {
  const q = T.pillar;
  let best = -Infinity;
  for (const pl of p.pillars) {
    if (Math.abs(x - pl.cx) > pl.cr || Math.abs(z - pl.cz) > pl.cr) continue;
    const dist = Math.hypot(x - pl.x, z - pl.z);
    if (dist > pl.rad * (1 + q.wobble) + 1) continue;
    const wob =
      1 + (valueNoise(p.sPil, x, z, q.wobbleScale) - 0.5) * 2 * q.wobble;
    const dn = dist / (pl.rad * wob);
    if (dn >= 1) continue;
    const base = cone(p.top, p.k, p.plateau, Math.hypot(pl.x - px, pl.z - pz));
    // 平らな てっぺん（dn < taper）→ 少し 細る → つけねへ。つけねより 8 低い所まで のばす
    best = Math.max(
      best,
      base - 8 + (pl.height + 8) * (1 - smooth(q.taper, 1, dn)),
    );
  }
  return best;
}

/**
 * 柱の橋: かたまりごとに ある かくりつで、頂上に いちばん ちかい 柱の てっぺんから 山の 斜面まで 細い 岩の道（くねる）。
 * 高さは てっぺんと 同じ から はじまり、山が 追いつく（同じ高さ）まで 1 マスごとに 坂 T.bridge.k 以下で 山に あわせる。
 */
function buildBridges(
  p: Params,
  px: number,
  pz: number,
): NonNullable<Params["bridges"]> {
  const B = T.bridge;
  const out: NonNullable<Params["bridges"]> = [];
  const seen = new Set<string>();
  p.pillars.forEach((pl, idx) => {
    const key = `${pl.cx}:${pl.cz}`;
    if (seen.has(key)) return;
    seen.add(key);
    // かたまりの 中で 頂上に いちばん ちかい 柱
    let best = idx;
    p.pillars.forEach((q, j) => {
      if (
        q.cx === pl.cx &&
        q.cz === pl.cz &&
        Math.hypot(q.x - px, q.z - pz) <
          Math.hypot(p.pillars[best]!.x - px, p.pillars[best]!.z - pz)
      )
        best = j;
    });
    const c = p.pillars[best]!;
    if (hash01(p.sPil, Math.round(pl.cx), Math.round(pl.cz), 77) >= B.chance)
      return;
    const topH = Math.min(
      cone(p.top, p.k, p.plateau, Math.hypot(c.x - px, c.z - pz)) + c.height,
      T.maxH,
    );
    const ang = Math.atan2(pz - c.z, px - c.x);
    const phase = hash01(p.sPil, Math.round(c.x), Math.round(c.z), 78) * TAU;
    const pts: number[] = [];
    let L = topH;
    for (let i = 0; i < B.maxLen; i++) {
      const bend = Math.sin(i / B.bendLen + phase) * B.bend * smooth(0, 10, i);
      const x = c.x + Math.cos(ang) * i - Math.sin(ang) * bend;
      const z = c.z + Math.sin(ang) * i + Math.cos(ang) * bend;
      pts.push(x, z, L);
      if (i < c.rad) continue;
      const target = shapeOf(p, px, pz, x, z);
      if (target >= L && target - L <= 1) break;
      if (target > L) L = Math.min(target, L + B.k);
      else continue;
    }
    // 山に とどいた ときだけ つなぐ（とどかない 柱は そのまま）
    const last = pts.length / 3 - 1;
    if (last < B.maxLen - 1) out.push({ pts, px: c.x, pz: c.z });
  });
  return out;
}

/** ためし・図 用: 頂上（山の点）の 高さと、橋で つながった 柱の てっぺん（x, z, 高さ） */
export function v2Landmarks(
  seed: number,
  kind: CountryKind,
  px: number,
  pz: number,
): { apex: number; bridged: { x: number; z: number; h: number }[] } {
  const p = paramsFor(seed, kind as MountainKind, px, pz);
  const apex = mountainOffsetV2(seed, kind, px, pz, px, pz);
  return {
    apex,
    bridged: p.bridges!.map((b) => ({ x: b.px, z: b.pz, h: b.pts[2]! })),
  };
}

/** 海からの高さ（ざらざら 前）。kind は 山の 4 種のどれか。すそ → 頂上の 登れる道（坂 T.path.k）を 1 本 ほる */
export function mountainOffsetV2(
  seed: number,
  kind: CountryKind,
  px: number,
  pz: number,
  x: number,
  z: number,
): number {
  const p = paramsFor(seed, kind as MountainKind, px, pz);
  let h = shapeOf(p, px, pz, x, z);
  if (Number.isNaN(p.apex)) p.apex = shapeOf(p, px, pz, px, pz);
  if (p.bridges === null) p.bridges = buildBridges(p, px, pz);
  for (const br of p.bridges) {
    // いちばん ちかい 道の 点（1 マスごと）
    const B = T.bridge;
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
    if (bd < B.edge * B.edge)
      h = h + (bl - h) * (1 - smooth(B.flat, B.edge, Math.sqrt(bd)));
  }
  const P = T.path;
  const dx = x - px;
  const dz = z - pz;
  const along = dx * Math.cos(p.pathA) + dz * Math.sin(p.pathA);
  if (along < 0) return h;
  const hp = p.apex - P.k * along;
  if (hp < -2) return h;
  // 道は くねる（頂上の ちかくでは まっすぐ）
  const lateral =
    (valueNoise(p.sPath, along, 0, P.wiggleScale) - 0.5) *
    2 *
    P.wiggle *
    smooth(0, 20, along);
  const perp = -dx * Math.sin(p.pathA) + dz * Math.cos(p.pathA) - lateral;
  const wcor = 1 - smooth(P.flat, P.edge, Math.abs(perp));
  return h * (1 - wcor) + hp * wcor;
}

function shapeOf(
  p: Params,
  px: number,
  pz: number,
  x: number,
  z: number,
): number {
  // 部品の 強さは 山ごとの 数 × 場所ごとの 大きな 地図（山の中でも 場所で 部品が いれかわる）
  const M = T.map;
  const loc = (i: number): number =>
    p.w[i]! *
    (M.floor +
      (1 - M.floor) * smooth(0.3, 0.7, valueNoise(p.sMap[i]!, x, z, M.scale)));
  const wa = loc(0);
  const wc = loc(2);
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
    for (const s of p.lumps)
      lh = Math.max(
        lh,
        cone(p.top * L.topMul - s.h, L.k, L.plateau, Math.hypot(u - s.r, v)),
      );
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
  // けわしさの 地図が 高い所は 折れ線の表で 急に 立ちあげる（大きな 垂直の かべ・段の 急な 立ち上がり）
  const steepMix =
    smooth(M.steepFrom, M.steepTo, valueNoise(p.sSteep, x, z, M.steepScale)) *
    Math.max(wa, wc);
  if (steepMix > 0.02)
    h = h * (1 - steepMix) + p.top * splineOf(h / p.top) * steepMix;
  // 段々（a）: なめらかな 高さを 平らな 段に
  if (wa > 0.05) h = h * (1 - wa) + stairOf(p, h, x, z) * wa;
  // 主峰: まわりより 25〜45 高い とがった 峰（ゆきやま・てんぐ は 出やすい）
  if (p.spireH > 0)
    h = Math.max(h, Math.min(p.top + p.spireH, T.maxH) - T.spire.k * d);
  // するどい てっぺんと 小さな峰（d）
  if (wd > 0.05) {
    h += wd * P.tipH * Math.max(0, 1 - d / P.tipR) ** 2;
    for (const s of p.subs) {
      const sd = Math.hypot(u - Math.cos(s.a) * s.r, v - Math.sin(s.a) * s.r);
      h = Math.max(
        h,
        cone(p.top - s.h - (1 - wd) * P.subWeak, p.k * 1.4, 1, sd),
      );
    }
  }
  // するどい 峰は 高くて けわしい 所にだけ ぎざぎざ
  if (wd > 0.3) {
    const J = T.jag;
    h +=
      wd *
      J.amp *
      (1 - Math.abs(2 * valueNoise(p.sJag, x, z, J.scale) - 1)) *
      smooth(J.from * p.top, J.to * p.top, h);
  }
  // 大きな 垂直の かべ（c）: かべの うらがわ（t < wallDist）を 持ち上げる。反対がわは そのまま
  if (wc > 0.05) {
    const W = T.wall;
    const t = dx * Math.cos(p.sideA) + dz * Math.sin(p.sideA);
    const edge =
      p.wallDist +
      (valueNoise(p.sWall, x, z, W.roughScale) - 0.5) * 2 * W.rough;
    if (t < edge)
      h +=
        Math.min(wc * p.wallH, Math.max(0, T.maxH - p.top)) *
        (1 - smooth(W.fadeFrom, W.fadeTo, d));
  }
  // 岩の柱の群れ（b）
  if (p.pillars.length > 0) h = Math.max(h, pillarsAt(p, px, pz, x, z));
  return Math.min(h, T.maxH);
}

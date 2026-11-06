import type { LocalShape } from './mineCaveShape';
import type { HiroiEgg, HiroiPlan } from './mineHiroiPlan';
import { inDisc, type HiroiKnob, type HiroiPillar } from './mineHiroiRanges';
import { hiroiTable, type HiroiWork } from './mineHiroiTable';

/**
 * ひろい ほらあな B の 向きを かえて（出口は 計画では +z がわの 南。90 度 ずつ まわす）、部屋の 形（LocalShape）に する。
 * 計画の 数は ぜんぶ 部屋の 中の 座標（仕様 §6.1 `hiroiPlan` の 座標の きまり）。マス ＝ 番号・かど・たまごの 中心 ＝ マスの かどの 座標。
 */

export type Turn = 0 | 1 | 2 | 3;

export interface HiroiLayout {
  size: { x: number; z: number; h: number };
  eggs: HiroiEgg[];
  pillars: HiroiPillar[];
  knobs: HiroiKnob[];
  bumps: { x: number; z: number }[];
  /** 出口の まん中の マス（部屋の 中の いちばん 南の 列）と そこから 外へ の むき（東西南北） */
  exit: { x: number; z: number; dx: number; dz: number };
  lo: Int8Array;
  hi: Int8Array;
  /** たまごだけで きまる 天井（床から）。柱の 円の 中を 固く する とき に 使う */
  full: Int8Array;
}

/** (x, z) の マスを turn 回 時計まわりに まわした マス（W×D の 部屋 → D×W） */
function cellOf(t: Turn, W: number, D: number, x: number, z: number): [number, number] {
  switch (t) {
    case 0:
      return [x, z];
    case 1:
      return [D - 1 - z, x];
    case 2:
      return [W - 1 - x, D - 1 - z];
    case 3:
      return [z, W - 1 - x];
  }
}
/** かどの 座標（マスの 番号の かわりに W−1 → W） */
function pointOf(t: Turn, W: number, D: number, x: number, z: number): [number, number] {
  switch (t) {
    case 0:
      return [x, z];
    case 1:
      return [D - z, x];
    case 2:
      return [W - x, D - z];
    case 3:
      return [z, W - x];
  }
}
const DIR: readonly (readonly [number, number])[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/** 計画を turn 回 まわす */
export function turnPlan(plan: HiroiPlan, t: Turn): HiroiLayout {
  const { x: W, z: D, h } = plan.size;
  const odd = t % 2 === 1;
  const nx = odd ? D : W;
  const nz = odd ? W : D;
  const cell = (x: number, z: number): [number, number] => cellOf(t, W, D, x, z);
  const lo = new Int8Array(nx * nz);
  const hi = new Int8Array(nx * nz);
  const full = new Int8Array(nx * nz);
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const [a, b] = cell(x, z);
      const i = b * nx + a;
      lo[i] = plan.lo[z * W + x]!;
      hi[i] = plan.hi[z * W + x]!;
      full[i] = plan.ceil[z * W + x]!;
    }
  }
  const [ex, ez] = cell(plan.exit.xc, plan.exit.z);
  const [dx, dz] = DIR[t]!;
  return {
    size: { x: nx, z: nz, h },
    eggs: plan.eggs.map((e) => {
      const [cx, cz] = pointOf(t, W, D, e.cx, e.cz);
      return odd ? { cx, cz, rx: e.rz, rz: e.rx } : { cx, cz, rx: e.rx, rz: e.rz };
    }),
    pillars: plan.pillars.map((p) => {
      const [x, z] = cell(p.x, p.z);
      return { ...p, x, z };
    }),
    knobs: plan.knobs.map((k) => {
      const [x, z] = pointOf(t, W, D, k.x, k.z);
      return { ...k, x, z };
    }),
    bumps: plan.bumps.map((q) => {
      const [x, z] = cell(q.x, q.z);
      return { x, z };
    }),
    exit: { x: ex, z: ez, dx, dz },
    lo,
    hi,
    full,
  };
}

/** 部屋の 形（LocalShape）に する。柱の かんむりの いちばん 大きい まるの 中の 列と、空気が 無い 列は、箱の 高さまで 固く する（force） */
export function hiroiShape(l: HiroiLayout, plain = false): LocalShape {
  const { x: sx, z: sz, h } = l.size;
  const T = hiroiTable().pillar;
  const crownMax = T.crown[T.crown.length - 1]!;
  const force = new Uint8Array(sx * sz);
  for (const p of l.pillars) {
    const r = Math.ceil(crownMax / 2);
    for (let z = p.z - r; z <= p.z + r; z++) for (let x = p.x - r; x <= p.x + r; x++) if (x >= 0 && z >= 0 && x < sx && z < sz && inDisc(x, z, p.x, p.z, crownMax)) force[z * sx + x] = 1;
  }
  const ceil = new Int8Array(sx * sz);
  const lift = new Int8Array(sx * sz);
  for (let i = 0; i < ceil.length; i++) {
    if (l.full[i] === 0) continue;
    ceil[i] = Math.max(l.hi[i]!, 1);
    lift[i] = l.hi[i]! > l.lo[i]! ? l.lo[i]! : ceil[i]!;
    if (l.hi[i]! <= l.lo[i]!) force[i] = 1;
  }
  return { sx, sy: h, sz, floorK: 0, ceil, water: new Int8Array(sx * sz), lift, force, hiroi: { pillars: l.pillars, maxTop: Math.max(...l.hi), plain } };
}

/** 窓口 `hiroiPlan` の 形（仕様 §6.1）。origin ＝ 計画の 箱の 北西の すみの マス（世界。y は 0 段目） */
export interface HiroiWorldPlan {
  origin: { x: number; y: number; z: number };
  size: { x: number; z: number; h: number };
  eggs: HiroiEgg[];
  pillars: HiroiPillar[];
  knobs: HiroiKnob[];
  bumps: { x: number; z: number }[];
  work: HiroiWork;
}

export function worldPlan(l: HiroiLayout, origin: HiroiWorldPlan['origin'], work: HiroiWork): HiroiWorldPlan {
  return { origin, size: l.size, eggs: l.eggs, pillars: l.pillars, knobs: l.knobs, bumps: l.bumps, work: { ...work } };
}

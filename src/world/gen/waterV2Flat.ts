import { hash01 } from './random';
import { basinFits, makeBasin, type Basin, type Ground } from './waterV2Kit';
import { WATER_TUNE as T } from './waterV2Table';

/**
 * 平らな 段: 高さの 差 1 以内で つながった マスの かたまり（段・広場・頂上の たいら）。池は ここに 作る。
 * 山 1 つに 1 回 さがす（高い 順）。
 */

const PL = T.plateau;

export interface Plateau {
  /** 段の 高さ（かたまりの はじめの マス） */
  h: number;
  size: number;
  /** ふちから いちばん とおい マス（中心）と その きょり */
  cx: number;
  cz: number;
  reach: number;
  /** ふちから 1 マス 以上 はなれた マス（高い きょりの 順） */
  inner: { x: number; z: number; d: number }[];
  has: (x: number, z: number) => boolean;
}

const DX = [1, -1, 0, 0] as const;
const DZ = [0, 0, 1, -1] as const;

/** center の まわり radius の 中の 平らな 段を、高い 順に すべて（minSize マス 以上）。free = 置いてよい 列 */
export function findPlateaus(g: Ground, cx: number, cz: number, radius: number, minSize: number, free: (x: number, z: number) => boolean): Plateau[] {
  const W = 2 * radius + 1;
  const x0 = cx - radius;
  const z0 = cz - radius;
  const hs = new Int16Array(W * W);
  const order: number[] = [];
  for (let i = 0; i < W * W; i++) {
    const x = x0 + (i % W);
    const z = z0 + Math.floor(i / W);
    const h = free(x, z) ? g(x, z) : -1;
    hs[i] = h;
    if (h >= 0) order.push(i);
  }
  order.sort((a, b) => hs[b]! - hs[a]! || a - b);
  const seen = new Uint8Array(W * W);
  const out: Plateau[] = [];
  for (const s of order) {
    if (seen[s]) continue;
    seen[s] = 1;
    const members: number[] = [];
    const stack = [s];
    while (stack.length > 0) {
      const j = stack.pop()!;
      members.push(j);
      const jx = j % W;
      const jz = Math.floor(j / W);
      for (let k = 0; k < 4; k++) {
        const nx = jx + DX[k]!;
        const nz = jz + DZ[k]!;
        if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
        const n = nz * W + nx;
        if (seen[n] || hs[n]! < 0 || Math.abs(hs[n]! - hs[s]!) > 1 || Math.abs(hs[n]! - hs[j]!) > 1) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (members.length < minSize) continue;
    out.push(describe(members, hs[s]!, W, x0, z0));
  }
  return out;
}

/** かたまりの ふちからの きょり（4 方向の 幅 ひろげ）を はかって 中心を きめる */
function describe(members: number[], h: number, W: number, x0: number, z0: number): Plateau {
  const dist = new Map<number, number>();
  const queue: number[] = [];
  const inSet = new Set(members);
  for (const j of members) {
    const jx = j % W;
    const jz = Math.floor(j / W);
    let edge = false;
    for (let k = 0; k < 4; k++) if (!inSet.has((jz + DZ[k]!) * W + jx + DX[k]!)) edge = true;
    if (edge) {
      dist.set(j, 0);
      queue.push(j);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const j = queue[q]!;
    const jx = j % W;
    const jz = Math.floor(j / W);
    for (let k = 0; k < 4; k++) {
      const n = (jz + DZ[k]!) * W + jx + DX[k]!;
      if (inSet.has(n) && !dist.has(n)) {
        dist.set(n, dist.get(j)! + 1);
        queue.push(n);
      }
    }
  }
  const inner = members.filter((j) => dist.get(j)! >= 1).map((j) => ({ x: x0 + (j % W), z: z0 + Math.floor(j / W), d: dist.get(j)! })).sort((a, b) => b.d - a.d || a.x - b.x || a.z - b.z);
  const best = inner[0] ?? { x: x0 + (members[0]! % W), z: z0 + Math.floor(members[0]! / W), d: 0 };
  return { h, size: members.length, cx: best.x, cz: best.z, reach: best.d, inner, has: (x, z) => inSet.has((z - z0) * W + x - x0) };
}

/**
 * 段に 池を えらぶ（高い 順）。頂上の ほう（topMin 以上）の 段に 必ず 1 つ（入れば）。のこりは くじ。池は 段の 広さの 3〜6 割（直径 9〜25）。
 * 返す 池は たがいに 14 マス 以上 はなれる
 */
export function plateauPonds(g: Ground, plateaus: readonly Plateau[], seed: number, topMin: number, free: (x: number, z: number) => boolean): Basin[] {
  const want = PL.ponds[0] + Math.floor(hash01(seed, 3, 3, 120) * (PL.ponds[1] - PL.ponds[0] + 1));
  const out: Basin[] = [];
  const tryOne = (p: Plateau, n: number): boolean => {
    const r0 = Math.min(PL.radius[1], Math.sqrt((PL.share * p.size) / Math.PI));
    const depth = T.pond.depth[0] + Math.floor(hash01(seed, p.cx, p.cz, 121) * (T.pond.depth[1] - T.pond.depth[0] + 1));
    for (let r = Math.max(PL.radius[0], Math.floor(r0 * 2) / 2); r >= PL.radius[0]; r -= 0.5) {
      const need = r * (1 + T.blob) + 1.5;
      const cs = p.inner.filter((q) => q.d >= need).slice(0, 400);
      for (let t = 0; t < Math.min(PL.centers, cs.length); t++) {
        const q = cs[Math.floor(hash01(seed, q0(p), t, 122 + n) * cs.length)]!;
        const h = g(q.x, q.z);
        if (h < 0) continue;
        const b = makeBasin(seed + n, q.x + 0.5, q.z + 0.5, r, h - 1, depth);
        if (out.some((o) => Math.hypot(o.cx - b.cx, o.cz - b.cz) < 14)) continue;
        if (!basinFits(g, b, T.pond.flat, T.pond.flat + 1, free)) continue;
        out.push(b);
        return true;
      }
    }
    return false;
  };
  const top = plateaus.filter((p) => p.h >= topMin);
  const rest = plateaus.filter((p) => p.h < topMin);
  for (const p of top) if (tryOne(p, out.length)) break; // 頂上の ほうに 必ず 1 つ
  for (const p of [...top, ...rest]) {
    if (out.length >= want) break;
    if (hash01(seed, p.cx, p.cz, 123) < 0.75) tryOne(p, out.length);
  }
  return out;
}

const q0 = (p: Plateau): number => p.cx * 31 + p.cz;

import { SEA_Y } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { hash01, subSeed } from './random';

/**
 * MAGMA-SPAWN（docs/design/MAGMA-SPAWN.md §4）: 自然の 溶岩の いけ・マグマの 滝・水の 滝。かっぱの ぬま の いけ（biome.ts の pondsOfCell・pondAt）と 同じ 作り:
 *   ・いけは だ円（inner）と まわり 1 マス（ring）。高さは inner = へり − 深さ − 1（底）、ring = へり。chunk.ts が 底の 上から へりの 1 つ下まで 液体で うめる
 *   ・場所は シードと 升目だけで きまる（列を 読まない。作る 順に よらない）
 *   ・へり と 底は いし（topBlock）。木・くさ・やさいは いけの 上に 出ない
 * 滝: いけの 南の へりに いしの はしら、上に わきみず（水 / マグマ）。わきみずの 出口は 下 → 北 → … の じゅん なので、下が はしら なら 北（いけの 上）へ 出る。
 *     落ちる 先の 底が たきつぼ → はじめから つながって 量が かわらない（マグマの 滝も あふれない）。
 */
export interface LiquidPond {
  liquid: 'magma' | 'water';
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** へりの 高さ */
  level: number;
  depth: number;
  /** 滝（なければ null）: はしらの 場所と わきみずの 高さ */
  fall: { x: number; z: number; top: number } | null;
  /** はじめの 場所の そばの いけ */
  nearSpawn: boolean;
}
export type PondHit = { kind: 'inner' | 'ring'; pond: LiquidPond };

/** 調整 */
export const LIQUID_POND_TUNING = {
  /** 升目の 大きさ（マス）。升目に 0 か 1 こ */
  cell: 96,
  /** 升目に いけが ある 確率 */
  chance: 0.3,
  /** しゅるいの わりあい（溶岩の いけ / マグマの 滝 / 水の 滝。のこり） */
  lavaPond: 0.45,
  lavaFall: 0.25,
  width: [4, 6] as const,
  depth: [1, 2] as const,
  fallHeight: [4, 6] as const,
  /** 升目の へりから はなす マス */
  margin: 12,
  /** はじめの 場所から この 距離（チェビシェフ）より 内には 升目の いけを 置かない（はじめの そばの いけ だけ） */
  spawnClear: 80,
  /** テストに 使う 場所（GEN_CONFIG.testArea）から この マス 内にも 置かない（E2E の しずけさ） */
  testAreaClear: 48,
  /** へりの 高さの 差が これ より 大きい 場所は やめる */
  maxSlope: 2,
  /** はじめの そばの 溶岩の いけ: 広場（ringMax 6）の 外。候補を じゅんに しらべる（はじめの 場所から dx・dz。いけの まん中） */
  // ななめ だけ（はじめの 場所から 東西南北へ まっすぐ 歩く 道に かからない。m1 AC12）
  spawnCandidates: [[13, 13], [-13, 13], [13, -14], [-13, -14], [16, 16], [-16, 16]] as const,
};
const T = LIQUID_POND_TUNING;

/** いけを 決める ための 地形の 窓口（Terrain の 一部。height は 使わない = いけを 決める 前の 高さ） */
export interface PondTerrain {
  readonly seed: number;
  base(x: number, z: number): number;
  spawn(): { x: number; z: number; h: number };
  inRock(x: number, z: number, margin?: number): boolean;
  readonly map: { pondAt(x: number, z: number): unknown };
}

export class LiquidPonds {
  private readonly cache = new Map<number, LiquidPond | null>();
  private spawnPond: LiquidPond | null | undefined;
  private readonly s: number;

  constructor(private readonly t: PondTerrain) {
    this.s = subSeed(t.seed, 733);
  }

  /** 升目 (i, j) の いけ（なければ null） */
  ofCell(i: number, j: number): LiquidPond | null {
    const key = (i + 32768) * 65536 + (j + 32768);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const p = this.makeCell(i, j);
    this.cache.set(key, p);
    return p;
  }

  /** はじめの 場所の そばの マグマの 滝（平らな 候補が なければ いちばん 平らな 候補） */
  nearSpawn(): LiquidPond | null {
    if (this.spawnPond !== undefined) return this.spawnPond;
    const sp = this.t.spawn();
    let best: { p: LiquidPond; slope: number } | null = null;
    for (const [dx, dz] of T.spawnCandidates) {
      const cx = sp.x + dx;
      const cz = sp.z + dz;
      const p = this.shape(cx - 3, cz - 2, 6, 5, 2, 'magma', 0, true); // 滝なし（はじめの そばで ずっと 動く 物を 置かない。滝は 升目の いけ と ?demo=magma）
      if (p === null) continue;
      const slope = this.slope(p);
      if (best === null || slope < best.slope) best = { p, slope };
      if (slope <= T.maxSlope) break;
    }
    this.spawnPond = best?.p ?? null;
    return this.spawnPond;
  }

  /** (x, z) が いけの 中・へり か */
  pondAt(x: number, z: number): PondHit | null {
    const sp = this.nearSpawn();
    if (sp !== null) {
      const h = hitOf(sp, x, z);
      if (h !== null) return h;
    }
    const i = Math.floor((x - C.anchor.x) / T.cell);
    const j = Math.floor((z - C.anchor.z) / T.cell);
    const p = this.ofCell(i, j);
    return p === null ? null : hitOf(p, x, z);
  }

  /** 箱（x0..x1, z0..z1）に かかる いけ（滝の はしら・ふた を ふくめて 2 マス ひろげて しらべる） */
  pondsIn(x0: number, z0: number, x1: number, z1: number): LiquidPond[] {
    const out: LiquidPond[] = [];
    const add = (p: LiquidPond | null): void => {
      if (p !== null && p.x1 + 2 >= x0 && p.x0 - 2 <= x1 && p.z1 + 3 >= z0 && p.z0 - 2 <= z1) out.push(p);
    };
    add(this.nearSpawn());
    const i0 = Math.floor((x0 - C.anchor.x) / T.cell);
    const i1 = Math.floor((x1 - C.anchor.x) / T.cell);
    const j0 = Math.floor((z0 - C.anchor.z) / T.cell);
    const j1 = Math.floor((z1 - C.anchor.z) / T.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) add(this.ofCell(i, j));
    return out;
  }

  private makeCell(i: number, j: number): LiquidPond | null {
    const s = this.s;
    if (hash01(s, i, j, 1) >= T.chance) return null;
    const r = hash01(s, i, j, 2);
    const liquid: 'magma' | 'water' = r < T.lavaPond + T.lavaFall ? 'magma' : 'water';
    const withFall = r >= T.lavaPond;
    const wx = T.width[0] + Math.floor(hash01(s, i, j, 3) * (T.width[1] - T.width[0] + 1));
    const wz = T.width[0] + Math.floor(hash01(s, i, j, 4) * (T.width[1] - T.width[0] + 1));
    const span = T.cell - 2 * T.margin - wx;
    const x0 = C.anchor.x + i * T.cell + T.margin + Math.floor(hash01(s, i, j, 5) * span);
    const z0 = C.anchor.z + j * T.cell + T.margin + Math.floor(hash01(s, i, j, 6) * (T.cell - 2 * T.margin - wz));
    const depth = T.depth[0] + Math.floor(hash01(s, i, j, 7) * (T.depth[1] - T.depth[0] + 1));
    const fh = withFall ? T.fallHeight[0] + Math.floor(hash01(s, i, j, 8) * (T.fallHeight[1] - T.fallHeight[0] + 1)) : 0;
    const sp = this.t.spawn();
    if (Math.max(Math.abs(x0 + wx / 2 - sp.x), Math.abs(z0 + wz / 2 - sp.z)) < T.spawnClear) return null;
    const ta = C.testArea;
    if (x0 + wx > ta.x0 - T.testAreaClear && x0 < ta.x1 + T.testAreaClear && z0 + wz > ta.z0 - T.testAreaClear && z0 < ta.z1 + T.testAreaClear) return null;
    const p = this.shape(x0, z0, wx, wz, depth, liquid, fh, false);
    if (p === null || this.slope(p) > T.maxSlope) return null;
    return p;
  }

  /** 形を 作る（陸で ない・岩山・かっぱの いけ に かかる なら null） */
  private shape(x0: number, z0: number, wx: number, wz: number, depth: number, liquid: 'magma' | 'water', fallH: number, nearSpawn: boolean): LiquidPond | null {
    const x1 = x0 + wx - 1;
    const z1 = z0 + wz - 1;
    const t = this.t;
    for (let z = z0 - 1; z <= z1 + 2; z++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (t.inRock(x, z, 2) || t.map.pondAt(x, z) !== null) return null;
        if (t.base(x, z) < SEA_Y + 3) return null;
      }
    }
    const cx = Math.floor(x0 + wx / 2);
    const level = t.base(cx, Math.floor(z0 + wz / 2));
    const p: LiquidPond = { liquid, x0, z0, x1, z1, level, depth, fall: null, nearSpawn };
    if (fallH > 0) {
      // はしらは cx の 列で いちばん 南の inner の 1 つ 南（へり）。わきみずは 下が はしら なので 北（いけの 上）へ 出す
      let zi = z1;
      while (zi >= z0 && hitOf(p, cx, zi)?.kind !== 'inner') zi--;
      const fz = zi + 1;
      // はしらの 東・西・南の 地面が へりより 高いと、はしらの 横の 面が 地形の 小ブロックと かさなって ぬける（seeThrough）。そのときは 滝なし
      const low = (x: number, z: number): boolean => hitOf(p, x, z) !== null || t.base(x, z) <= level;
      if (low(cx - 1, fz) && low(cx + 1, fz) && low(cx, fz + 1)) p.fall = { x: cx, z: fz, top: level + fallH };
    }
    return p;
  }

  private slope(p: LiquidPond): number {
    let lo = Infinity;
    let hi = -Infinity;
    for (let z = p.z0 - 1; z <= p.z1 + 1; z++) {
      for (let x = p.x0 - 1; x <= p.x1 + 1; x++) {
        const h = this.t.base(x, z);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    return hi - lo;
  }
}

function hitOf(p: LiquidPond, x: number, z: number): PondHit | null {
  if (x < p.x0 - 1 || x > p.x1 + 1 || z < p.z0 - 1 || z > p.z1 + 1) return null;
  const rx = (p.x1 - p.x0 + 1) / 2;
  const rz = (p.z1 - p.z0 + 1) / 2;
  const dx = x + 0.5 - (p.x0 + rx);
  const dz = z + 0.5 - (p.z0 + rz);
  if ((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) <= 1) return { kind: 'inner', pond: p };
  const ax = rx + 1;
  const az = rz + 1;
  if ((dx * dx) / (ax * ax) + (dz * dz) / (az * az) <= 1) return { kind: 'ring', pond: p };
  return null;
}

/** 滝の ブロック（はしら・わきみず・たきつぼ・落ちる 道の 空気） */
/** (x, z) が 滝の はしら（'pillar'）か 落ちる 道（'path'）か */
export function fallColumn(ponds: LiquidPonds, x: number, z: number): { kind: 'pillar' | 'path'; pond: LiquidPond } | null {
  const h = ponds.pondAt(x, z);
  const f = h?.pond.fall;
  if (!h || !f || f.x !== x) return null;
  if (f.z === z) return { kind: 'pillar', pond: h.pond };
  if (f.z - 1 === z) return { kind: 'path', pond: h.pond };
  return null;
}

export function fallBlocks(p: LiquidPond): { x: number; y: number; z: number; b: 'stone' | 'kokuyouseki' | 'wakimizu' | 'magma_wakimizu' | 'takitsubo' | 'air' }[] {
  const f = p.fall;
  if (f === null) return [];
  const out: { x: number; y: number; z: number; b: 'stone' | 'kokuyouseki' | 'wakimizu' | 'magma_wakimizu' | 'takitsubo' | 'air' }[] = [];
  // マグマの 滝の はしらは こくようせき（となりの マグマで こげない）
  const pillar = p.liquid === 'magma' ? 'kokuyouseki' : 'stone';
  for (let y = p.level + 1; y < f.top; y++) out.push({ x: f.x, y, z: f.z, b: pillar });
  out.push({ x: f.x, y: f.top, z: f.z, b: p.liquid === 'magma' ? 'magma_wakimizu' : 'wakimizu' });
  for (let y = p.level; y <= f.top + 1; y++) out.push({ x: f.x, y, z: f.z - 1, b: 'air' }); // 落ちる 道（はっぱ など を どける）
  out.push({ x: f.x, y: p.level - p.depth - 2, z: f.z - 1, b: 'takitsubo' }); // くぼみの 底（terrain.ts の 高さと 同じ）
  return out;
}

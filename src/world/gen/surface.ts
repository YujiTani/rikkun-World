import { SEA_Y, WORLD_HEIGHT } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { mouthAirRange, mouthsNear } from './mouths';
import { terrainFor, type Terrain } from './terrain';
import { plantsOfChunk } from './plants';
import { treesInRect, type Tree } from './trees';

/**
 * ブロックを読みこまずに出す「地面・木・たいまつ」の答え（VOX-D G2）。
 * 高さ（terrainFor(seed).height）・木（treesInRect）・洞くつの口・たいまつの場所から、generateChunk で作る列と同じ答えを出す。
 * ふるい畑・やせいの やさい の置き場所を、列を読みこまずに決めるために使う。
 */

export type VBlock = 'air' | 'water' | 'solid' | 'log' | 'leaves' | 'torch' | 'plant';

export interface Surface {
  /** 地面（き・はっぱ・みず・たいまつを のぞく いちばん上のブロック）の y */
  ground(x: number, z: number): number;
  /** 地面のブロックが くさ か */
  groundIsGrass(x: number, z: number): boolean;
  /** 地面の上に なにか（木・たいまつ）が あるか */
  covered(x: number, z: number): boolean;
  /** その列の いちばん上のブロックが 木（みき・はっぱ）か */
  treeCover(x: number, z: number): boolean;
  /** そのマスのブロックの種類 */
  blockAt(x: number, y: number, z: number): VBlock;
}

const AIR_Y = WORLD_HEIGHT;

class SurfaceImpl implements Surface {
  private readonly T: Terrain;
  private readonly torch: { x: number; y: number; z: number };
  private readonly treeCache = new Map<number, Tree[]>();
  private readonly plantCache = new Map<number, Map<number, number>>();

  constructor(seed: number) {
    this.T = terrainFor(seed);
    const sp = this.T.spawn();
    this.torch = { x: sp.x + C.startTorch.dx, y: sp.h + 1, z: sp.z + C.startTorch.dz };
  }

  /** (x, z) のまわり 2 マスにある木（みきの列）。列ごとに覚える */
  private treesNear(x: number, z: number): Tree[] {
    const k = (x >> 3) * 1000003 + (z >> 3);
    let t = this.treeCache.get(k);
    if (t === undefined) {
      // 8×8 の区画ごとに、そのまわり 2 マスをふくめて集める
      const x0 = (x >> 3) * 8;
      const z0 = (z >> 3) * 8;
      t = treesInRect(this.T, x0 - 5, z0 - 5, x0 + 12, z0 + 12);
      if (this.treeCache.size > 4000) this.treeCache.clear();
      this.treeCache.set(k, t);
    }
    return t;
  }

  /** (x, z) の はな・すすき・たけ の高さ（なければ 0）。列（16×16）ごとに覚える */
  private plantHeight(x: number, z: number): number {
    const cx = x >> 4;
    const cz = z >> 4;
    const k = cx * 1000003 + cz;
    let m = this.plantCache.get(k);
    if (m === undefined) {
      m = new Map();
      for (const p of plantsOfChunk(this.T, cx, cz)) m.set(p.x * 100003 + p.z, p.height);
      if (this.plantCache.size > 400) this.plantCache.clear();
      this.plantCache.set(k, m);
    }
    return m.get(x * 100003 + z) ?? 0;
  }

  /** 口が空気にする y のはんい（なければ null） */
  private mouthRange(x: number, z: number): [number, number] | null {
    for (const m of mouthsNear(this.T, x >> 4, z >> 4)) {
      const r = mouthAirRange(m, x, z);
      if (r !== null) return r;
    }
    return null;
  }

  ground(x: number, z: number): number {
    const h = this.T.height(x, z);
    const r = this.mouthRange(x, z);
    if (r !== null && r[1] >= h) return r[0] - 1; // さか道の口: 床の下の いし
    return h;
  }

  groundIsGrass(x: number, z: number): boolean {
    const h = this.T.height(x, z);
    const r = this.mouthRange(x, z);
    // さか道の床は もとの地層の途中（床が 地面の高さのままなら くさ）
    if (r !== null && r[1] >= h && r[0] - 1 !== h) return false;
    if (this.T.inRock(x, z)) return false;
    return h >= SEA_Y + C.strata.landFrom && this.T.topBlock(x, z, h) === 'grass';
  }

  /** その列に 木のブロックが あるか（みきが先、はっぱは あと。chunk.ts の placeTrees と同じ形） */
  private treeBlock(x: number, y: number, z: number): 'log' | 'leaves' | null {
    const trees = this.treesNear(x, z);
    for (const t of trees) {
      const w = t.big ? 2 : 1;
      const dx = x - t.x;
      const dz = z - t.z;
      if (dx >= 0 && dx < w && dz >= 0 && dz < w && y > t.y && y <= t.y + t.trunk) return 'log';
    }
    for (const t of trees) {
      const dx = x - t.x;
      const dz = z - t.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const top = t.y + t.trunk;
      if (t.big) {
        if (y < top - 3 || y > top + 2) continue;
        const rr = y >= top + 2 ? 1 : y >= top + 1 ? 2 : y <= top - 3 ? 2 : 3;
        if (dx < -rr || dx > rr + 1 || dz < -rr || dz > rr + 1) continue;
        const fx = dx - 0.5;
        const fz = dz - 0.5;
        if (fx * fx + fz * fz > (rr + 0.4) * (rr + 0.4)) continue;
        return 'leaves';
      }
      if (t.leaves === 'matsu_leaves') {
        const r = y === top - 2 ? 3 : y === top ? 2 : y === top + 1 ? 1 : -1;
        if (r < 0 || Math.abs(dx) > r || Math.abs(dz) > r || Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        return 'leaves';
      }
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
      if (y < top - 1 || y > top + 2) continue;
      const r = y <= top ? 2 : 1;
      if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
      if (y <= top && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      if (y === top + 2 && Math.abs(dx) + Math.abs(dz) > 1) continue;
      return 'leaves';
    }
    return null;
  }

  blockAt(x: number, y: number, z: number): VBlock {
    if (y < 0 || y >= AIR_Y) return y < 0 ? 'solid' : 'air';
    const h = this.T.height(x, z);
    const r = this.mouthRange(x, z);
    if (r !== null && y >= r[0] && y <= r[1]) return 'air';
    if (y <= h) return 'solid';
    const tb = this.treeBlock(x, y, z);
    if (tb !== null) return tb;
    if (x === this.torch.x && z === this.torch.z && y === this.torch.y) return 'torch';
    const ph = this.plantHeight(x, z);
    if (ph > 0 && y <= h + ph) {
      // たけは 木のブロックに ぶつかったら そこで止まる（chunk.ts の placePlants）
      let free = true;
      for (let yy = h + 1; yy < y && free; yy++) if (this.treeBlock(x, yy, z) !== null) free = false;
      if (free) return 'plant';
    }
    const pd = this.T.map.pondAt(x, z);
    if (pd !== null && pd.kind === 'inner' && y < pd.level) return 'water';
    return y <= SEA_Y ? 'water' : 'air';
  }

  covered(x: number, z: number): boolean {
    const g = this.ground(x, z);
    const h = this.T.height(x, z);
    if (h < SEA_Y) return true; // 水が かぶっている
    if (this.T.map.pondAt(x, z)?.kind === 'inner') return true; // いけの水
    if (this.plantHeight(x, z) > 0) return true;
    if (this.treeColumn(x, z, g)) return true;
    return x === this.torch.x && z === this.torch.z && this.torch.y > g;
  }

  /** この列に 木のブロック（みき・はっぱ）が 地面の上に あるか */
  private treeColumn(x: number, z: number, g: number): boolean {
    const trees = this.treesNear(x, z);
    for (const t of trees) {
      if (Math.abs(x - t.x) > 5 || Math.abs(z - t.z) > 5) continue;
      const top = t.y + t.trunk;
      for (let y = Math.max(g + 1, top - 3); y <= top + 2; y++) if (this.treeBlock(x, y, z) !== null) return true;
      if (x >= t.x && x < t.x + (t.big ? 2 : 1) && z >= t.z && z < t.z + (t.big ? 2 : 1) && t.y + 1 > g) return true;
    }
    return false;
  }

  treeCover(x: number, z: number): boolean {
    return this.treeColumn(x, z, this.ground(x, z));
  }
}

const cache = new Map<number, Surface>();

/** シードごとに 覚えておく */
export function surfaceFor(seed: number): Surface {
  let s = cache.get(seed);
  if (s === undefined) {
    if (cache.size >= 6) cache.delete(cache.keys().next().value as number);
    s = new SurfaceImpl(seed);
    cache.set(seed, s);
  }
  return s;
}

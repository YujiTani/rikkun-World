import { CHUNK_SIZE, SEA_Y } from '../../contracts';
import { floraOfChunk } from './flora';
import { farmFloraCleared } from './farmPlacement';
import { plantsOfChunk } from './plants';
import { levelAt, type SpacingLevel } from './spacing';
import { terrainFor, type Terrain } from './terrain';
import { treesOfChunk } from './trees';
import { countryAt, type CountryKind } from './biome';
import { GEN_CONFIG as C } from './config';

/**
 * 木・草花の 置き場所（間隔のきまり の あと）を 種類つきで 返す窓口（FLORA-75 §9。window.__rikkun.biome.plants など）。
 * 生成（generateChunk）と 同じ答え。読みこんでいない所でも 答える（生成の計算だけ）。
 */

export type PlantType = 'tree' | 'bigTree' | 'matsu' | 'momiji' | 'flower' | 'susuki' | 'take' | 'kusa' | 'nobana';

export interface PlacedPlant {
  type: PlantType;
  x: number;
  /** 木は みきの いちばん下（根もと）の y。草花は その物の マスの y（地面の すぐ上） */
  y: number;
  z: number;
}

const PLANT_TYPE = { susuki: 'susuki', bamboo: 'take', kusa: 'kusa', nobana: 'nobana' } as const;

/** 四角 [x0, x1] × [z0, z1]（ふくむ）の 木・はな・すすき・たけ・くさ・のばな（みきの列／草の列が 四角の中の物）。木は みき（大木は 北西）の位置 */
export function plantsInRect(seed: number, x0: number, z0: number, x1: number, z1: number): PlacedPlant[] {
  const T = terrainFor(seed);
  const out: PlacedPlant[] = [];
  const cleared = farmFloraCleared(seed);
  for (let cz = Math.floor(z0 / CHUNK_SIZE); cz <= Math.floor(z1 / CHUNK_SIZE); cz++) {
    for (let cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) {
      const inside = (p: { x: number; z: number }): boolean => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1;
      for (const t of treesOfChunk(T, cx, cz)) {
        if (!inside(t)) continue;
        const type: PlantType = t.big === true ? 'bigTree' : t.leaves === 'matsu_leaves' ? 'matsu' : t.leaves === 'momiji_leaves' ? 'momiji' : 'tree';
        out.push({ type, x: t.x, y: t.y + 1, z: t.z });
      }
      const ground = (x: number, z: number): number => T.height(x, z);
      for (const p of plantsOfChunk(T, cx, cz)) {
        if (!inside(p)) continue;
        out.push({ type: p.id.startsWith('flower_') ? 'flower' : PLANT_TYPE[p.id as keyof typeof PLANT_TYPE], x: p.x, y: ground(p.x, p.z) + 1, z: p.z });
      }
      for (const p of floraOfChunk(T, cx, cz)) {
        if (!inside(p) || cleared(p.x, p.z)) continue;
        out.push({ type: p.id === 'kusa' ? 'kusa' : 'nobana', x: p.x, y: ground(p.x, p.z) + 1, z: p.z });
      }
    }
  }
  return out;
}

/** 列 (cx, cz) の くさ・のばな の本数と 三角形 */
export function floraOfColumn(seed: number, cx: number, cz: number): { kusa: number; nobana: number; tris: number } {
  const cleared = farmFloraCleared(seed);
  let kusa = 0;
  let nobana = 0;
  for (const p of floraOfChunk(terrainFor(seed), cx, cz)) {
    if (cleared(p.x, p.z)) continue;
    if (p.id === 'kusa') kusa++;
    else nobana++;
  }
  return { kusa, nobana, tris: (kusa + nobana) * 8 };
}

/**
 * 段 level の場所をさがす（`from`（ふだんは スタート）から いちばん近い、まわり 3×3 列（48×48）が ぜんぶ その段で、
 * kind を わたしたら 3×3 列が ぜんぶ その国（e ≥ blend）の 場所の まん中。立てる 陸（くさ）の場所だけ）。4096 以内に なければ null
 */
export function findSpacing(
  seed: number,
  level: SpacingLevel,
  opts: { from?: { x: number; z: number }; kind?: CountryKind } = {},
): { x: number; z: number } | null {
  const T: Terrain = terrainFor(seed);
  const sp = T.spawn();
  const from = opts.from ?? { x: sp.x, z: sp.z };
  const ok = (cx: number, cz: number): boolean => {
    // 3×3 列（48×48）が ぜんぶ その段（段は 96 のノイズ → 8 おきに 見れば たりる）。まん中から 見て すぐ だめな所を 見つける
    const x0 = (cx - 1) * CHUNK_SIZE;
    const z0 = (cz - 1) * CHUNK_SIZE;
    // 立てる 陸（くさの地面）であること: 3×3 列の 各列の まん中が 水でも すなでも ない
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const x = x0 + i * CHUNK_SIZE + 8;
        const z = z0 + j * CHUNK_SIZE + 8;
        const h = T.height(x, z);
        if (h < SEA_Y + C.strata.landFrom || T.topBlock(x, z, h) !== 'grass' || T.map.pondAt(x, z) !== null) return false;
      }
    }
    const pts = [24, 0, 47, 8, 16, 32, 40];
    for (const j of pts) {
      for (const i of pts) {
        const x = x0 + i;
        const z = z0 + j;
        if (levelAt(T, x, z) !== level) return false;
        if (opts.kind !== undefined) {
          const c = countryAt(seed, x, z);
          if (c.kind !== opts.kind || c.e < C.biome.blend) return false;
        }
      }
    }
    return true;
  };
  const c0x = Math.floor(from.x / CHUNK_SIZE);
  const c0z = Math.floor(from.z / CHUNK_SIZE);
  const maxR = Math.ceil(4096 / CHUNK_SIZE) + 1;
  let best: { cx: number; cz: number; d: number } | null = null;
  for (let r = 0; r <= maxR; r++) {
    // 輪 r の点は 少なくとも (r − 1) × 16 はなれる → これより 遠ければ もう 近い点は ない
    if (best !== null && (r - 1) * CHUNK_SIZE > best.d) break;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = c0x + dx;
        const cz = c0z + dz;
        const d = Math.hypot(cx * CHUNK_SIZE + 8 - from.x, cz * CHUNK_SIZE + 8 - from.z);
        if (d > 4096) continue;
        if ((best === null || d < best.d) && ok(cx, cz)) best = { cx, cz, d };
      }
    }
  }
  return best === null ? null : { x: best.cx * CHUNK_SIZE + 8, z: best.cz * CHUNK_SIZE + 8 };
}

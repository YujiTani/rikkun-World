import { CHUNK_SIZE, SEA_Y, type BlockId } from '../../contracts';
import { defOf, newSample, type BiomeSample } from './biome';
import { GEN_CONFIG as C } from './config';
import { nearMouth } from './mouths';
import { hash01, subSeed } from './random';
import { terrainFor, type Terrain } from './terrain';
import { treesOfChunk } from './trees';

/**
 * 国の草の上の物（はな・すすき・たけ）。1 列（16×16）ごとに、シード付きの順で 上限（cap）まで置く。
 * 位置は (seed, x, z) の乱数だけで決まる → 作る順に関係しない。
 */

export interface Plant {
  x: number;
  z: number;
  id: BlockId;
  /** 積む高さ（たけ 4〜7。ほかは 1） */
  height: number;
}

const FLOWERS: readonly BlockId[] = ['flower_y', 'flower_o', 'flower_p'];
let tmpSample: BiomeSample | null = null;

/** 列 (cx, cz) に 置く草の上の物。上限をかけた後 */
export function plantsOfChunk(T: Terrain, cx: number, cz: number): Plant[] {
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const sP = subSeed(T.seed, 701);
  const sp = T.spawn();
  const tmp = (tmpSample ??= newSample());
  const found: { p: Plant; r: number; kind: 'flower' | 'susuki' | 'take'; cap: number }[] = [];
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = x0 + lx;
      const z = z0 + lz;
      const s = T.map.sampleInto(x, z, tmp);
      const def = defOf(s.kind);
      if (!def.flower && !def.susuki && !def.take) continue;
      const r = hash01(sP, x, z, 1);
      let kind: 'flower' | 'susuki' | 'take';
      if (def.flower && r < def.flower) kind = 'flower';
      else if (def.susuki && r < def.susuki) kind = 'susuki';
      else if (def.take && r < def.take) kind = 'take';
      else continue;
      // スタートのまわりと、4 方向の道の上には 置かない（木と同じ）
      const ax = Math.abs(x - sp.x);
      const az = Math.abs(z - sp.z);
      if (Math.max(ax, az) <= C.trees.startClear) continue;
      if (Math.max(ax, az) <= C.trees.corridorWithin && Math.min(ax, az) < C.trees.corridor) continue;
      if (kind === 'take' && T.map.onTakePath(x, z, s)) continue;
      if (nearMouth(T, x, z, 2)) continue; // 洞くつの口の さか道・へやを ふさがない
      const h = T.height(x, z);
      if (h < SEA_Y + C.strata.landFrom || T.topBlock(x, z, h) !== 'grass' || T.map.pondAt(x, z) !== null) continue;
      // たけ（かたい ブロック）は 横のとなりが 自分の根もとより高い地面だと 小ブロック地形の面と ぶつかる → 平らな所だけ
      if (kind === 'take' && (T.height(x + 1, z) > h || T.height(x - 1, z) > h || T.height(x, z + 1) > h || T.height(x, z - 1) > h)) continue;
      if (kind === 'flower') found.push({ p: { x, z, id: FLOWERS[Math.floor(hash01(sP, x, z, 2) * 3)]!, height: 1 }, r, kind, cap: def.cap?.flower ?? Infinity });
      else if (kind === 'susuki') found.push({ p: { x, z, id: 'susuki', height: 1 }, r, kind, cap: def.cap?.susuki ?? Infinity });
      else found.push({ p: { x, z, id: 'bamboo', height: 4 + Math.floor(hash01(sP, x, z, 3) * 4) }, r, kind, cap: def.cap?.take ?? Infinity });
    }
  }
  // 上限: 乱数の値が小さい順に 上限まで（列のかたよりが出ない）
  const out: Plant[] = [];
  for (const kind of ['flower', 'susuki', 'take'] as const) {
    const list = found.filter((f) => f.kind === kind).sort((u, v) => u.r - v.r);
    for (let k = 0; k < list.length; k++) if (k < list[k]!.cap) out.push(list[k]!.p);
  }
  return out;
}

/** 列 (cx, cz) に ゲームが 置く 木・たけ・はな・すすき の数（trees は 大木をふくむ） */
export function columnCounts(seed: number, cx: number, cz: number): { trees: number; bigTrees: number; take: number; flower: number; susuki: number } {
  const T = terrainFor(seed);
  const trees = treesOfChunk(T, cx, cz);
  const plants = plantsOfChunk(T, cx, cz);
  return {
    trees: trees.length,
    bigTrees: trees.filter((t) => t.big === true).length,
    take: plants.filter((p) => p.id === 'bamboo').length,
    flower: plants.filter((p) => p.id.startsWith('flower_')).length,
    susuki: plants.filter((p) => p.id === 'susuki').length,
  };
}

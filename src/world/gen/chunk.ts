import { CHUNK_SIZE, SEA_Y, SECTION_SIZE, WORLD_HEIGHT, type BlockId, type ChunkColumn, type SectionData } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SECTION_VOLUME, compactSection, sectionToArray, uniformSection } from '../sections';
import { COL_VOLUME, HW, LAYER } from './columnLayout';
import { GEN_CONFIG as C } from './config';
import { isRockCoal } from './features';
import { mouthAirRange, mouthsNear } from './mouths';
import { placeMineOres, type OreCluster } from './mineOres';
import { defOf } from './biome';
import { floraOfChunk } from './flora';
import { plantsOfChunk } from './plants';
import { hash01, subSeed, valueNoise3 } from './random';
import { Terrain, terrainFor } from './terrain';
import { treesInRect } from './trees';

/**
 * 列 1 つ（16×WORLD_HEIGHT×16）を作る（VOX-B）。`generateChunk(seed, cx, cz)` は同じ入力なら いつも同じ中身。
 * ほかの列を読まない（木・洞くつの口は まわり 3×3（口は 5×5）の列の物を考えて、自分の中のマスだけ書く。地下の 鉱石の かたまりは その列の 中だけ〔mineOres.ts〕）。
 */

const AIR = BLOCK_INDEX.air;
const GRASS = BLOCK_INDEX.grass;
const DIRT = BLOCK_INDEX.dirt;
const STONE = BLOCK_INDEX.stone;
const SAND = BLOCK_INDEX.sand;
const LOG = BLOCK_INDEX.log;
const COAL = BLOCK_INDEX.coal_ore;
const IRON = BLOCK_INDEX.iron_ore;
const WATER = BLOCK_INDEX.water;
const BEDROCK = BLOCK_INDEX.bedrock;
const START_TORCH = BLOCK_INDEX.start_torch;
const SNOW = BLOCK_INDEX.snow;
const LEAF_BLOCK = { leaves: BLOCK_INDEX.leaves, momiji_leaves: BLOCK_INDEX.momiji_leaves, matsu_leaves: BLOCK_INDEX.matsu_leaves } as const;

const N_SECTIONS = WORLD_HEIGHT / SECTION_SIZE;

const scratch = new Uint8Array(COL_VOLUME);

export interface BuiltChunk {
  /** ブロックの並び（作業用の入れもの。使いおわるまで次の build をしない） */
  blocks: Uint8Array;
  /** 高さの地図（18×18。(lz+1)*18 + (lx+1)） */
  heights: Int16Array;
}

// ------------------------------------------------------------------ 洞くつ（C1〜C3）

const caveNodeA = new Float32Array(5 * 5 * (WORLD_HEIGHT / 4 + 2));
const caveNodeB = new Float32Array(5 * 5 * (WORLD_HEIGHT / 4 + 2));

/** 洞くつの上限（この y まで空気にしてよい）。ふつう H−8、海の列は H−10 */
function caveLimit(h: number): number {
  return h <= SEA_Y - 1 ? h - C.caves.seaGap : h - C.caves.topGap;
}

function carveCaves(out: Uint8Array, T: Terrain, x0: number, z0: number, H: Int16Array): void {
  const K = C.caves;
  const limit = new Int16Array(LAYER);
  let top = -1;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const l = caveLimit(H[(lz + 1) * HW + lx + 1]!);
      limit[lz * CHUNK_SIZE + lx] = l;
      if (l > top) top = l;
    }
  }
  if (top < K.minY) return;
  const kMin = K.minY >> 2;
  const kMax = (top >> 2) + 1;
  const sA = subSeed(T.seed, 501);
  const sB = subSeed(T.seed, 502);
  const [ax, ay, az] = K.scaleA as [number, number, number];
  const [bx, by, bz] = K.scaleB as [number, number, number];
  // 4 ブロックおきの格子（世界の座標に合わせるので、となりの列と同じ値）
  const nodeA = caveNodeA;
  const nodeB = caveNodeB;
  for (let k = kMin; k <= kMax; k++) {
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 5; i++) {
        const n = (k * 5 + j) * 5 + i;
        const wx = x0 + i * 4;
        const wy = k * 4;
        const wz = z0 + j * 4;
        nodeA[n] = valueNoise3(sA, wx, wy, wz, ax, ay, az);
        nodeB[n] = valueNoise3(sB, wx, wy, wz, bx, by, bz);
      }
    }
  }
  const r = K.radius;
  const r2 = r * r;
  const lo = 0.5 - r;
  const hi = 0.5 + r;
  const carved = new Uint8Array(LAYER);
  for (let k = kMin; k < kMax; k++) {
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const n0 = (k * 5 + j) * 5 + i;
        const n1 = n0 + 25; // y が 1 つ上
        const cA = [nodeA[n0]!, nodeA[n0 + 1]!, nodeA[n0 + 5]!, nodeA[n0 + 6]!, nodeA[n1]!, nodeA[n1 + 1]!, nodeA[n1 + 5]!, nodeA[n1 + 6]!];
        let mn = Math.min(...cA);
        let mx = Math.max(...cA);
        if (mx < lo || mn > hi) continue;
        const cB = [nodeB[n0]!, nodeB[n0 + 1]!, nodeB[n0 + 5]!, nodeB[n0 + 6]!, nodeB[n1]!, nodeB[n1 + 1]!, nodeB[n1 + 5]!, nodeB[n1 + 6]!];
        mn = Math.min(...cB);
        mx = Math.max(...cB);
        if (mx < lo || mn > hi) continue;
        for (let dz = 0; dz < 4; dz++) {
          const fz = dz / 4;
          for (let dx = 0; dx < 4; dx++) {
            const fx = dx / 4;
            const lx = i * 4 + dx;
            const lz = j * 4 + dz;
            const lim = limit[lz * CHUNK_SIZE + lx]!;
            for (let dy = 0; dy < 4; dy++) {
              const y = k * 4 + dy;
              if (y > lim) break;
              const fy = dy / 4;
              const a = tri(cA, fx, fy, fz);
              const d1 = a - 0.5;
              if (d1 * d1 >= r2) continue;
              const b = tri(cB, fx, fy, fz);
              const d2 = b - 0.5;
              if (d1 * d1 + d2 * d2 >= r2) continue;
              out[y * LAYER + lz * CHUNK_SIZE + lx] = AIR;
              carved[lz * CHUNK_SIZE + lx] = 1;
            }
          }
        }
      }
    }
  }
  // C2: たてに 空気が 1 マスだけの所は いしで うめる（キャラが通れない すき間を作らない）
  for (let c = 0; c < LAYER; c++) {
    if (carved[c] === 0) continue;
    const lim = limit[c]!;
    for (let y = K.minY; y <= lim; y++) {
      if (out[y * LAYER + c] !== AIR) continue;
      const below = y === K.minY || out[(y - 1) * LAYER + c] !== AIR;
      const above = y === lim || out[(y + 1) * LAYER + c] !== AIR;
      if (below && above) out[y * LAYER + c] = STONE;
    }
  }
}

/** 8 つの角（x → z → y の順に 2×2×2）の 三重一次補間 */
function tri(c: number[], fx: number, fy: number, fz: number): number {
  const x00 = c[0]! + (c[1]! - c[0]!) * fx;
  const x10 = c[2]! + (c[3]! - c[2]!) * fx;
  const x01 = c[4]! + (c[5]! - c[4]!) * fx;
  const x11 = c[6]! + (c[7]! - c[6]!) * fx;
  const z0 = x00 + (x10 - x00) * fz;
  const z1 = x01 + (x11 - x01) * fz;
  return z0 + (z1 - z0) * fy;
}

// ------------------------------------------------------------------ 山の面の 見える鉱石（O4・O5）。地下の かたまりは mineOres.ts

/** 空気が 始まる y（水の下は 空気ではない） */
const airFrom = (h: number): number => (h < SEA_Y ? SEA_Y + 1 : h + 1);

/** O4・O5: 空気に面した いし（山・崖の面）の 4% が せきたん、y ≥ SEA_Y+40 では 1.5% が てつ */
function placeVisibleOres(out: Uint8Array, T: Terrain, x0: number, z0: number, H: Int16Array): void {
  const O = C.ores;
  const sV = subSeed(T.seed, 602);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const i = (lz + 1) * HW + lx + 1;
      const h = H[i]!;
      if (h < SEA_Y) continue;
      const a = Math.min(airFrom(H[i - 1]!), airFrom(H[i + 1]!), airFrom(H[i - HW]!), airFrom(H[i + HW]!), airFrom(h));
      let k = 0; // 国ごとの倍（いわやま 3 倍 など）。いしが 見えている列だけ しらべる
      for (let y = Math.max(1, a); y <= h; y++) {
        const o = y * LAYER + lz * CHUNK_SIZE + lx;
        if (out[o] !== STONE) continue;
        if (k === 0) k = defOf(T.biome(x0 + lx, z0 + lz).kind).visibleOre ?? 1;
        const r = hash01(sV, x0 + lx, z0 + lz, y);
        if (r < O.visibleCoal * k) out[o] = COAL;
        else if (y >= O.visibleIronFrom && r < (O.visibleCoal + O.visibleIron) * k) out[o] = IRON;
      }
    }
  }
}

// ------------------------------------------------------------------ 木（T1〜T2）

function placeTrees(out: Uint8Array, T: Terrain, x0: number, z0: number): void {
  // 大木のはっぱは みきから 4 マスまで出る
  const trees = treesInRect(T, x0 - 5, z0 - 5, x0 + CHUNK_SIZE + 4, z0 + CHUNK_SIZE + 4);
  if (trees.length === 0) return;
  // みきを先に書く（はっぱは 空気のところだけ。みきの勝ち）
  for (const t of trees) {
    const w = t.big ? 2 : 1;
    for (let dz = 0; dz < w; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const lx = t.x + dx - x0;
        const lz = t.z + dz - z0;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
        for (let y = t.y + 1; y <= t.y + t.trunk; y++) out[y * LAYER + lz * CHUNK_SIZE + lx] = LOG;
      }
    }
  }
  const put = (t: { x: number; z: number }, dx: number, dz: number, y: number, id: number): void => {
    const lx = t.x + dx - x0;
    const lz = t.z + dz - z0;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    const o = y * LAYER + lz * CHUNK_SIZE + lx;
    if (out[o] === AIR) out[o] = id;
  };
  for (const t of trees) {
    const top = t.y + t.trunk;
    const leaf = LEAF_BLOCK[t.leaves];
    if (t.big) {
      // 太い みき（2×2）の まわりに まるい はっぱ（半径 3）
      const R = 3;
      for (let y = top - 3; y <= top + 2; y++) {
        const rr = y >= top + 2 ? R - 2 : y >= top + 1 ? R - 1 : y <= top - 3 ? R - 1 : R;
        for (let dz = -rr; dz <= rr + 1; dz++) {
          for (let dx = -rr; dx <= rr + 1; dx++) {
            const fx = dx - 0.5;
            const fz = dz - 0.5;
            if (fx * fx + fz * fz > (rr + 0.4) * (rr + 0.4)) continue;
            put(t, dx, dz, y, leaf);
          }
        }
      }
      continue;
    }
    if (t.leaves === 'matsu_leaves') {
      // まつ: 平たい はっぱの段が 3 つ（下が広く、上がせまい）
      for (const [y, r] of [[top - 2, 3], [top, 2], [top + 1, 1]] as const) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
            put(t, dx, dz, y, leaf);
          }
        }
      }
      continue;
    }
    for (let y = top - 1; y <= top + 2; y++) {
      const r = y <= top ? 2 : 1;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (y <= top && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (y === top + 2 && Math.abs(dx) + Math.abs(dz) > 1) continue;
          put(t, dx, dz, y, leaf);
        }
      }
    }
  }
}

/** 草の上の はな・すすき・たけ・くさ・のばな（木の後。空気のところだけ） */
function placePlants(out: Uint8Array, T: Terrain, cx: number, cz: number, H: Int16Array): void {
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  // はな・すすき・たけ、そのあと くさ・のばな（先にある物が かち: 空気のところだけ）
  for (const list of [plantsOfChunk(T, cx, cz), floraOfChunk(T, cx, cz)]) {
  for (const p of list) {
    const lx = p.x - x0;
    const lz = p.z - z0;
    const h = H[(lz + 1) * HW + lx + 1]!;
    const id = BLOCK_INDEX[p.id];
    for (let k = 1; k <= p.height; k++) {
      const o = (h + k) * LAYER + lz * CHUNK_SIZE + lx;
      if (out[o] !== AIR) break;
      out[o] = id;
    }
  }
  }
}

// ------------------------------------------------------------------ 作る

/** ブロックを `scratch` に作る。使いおわるまで、次の buildBlocks をしない */
export function buildBlocks(seed: number, cx: number, cz: number, oreRec?: OreCluster[]): BuiltChunk {
  const T = terrainFor(seed);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const out = scratch;
  out.fill(0);

  const H = new Int16Array(HW * HW);
  let minH = Infinity;
  for (let j = 0; j < HW; j++) {
    for (let i = 0; i < HW; i++) {
      const h = T.height(x0 - 1 + i, z0 - 1 + j);
      H[j * HW + i] = h;
      if (i >= 1 && i <= CHUNK_SIZE && j >= 1 && j <= CHUNK_SIZE && h < minH) minH = h;
    }
  }

  // y=0 そこいし、その上を いしで うめる（地層より下の いちばん下の部分は まとめて）
  out.fill(BEDROCK, 0, LAYER);
  const solidTo = Math.max(1, minH - 8);
  out.fill(STONE, LAYER, (solidTo + 1) * LAYER);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const h = H[(lz + 1) * HW + lx + 1]!;
      // 地層は solidTo より上から書けば足りる（下はもう いし）
      const x = x0 + lx;
      const z = z0 + lz;
      writeStrata(out, lx, lz, h, T.inRock(x, z), solidTo + 1, T.topBlock(x, z, h));
      // かっぱの ぬま の いけ: 底から へりの高さの 1 つ下まで 水
      const pd = T.map.pondAt(x, z);
      if (pd !== null && pd.kind === 'inner') for (let y = h + 1; y < pd.level; y++) out[y * LAYER + lz * CHUNK_SIZE + lx] = WATER;
    }
  }

  carveCaves(out, T, x0, z0, H);
  placeVisibleOres(out, T, x0, z0, H);

  // はじまりの岩山の「見える せきたん」
  const rock = T.rock();
  if (rock.cx + rock.r >= x0 && rock.cx - rock.r < x0 + CHUNK_SIZE && rock.cz + rock.r >= z0 && rock.cz - rock.r < z0 + CHUNK_SIZE) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        if (Math.hypot(x - rock.cx, z - rock.cz) > rock.r) continue;
        const h = H[(lz + 1) * HW + lx + 1]!;
        for (let y = Math.max(1, rock.peakY - C.rock.visibleDepth); y <= h; y++) {
          if (isRockCoal(T, x, y, z)) out[y * LAYER + lz * CHUNK_SIZE + lx] = COAL;
        }
      }
    }
  }

  // 洞くつの口（さか道・へや）。足もとの下 2 マスは 洞くつのあなをふさいで、床が ぬけないようにする
  for (const m of mouthsNear(T, cx, cz)) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const r = mouthAirRange(m, x0 + lx, z0 + lz);
        if (r === null) continue;
        const base = lz * CHUNK_SIZE + lx;
        for (let y = Math.max(1, r[0] - 2); y < r[0]; y++) if (out[y * LAYER + base] === AIR) out[y * LAYER + base] = STONE;
        for (let y = r[0]; y <= r[1]; y++) out[y * LAYER + base] = AIR;
      }
    }
  }

  // 地下の 鉱石の かたまり（MINE-1A）。地形・ほらあな・洞くつの 口を 掘った あとに 置く（あとから 掘られて 切れない ように）
  placeMineOres(out, seed, cx, cz, H, oreRec);

  placeTrees(out, T, x0, z0);
  placePlants(out, T, cx, cz, H);

  // スタートの こわれない たいまつ（P5）
  const sp = T.spawn();
  const tx = sp.x + C.startTorch.dx - x0;
  const tz = sp.z + C.startTorch.dz - z0;
  if (tx >= 0 && tx < CHUNK_SIZE && tz >= 0 && tz < CHUNK_SIZE) out[(sp.h + 1) * LAYER + tz * CHUNK_SIZE + tx] = START_TORCH;

  return { blocks: out, heights: H };
}

/** 地層（S2〜S5）。h = 高さ、rock = 岩山の列。y < from の分は もう いしなので書かない。top = 陸の上のブロック（くさ・すな・ゆき・いし） */
export function writeStrata(out: Uint8Array, lx: number, lz: number, h: number, rock: boolean, from: number, top: BlockId = 'grass'): void {
  const S = C.strata;
  const base = lz * CHUNK_SIZE + lx;
  const lo = Math.max(1, from);
  const fill = (y0: number, y1: number, b: number): void => {
    for (let y = Math.max(lo, y0); y <= y1; y++) out[y * LAYER + base] = b;
  };
  if (rock || (h >= SEA_Y + S.landFrom && top === 'stone')) {
    fill(1, h, STONE);
    return;
  }
  if (h >= SEA_Y + S.landFrom) {
    const sandy = top === 'sand';
    const sub = sandy ? SAND : DIRT;
    fill(h, h, top === 'snow' ? SNOW : sandy ? SAND : GRASS);
    fill(h - 1, h - 1, sub);
    fill(h - 2, h - 2, h >= SEA_Y + S.dirt1From ? STONE : sub);
    fill(1, h - 3, STONE);
    return;
  }
  fill(h - 1, h, SAND);
  fill(1, h - 2, STONE);
  fill(h + 1, SEA_Y, WATER);
}

/** ブロックの並びを 22 個のセクションにする（1 種類だけのセクションは uniform） */
export function toSections(blocks: Uint8Array): SectionData[] {
  const sections: SectionData[] = new Array<SectionData>(N_SECTIONS);
  for (let sy = 0; sy < N_SECTIONS; sy++) {
    const o = sy * SECTION_VOLUME;
    const first = blocks[o]!;
    let same = true;
    for (let i = 1; i < SECTION_VOLUME; i++) {
      if (blocks[o + i] !== first) {
        same = false;
        break;
      }
    }
    sections[sy] = same ? uniformSection(first) : compactSection({ kind: 'full', data: blocks.slice(o, o + SECTION_VOLUME) });
  }
  return sections;
}

/** 列を 1 つ作る。同じ (seed, cx, cz) なら いつも同じ。作る順・ほかの列に関係しない */
export function generateChunk(seed: number, cx: number, cz: number): ChunkColumn {
  const b = buildBlocks(seed, cx, cz);
  return { cx, cz, sections: toSections(b.blocks) };
}

/** 列の中身の ハッシュ（FNV-1a。y, z, x の順）。同じ列なら同じ文字 */
export function columnHash(col: ChunkColumn): string {
  let h = 0x811c9dc5;
  for (const s of col.sections) {
    const arr = sectionToArray(s);
    for (let i = 0; i < SECTION_VOLUME; i++) {
      h ^= arr[i]!;
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEA_Y, WORLD_HEIGHT } from '../../contracts';
import { BLOCK_INDEX, BLOCK_TYPES } from '../blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { columnHash, generateChunk } from './chunk';
import { inMouthFootprint, mouthsNear } from './mouths';
import { countryAt } from './biome';
import { clearTerrainCache, terrainFor } from './terrain';
import { treesInRect } from './trees';

/**
 * VOX-B 受け入れ基準 1（同じ列）・2（列をまたぐ物）・3（ブロック）・4（地層）・6（鉱石）・7（洞くつ）・9（木）・22（決め打ちが残らない）。
 */

const AIR = BLOCK_INDEX.air;
const GRASS = BLOCK_INDEX.grass;
const DIRT = BLOCK_INDEX.dirt;
const STONE = BLOCK_INDEX.stone;
const SAND = BLOCK_INDEX.sand;
const LOG = BLOCK_INDEX.log;
const LEAVES = BLOCK_INDEX.leaves;
const COAL = BLOCK_INDEX.coal_ore;
const IRON = BLOCK_INDEX.iron_ore;
const WATER = BLOCK_INDEX.water;
const BEDROCK = BLOCK_INDEX.bedrock;

const SEEDS_20 = [20261012, ...Array.from({ length: 19 }, (_, i) => i + 1)];
const SEEDS_10 = SEEDS_20.slice(0, 10);
/** MINE-1A（docs/design/MINE-1.md §4.1）: 層の 下の はし。あさい 96〜地面・なかほど 52〜95・ふかい 1〜51（窓口 mine.layers() と 同じ。mineLayers.test.ts が 見る） */
const ASAI_MIN_Y = 96;
const NAKAHODO_MIN_Y = 52;

function flatten(sections: ReturnType<typeof generateChunk>['sections'], into: Uint8Array): Uint8Array {
  sections.forEach((s, sy) => into.set(sectionToArray(s), sy * SECTION_VOLUME));
  return into;
}

describe('基準 1: 同じ (seed, cx, cz) は同じ列', () => {
  const h = (seed: number, cx: number, cz: number): string => columnHash(generateChunk(seed, cx, cz));

  it('(0,0)→(1,0) と逆順で、列ごとのハッシュが同じ', () => {
    for (const seed of [20261012, 3]) {
      clearTerrainCache();
      const a0 = h(seed, 0, 0);
      const a1 = h(seed, 1, 0);
      clearTerrainCache();
      const b1 = h(seed, 1, 0);
      const b0 = h(seed, 0, 0);
      expect(b0).toBe(a0);
      expect(b1).toBe(a1);
      expect(a0).not.toBe(a1);
    }
  });

  it('3×3 を ばらばらの順で作っても 同じ', () => {
    const seed = 7;
    const cells: [number, number][] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cells.push([3 + dx, 4 + dz]);
    clearTerrainCache();
    const base = new Map(cells.map(([cx, cz]) => [`${cx},${cz}`, h(seed, cx, cz)]));
    const orders = [[4, 8, 0, 2, 6, 1, 7, 3, 5], [8, 7, 6, 5, 4, 3, 2, 1, 0], [2, 0, 5, 1, 8, 3, 6, 4, 7]];
    for (const order of orders) {
      clearTerrainCache();
      for (const i of order) {
        const [cx, cz] = cells[i]!;
        expect(h(seed, cx, cz), `順 ${order.join('')} (${cx},${cz})`).toBe(base.get(`${cx},${cz}`));
      }
    }
  });

  it('負の座標・±30,000（cx ±1875）でも動き、同じ', () => {
    for (const [cx, cz] of [[-1, -1], [-1875, 1875], [1875, -1875], [-5, 0], [0, -7]] as const) {
      clearTerrainCache();
      const col = generateChunk(20261012, cx, cz);
      expect(col.cx).toBe(cx);
      expect(col.cz).toBe(cz);
      expect(col.sections).toHaveLength(WORLD_HEIGHT / 16);
      const a = columnHash(col);
      clearTerrainCache();
      expect(h(20261012, cx, cz)).toBe(a);
    }
  });

  it('ちがう seed はちがう', () => {
    expect(h(1, 2, 2)).not.toBe(h(2, 2, 2));
    expect(h(20261012, 5, 5)).not.toBe(h(20261013, 5, 5));
  });

  it('1 列の同じ呼び出しは 全部のセクションが 同じ（作る順に頼らない）', () => {
    clearTerrainCache();
    const a = generateChunk(11, 4, 4);
    const b = generateChunk(11, 4, 4);
    a.sections.forEach((s, i) => expect(sectionToArray(s)).toEqual(sectionToArray(b.sections[i]!)));
  });
});

describe('基準 2: 列をまたぐ 木・岩山・洞くつの口は、となりを先に作っても後に作っても 同じ形', () => {
  it('64 列を 行きと逆の順で作っても ハッシュが同じ（seed 既定）', () => {
    const seed = 20261012;
    const order: [number, number][] = [];
    for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) order.push([cx, cz]);
    clearTerrainCache();
    const fwd = order.map(([cx, cz]) => columnHash(generateChunk(seed, cx, cz)));
    clearTerrainCache();
    const back: string[] = new Array(order.length);
    for (let i = order.length - 1; i >= 0; i--) back[i] = columnHash(generateChunk(seed, order[i]![0], order[i]![1]));
    expect(back).toEqual(fwd);
  });

  it('列のはしに立つ木の はっぱは、となりの列にも はみ出して 書かれる', () => {
    let checked = 0;
    for (const seed of SEEDS_10) {
      const T = terrainFor(seed);
      for (let cz = 0; cz < 8 && checked < 6; cz++) {
        for (let cx = 0; cx < 7 && checked < 6; cx++) {
          const x0 = cx * 16;
          // 右のはし（lx = 14, 15）に みきがある木
          const t = treesInRect(T, x0 + 14, cz * 16, x0 + 15, cz * 16 + 15)[0];
          if (!t) continue;
          const here = flatten(generateChunk(seed, cx, cz).sections, new Uint8Array(WORLD_HEIGHT * 256));
          const next = flatten(generateChunk(seed, cx + 1, cz).sections, new Uint8Array(WORLD_HEIGHT * 256));
          const lz = t.z - cz * 16;
          expect(here[((t.y + 1) * 16 + lz) * 16 + (t.x - x0)]).toBe(LOG);
          // みきの高さ −1 の はっぱ（半径 2）が となりの列にあるはず
          const top = t.y + t.trunk;
          let leavesNext = 0;
          for (let dz = -2; dz <= 2; dz++) {
            const z = lz + dz;
            if (z < 0 || z > 15) continue;
            for (let dx = 1; dx <= 2; dx++) {
              const lx = t.x + dx - (x0 + 16);
              if (lx < 0 || lx > 15) continue;
              if (next[(top * 16 + z) * 16 + lx] === LEAVES) leavesNext++;
            }
          }
          if (t.x - x0 >= 14) expect(leavesNext).toBeGreaterThan(0);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it('洞くつの口が 列をまたぐ seed が ある（またいでも 順に頼らない）', () => {
    let crossing = 0;
    for (const seed of SEEDS_20) {
      const T = terrainFor(seed);
      for (const m of mouthsNear(T, 3, 3, 5)) {
        // 入り口の列と へやの列がちがう
        if (m.x >> 4 !== m.room.x >> 4 || m.z >> 4 !== m.room.z >> 4) crossing++;
      }
    }
    expect(crossing).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------

interface Stats {
  chunks: number;
  coal: number;
  iron: number;
  /** MINE-1A §4.1: 層ごとの てつの 数と、層ごとの マスの 数（地面より 下） */
  ironAsai: number;
  ironNakahodo: number;
  ironFukai: number;
  cellsAsai: number;
  cellsNakahodo: number;
  cellsFukai: number;
  /** せきたんが あさい層（y ≥ 96）の 外に ある 数 */
  coalOutsideAsai: number;
  strataBad: string[];
  caveAir: number;
  caveRange: number;
  caveAirOcean: number;
  caveRangeOcean: number;
  caveAbove: string[];
  gaps: number;
  grassTrees: number[];
  forestTrees: number[];
  trunkClose: number;
  trunks: number;
  bedrockBad: number;
  badId: number;
  topMismatch: number;
}

function fresh(): Stats {
  return {
    chunks: 0, coal: 0, iron: 0, ironAsai: 0, ironNakahodo: 0, ironFukai: 0, cellsAsai: 0, cellsNakahodo: 0, cellsFukai: 0, coalOutsideAsai: 0, strataBad: [], caveAir: 0, caveRange: 0,
    caveAirOcean: 0, caveRangeOcean: 0, caveAbove: [], gaps: 0, grassTrees: [], forestTrees: [], trunkClose: 0, trunks: 0, bedrockBad: 0, badId: 0, topMismatch: 0,
  };
}

describe('基準 3・4・6・7・9: 作った列のブロック（10 シード × 64 列）', () => {
  const st = fresh();
  const NB = BLOCK_TYPES.length;
  let blockChecked = 0;
  let sectionsOk = true;

  beforeAll(() => {
    const arr = new Uint8Array(WORLD_HEIGHT * 256);
    for (const seed of SEEDS_20) {
      const T = terrainFor(seed);
      const trunkSet = new Set<number>();
      const trunks: [number, number][] = [];
      // 読みこみ範囲の 64 列 ＋（10 シードは）海の列を 4 つ
      const list: [number, number][] = [];
      for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) list.push([cx, cz]);
      if (SEEDS_10.includes(seed)) {
        let seas = 0;
        for (let cz = -80; cz < 80 && seas < 4; cz += 3) {
          for (let cx = -80; cx < 80 && seas < 4; cx += 3) {
            let sea = 0;
            for (let k = 0; k < 16; k++) if (T.raw(cx * 16 + (k % 4) * 5, cz * 16 + (k >> 2) * 5) <= SEA_Y - 1) sea++;
            if (sea === 16) {
              list.push([cx, cz]);
              seas++;
            }
          }
        }
      }
      {
        for (const [cx, cz] of list) {
          const col = generateChunk(seed, cx, cz);
          if (col.sections.length !== WORLD_HEIGHT / 16) sectionsOk = false;
          flatten(col.sections, arr);
          blockChecked++;
          // 基準 3: y=0 は そこいし、番号は 範囲の中
          for (let i = 0; i < 256; i++) if (arr[i] !== BEDROCK) st.bedrockBad++;
          for (let i = 256; i < arr.length; i++) if (arr[i]! >= NB) st.badId++;
          if (!SEEDS_10.includes(seed)) continue;

          st.chunks++;
          const x0 = cx * 16;
          const z0 = cz * 16;
          const mouths = mouthsNear(T, cx, cz);
          let pureGrass = 0;
          let pureForest = 0;
          let trunkCount = 0;
          for (let lz = 0; lz < 16; lz++) {
            for (let lx = 0; lx < 16; lx++) {
              const x = x0 + lx;
              const z = z0 + lz;
              const H = T.height(x, z);
              const at = (y: number): number => arr[(y * 16 + lz) * 16 + lx]!;
              const onMouth = mouths.some((m) => inMouthFootprint(m, x, z, 1));
              const rock = T.inRock(x, z, 1);
              // 層ごとの マスの 数（MINE-1A §4.1: あさい 96〜地面・なかほど 52〜95・ふかい 1〜51）
              st.cellsAsai += Math.max(0, H - ASAI_MIN_Y + 1);
              st.cellsNakahodo += Math.max(0, Math.min(H, ASAI_MIN_Y - 1) - NAKAHODO_MIN_Y + 1);
              st.cellsFukai += Math.max(0, Math.min(H, NAKAHODO_MIN_Y - 1));
              // 鉱石の数え（列ぜんぶ）
              for (let y = 1; y < WORLD_HEIGHT; y++) {
                const b = at(y);
                if (b === COAL) {
                  st.coal++;
                  if (y < ASAI_MIN_Y) st.coalOutsideAsai++;
                } else if (b === IRON) {
                  if (y >= SEA_Y + 40) continue; // 見える てつ（O5）
                  st.iron++;
                  if (y >= ASAI_MIN_Y) st.ironAsai++;
                  else if (y >= NAKAHODO_MIN_Y) st.ironNakahodo++;
                  else st.ironFukai++;
                } else if (b === LOG && at(y - 1) !== LOG) {
                  trunkCount++;
                  trunkSet.add(x * 100000 + z);
                  trunks.push([x, z]);
                }
              }
              // #184: 草原 → はらっぱ、森 → もり（境目 e < blend は のぞく）
              const bio = countryAt(seed, x, z);
              const raw = T.raw(x, z);
              if (raw >= SEA_Y + 2 && raw < SEA_Y + 70 && !rock && bio.e >= 14) {
                if (bio.kind === 'harappa') pureGrass++;
                else if (bio.kind === 'mori') pureForest++;
              }
              if (onMouth || rock) continue;
              // 基準 4: 地層
              const bad = (why: string): void => {
                if (st.strataBad.length < 8) st.strataBad.push(`seed ${seed} (${x},${z}) H=${H} ${why}`);
              };
              // #184: 陸の地面は くさ のほかに すな（すなはま）・ゆき（ゆきやま）・いし（いわやま・てんぐ・山の上）がある。
              // くさ の列は 今のまま（つち 1〜2 まい → いし）。それ以外は 上が すな・ゆき・いし のどれかで、その下 d3〜7 は 地面のブロックか いし・鉱石
              if (H >= SEA_Y + 2) {
                const topB = at(H);
                if (topB === GRASS) {
                  if (at(H - 1) !== DIRT) bad(`dirt ${at(H - 1)}`);
                  const second = at(H - 2);
                  if (H >= SEA_Y + 50 ? second !== STONE && second !== COAL && second !== IRON && second !== DIRT : second !== DIRT) bad(`dirt2 ${second}`);
                } else if (topB !== SAND && topB !== STONE && topB !== BLOCK_INDEX.snow) bad(`top ${topB}`);
                for (let d = 3; d <= 7; d++) {
                  const b = at(H - d);
                  if (b !== STONE && b !== COAL && b !== IRON && b !== DIRT && b !== SAND && b !== BLOCK_INDEX.snow) bad(`under d${d}=${b}`);
                }
              } else if (H >= SEA_Y) {
                if (at(H) !== SAND || at(H - 1) !== SAND) bad(`浜 ${at(H)} ${at(H - 1)}`);
                for (let d = 2; d <= 7; d++) {
                  const b = at(H - d);
                  if (b !== STONE && b !== COAL && b !== IRON) bad(`浜の下 d${d}=${b}`);
                }
              } else {
                if (at(H) !== SAND || at(H - 1) !== SAND) bad(`海の底 ${at(H)} ${at(H - 1)}`);
                for (let y = H + 1; y <= SEA_Y; y++) if (at(y) !== WATER) bad(`水 y${y}=${at(y)}`);
                if (at(SEA_Y + 1) !== AIR) bad('水の上');
                for (let d = 2; d <= 9; d++) {
                  const b = at(H - d);
                  if (b !== STONE && b !== COAL && b !== IRON) bad(`海の下 d${d}=${b}`);
                }
              }
              // 基準 7: 洞くつ
              const ocean = H <= SEA_Y - 1;
              const lim = ocean ? H - 10 : H - 8;
              for (let y = 8; y <= lim; y++) {
                const air = at(y) === AIR;
                if (ocean) {
                  st.caveRangeOcean++;
                  if (air) st.caveAirOcean++;
                } else {
                  st.caveRange++;
                  if (air) st.caveAir++;
                }
                if (air && at(y - 1) !== AIR && at(y + 1) !== AIR) st.gaps++;
              }
              for (let y = lim + 1; y <= H; y++) if (at(y) === AIR && st.caveAbove.length < 8) st.caveAbove.push(`seed ${seed} (${x},${z}) y=${y} H=${H}`);
              if (at(H + 1) === STONE) st.topMismatch++;
            }
          }
          if (pureGrass >= 230) st.grassTrees.push(trunkCount);
          if (pureForest >= 230) st.forestTrees.push(trunkCount);
        }
      }
      if (SEEDS_10.includes(seed)) {
        st.trunks += trunks.length;
        // 大木（みき 2×2）の 4 マスは 1 本。となりあう（チェビシェフ 1）マスは 同じ木として まとめ、別の木どうしだけ 数える
        const parent = new Map<number, number>();
        const key = (x: number, z: number): number => x * 100000 + z;
        const find = (k: number): number => {
          let r = k;
          while (parent.get(r) !== r) r = parent.get(r)!;
          return r;
        };
        for (const [x, z] of trunks) parent.set(key(x, z), key(x, z));
        for (const [x, z] of trunks) {
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (parent.has(key(x + dx, z + dz))) parent.set(find(key(x, z)), find(key(x + dx, z + dz)));
          }
        }
        for (const [x, z] of trunks) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              if ((dx !== 0 || dz !== 0) && trunkSet.has(key(x + dx, z + dz)) && find(key(x, z)) !== find(key(x + dx, z + dz))) st.trunkClose++;
            }
          }
        }
      }
    }
    if (process.env.STATS_OUT) {
      const avg = (a: number[]): number => a.reduce((p, c) => p + c, 0) / Math.max(1, a.length);
      writeFileSync(
        process.env.STATS_OUT,
        JSON.stringify({ ...st, strataBad: st.strataBad.slice(0, 5), grassAvg: avg(st.grassTrees), forestAvg: avg(st.forestTrees), nGrass: st.grassTrees.length, nForest: st.forestTrees.length, coalPer: st.coal / st.chunks, ironPer: st.iron / st.chunks, caveFrac: (st.caveAir + st.caveAirOcean) / (st.caveRange + st.caveRangeOcean), land: st.caveAir / st.caveRange, ocean: st.caveAirOcean / Math.max(1, st.caveRangeOcean), grassTrees: undefined, forestTrees: undefined }, null, 1),
      );
    }
  }, 240000);

  it('基準 3: 22 セクション・y=0 は そこいし・番号は 範囲の中（20 シード × 64 列）', () => {
    expect(blockChecked).toBeGreaterThanOrEqual(20 * 64);
    expect(sectionsOk).toBe(true);
    expect(st.bedrockBad).toBe(0);
    expect(st.badId).toBe(0);
  });

  it('基準 4: 地層（くさ・つち・つち か いし・いし か 鉱石 ／ 浜 ／ 海 ／ 山の上）', () => {
    expect(st.strataBad).toEqual([]);
  });

  it('基準 6（MINE-1A §4.1・§4.2）: せきたん・てつは 今の 約 3 倍。せきたんは あさい層（y ≥ 96）だけ・てつは 3 つの 層とも。ふかいほど こい', () => {
    // 前〔VOX-B〕は せきたん 1 列 24〜40・てつ 16〜30（せきたん y ≥ 80・てつ y ≤ 136）。今は 表〔§4.2〕で 1 列 ぜんぶ せきたん 約 90・てつ 約 74。
    // ここは 海の 列・山の 列も まざる 全部の 列の 平均 なので ゆるく 見る（はらっぱ・もりの 陸の 列で 表と くらべるのは mineOres.test.ts の A2）
    const coal = st.coal / st.chunks;
    const iron = st.iron / st.chunks;
    expect(coal).toBeGreaterThanOrEqual(60);
    expect(coal).toBeLessThanOrEqual(130);
    expect(iron).toBeGreaterThanOrEqual(45);
    expect(iron).toBeLessThanOrEqual(105);
    expect(st.coalOutsideAsai).toBe(0);
    expect(st.ironAsai).toBeGreaterThan(0);
    expect(st.ironNakahodo).toBeGreaterThan(0);
    expect(st.ironFukai).toBeGreaterThan(0);
    // 深い方がこい（1 マスあたり）
    const asai = st.ironAsai / st.cellsAsai;
    expect(st.ironNakahodo / st.cellsNakahodo).toBeGreaterThan(asai);
    expect(st.ironFukai / st.cellsFukai).toBeGreaterThan(asai);
  });

  it('基準 7: 洞くつ（いしの 3〜5% が空気・H−7 より上に空気なし・たてに 1 マスだけの空気なし）', () => {
    const frac = (st.caveAir + st.caveAirOcean) / (st.caveRange + st.caveRangeOcean);
    expect(frac).toBeGreaterThanOrEqual(0.03);
    expect(frac).toBeLessThanOrEqual(0.05);
    expect(st.caveAbove).toEqual([]);
    expect(st.gaps).toBe(0);
    expect(st.caveRangeOcean).toBeGreaterThan(1000);
    // 海の列は y ≤ H−10 だけ: 上の st.caveAbove が見る
  });

  it('基準 9: 木は 草原の陸 1 列 0.3〜2.0 本、森 平均 0.3〜3 本（FLORA-75 §4.3 の実測 0.4〜0.6 に置きかえ）。みきどうしは チェビシェフ 3 以上', () => {
    const avg = (a: number[]): number => a.reduce((p, c) => p + c, 0) / a.length;
    expect(st.grassTrees.length).toBeGreaterThan(20);
    expect(st.forestTrees.length).toBeGreaterThan(10);
    expect(avg(st.grassTrees)).toBeGreaterThanOrEqual(0.3); // FLORA-75: 間隔のきまりで 前の 1.0 から へる（はらっぱ 実測 0.6）
    expect(avg(st.grassTrees)).toBeLessThanOrEqual(2.0);
    expect(avg(st.forestTrees)).toBeGreaterThanOrEqual(0.3); // FLORA-75 §4.3: もり 0.4・おおきな 0.5。前の 6.5 は #184-AC9 の置きかえ
    expect(avg(st.forestTrees)).toBeLessThanOrEqual(3);
    expect(st.trunks).toBeGreaterThan(150); // FLORA-75: 木が へる（前は 841 本）
    expect(st.trunkClose).toBe(0);
  });
});

describe('基準 22: 高さ・海の決め打ちが 残らない', () => {
  function walk(dir: string, out: string[]): void {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (p.endsWith(join('src', 'proto'))) continue;
        walk(p, out);
      } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
    }
  }
  it('src で WORLD_SIZE.y・GEN_CONFIG.seaH・waterY を使う所がない（src/proto と テストは除く）', () => {
    const files: string[] = [];
    walk(join(process.cwd(), 'src'), files);
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/WORLD_SIZE\.y|GEN_CONFIG\.seaH|waterY|\bseaH\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) hits.push(`${f}:${i + 1} ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

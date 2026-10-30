import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD_HEIGHT, type BlockId } from '../../contracts';
import { BLOCK_INDEX, blockIdFromIndex, BLOCK_TYPES } from '../blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { generateChunk } from './chunk';
import { createMineHook, type MineHook } from './mineHook';
import type { OreCluster } from './mineOres';
import { terrainFor } from './terrain';
import golden from './__fixtures__/mine1a-before.json';

/**
 * MINE-1A（docs/design/MINE-1.md）受け入れ基準 A2・A3・A4・A16: 鉱石の 量・見える 割合・かたまり（§4.2）。
 * MINE-1B（同 §4.2・§4.4）受け入れ基準 B6・B15: 新しい 鉱物 6 つ（ねんど・せっかいせき・ほたるいし・きんの いし・すいしょうの いし・ダイヤの いし）の 量と 層、ダイヤの かたまり。
 *   1B で 直した 1A の 確かめ: 鉱石の 見分けを「名前が `_ore` で 終わる」から「表 `oreTable()` の ブロック」に（ねんど・せっかいせき・ほたるいしは `_ore` で 終わらない）。
 *   A16 ⑥・⑧ は ダイヤいがい〔ダイヤは 1・2 こ が 60%・40%。B15 で 見る〕。⑤・窓口の 正直さ・置く 順は 新しい 鉱物も 数える。
 *
 * 数は 決め打ちせず、窓口 `mine.oreTable()`（§6.1）から 読む（#311）。窓口は 生成の 計算だけで 答える（`createMineHook({ seed })`）。
 *   oreTable()      → { layer, block, visible, all }[]
 *   columnOres(cx, cz) → { normal, layers: Record<layer, { stone, wall, ores: Record<BlockId, { all, visible }> }> }（生成した 中身を 数える）
 *   oreClusters(cx, cz) → { block, layer, target, cells: { x, y, z }[] }[]（その 列で 生成が 作った かたまり。cells の 数が 大きさ）
 *
 * 前の 作り方との くらべは `__fixtures__/mine1a-before.json`（MINE-1 の 前の main〔ac3c38d〕の 生成から 取った 物）:
 *   columns … 列ごとの ハッシュ（鉱石を いしに 読みかえた 列。地形・ふつうの ほらあな・洞くつの 口が 同じ かを 見る）
 *   surface … 山の 面の 見える 鉱石の 場所（[x, y, z, 1 = せきたん / 2 = てつ]）  rock … はじまりの 岩山の せきたん
 *   a2      … 数える 列（はらっぱ・もりの 陸の 列を シードごとに 64。鉱石の 数を くらべる 列）  old … その 列の 前の 平均
 *   mouth   … 洞くつの 口の ある 列（シードごとに 8）
 * 見本を 書きかえて 通さない（作り方の ほうを 直す）。
 *
 * 注意（テストの 準備の とき、ためしの 作り方で はかった 値と、それで 直った 仕様。#348）:
 *   面で くっついた かたまりは ばらまくより 露出が 2 割 ほど へる。ためしの 作り方〔表の ぜんぶ ÷ 3.0 こ の かたまりを 石の 中に 置く〕では
 *   見える が 表の 0.72〜0.83 倍・見える ÷ ぜんぶ が 2.5〜2.9%（前の ゲームは 3.0〜3.1%）で、仕様の 表〔約 3.5% の 見こみ〕と ずれた。
 *   PO の 決め〔見える 数は かえない・かべに 寄せない〕で、designer が 仕様 §4.2 の ぜんぶ を 見える ÷ 0.027 に 上げた
 *   〔89a481d。せきたん 90 → 119・てつ 10/32/32 → 13/41/41。見える は そのまま。A3 は 2.5〜5% → 2〜4%〕。
 *   このテストの 数は その 新しい 仕様に 合わせて ある（A2 は 表の 見える・ぜんぶ、A3 は 2〜4%、
 *   「前と くらべて」は 見える 約 3 倍・ぜんぶ 約 4 倍）。
 *   実装で 見える が 足りない ときも「かべに 寄せる」で 合わせない（かたまりを 置く 場所を かたよらせない）。
 *   合わない ときは ぜんぶ〔かたまりの 数〕を 見直すか、仕様の 数〔表か 幅〕の 相談を する。
 */

interface Golden {
  seeds: number[];
  columns: Record<string, [number, number, string][]>;
  surface: Record<string, [number, number, number, 1 | 2][]>;
  rock: Record<string, [number, number, number][]>;
  a2: Record<string, [number, number][]>;
  mouth: Record<string, [number, number][]>;
  old: { columns: number; coal: { visible: number; all: number }; iron: { visible: number; all: number } };
}
const G = golden as unknown as Golden;

const AIR = BLOCK_INDEX.air;
const STONE = BLOCK_INDEX.stone;
const COAL = BLOCK_INDEX.coal_ore;
const IRON = BLOCK_INDEX.iron_ore;
const WATER = BLOCK_INDEX.water;
type Layer = 'asai' | 'nakahodo' | 'fukai';
const LAYER_IDS: readonly Layer[] = ['asai', 'nakahodo', 'fukai'];
/** A2・A3 の はんい: せきたん・てつ（★の 鉱物は 1B の B6） */
const BLOCKS = ['coal_ore', 'iron_ore'] as const;

function flat(seed: number, cx: number, cz: number): Uint8Array {
  const out = new Uint8Array(WORLD_HEIGHT * 256);
  generateChunk(seed, cx, cz).sections.forEach((s, sy) => out.set(sectionToArray(s), sy * SECTION_VOLUME));
  return out;
}

const fnv = (arr: Uint8Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < arr.length; i++) {
    h ^= arr[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

/**
 * 鉱石（表 `oreTable()` の ブロックぜんぶ ＋ 山の 面の せきたん・てつ）。新しい 鉱物を 表に 足せば 自然に ふえる
 * （1B の ねんど・せっかいせき・ほたるいしは 名前が `_ore` で 終わらないので、名前の 終わりでは 決めない）
 */
const ORE_BLOCKS: readonly BlockId[] = [...new Set<BlockId>([...createMineHook({ seed: 1 }).oreTable().map((r) => r.block), 'coal_ore', 'iron_ore'])];
const ORE_INDEXES: ReadonlySet<number> = new Set(ORE_BLOCKS.map((b) => BLOCK_INDEX[b]));
/** 鉱石を いしに 読みかえる（sectionMesher.slice.test.ts の 読みかえも 同じ） */
const TO_STONE = new Uint8Array(BLOCK_TYPES.length).map((_, i) => (ORE_INDEXES.has(i) ? STONE : i));
const stoneHash = (arr: Uint8Array): string => {
  const a = new Uint8Array(arr.length);
  for (let i = 0; i < arr.length; i++) a[i] = TO_STONE[arr[i]!]!;
  return fnv(a);
};

// ------------------------------------------------------------------ A4: 形は かわらない

describe('A4: 形は かわらない（鉱石を いしに 読みかえた 列が MINE-1 の 前と 同じ）', () => {
  const cache = new Map<string, Uint8Array>();
  const col = (seed: number, cx: number, cz: number): Uint8Array => {
    const k = `${seed},${cx},${cz}`;
    let v = cache.get(k);
    if (!v) cache.set(k, (v = flat(seed, cx, cz)));
    return v;
  };
  const cellAt = (seed: number, x: number, y: number, z: number): number => col(seed, x >> 4, z >> 4)[(y * 16 + (z & 15)) * 16 + (x & 15)]!;

  it('シード 3 つ × はじまりの まわり・洞くつの 口・山の ある 列: 地形・ふつうの ほらあな・洞くつの 口が 同じ', () => {
    const bad: string[] = [];
    let n = 0;
    for (const seed of G.seeds) {
      for (const [cx, cz, h] of G.columns[String(seed)]!) {
        n++;
        const now = stoneHash(col(seed, cx, cz));
        if (now !== h) bad.push(`seed ${seed} 列 (${cx}, ${cz}): ${h} → ${now}`);
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(bad.slice(0, 8), `${bad.length} / ${n} 列が 前と ちがう`).toEqual([]);
  }, 60_000); // 列を 作る 時間は 手元でも 2 秒。回す 数が 多い ときの ゆとり（おそくて 落ちない）

  it('山の 面の 見える 鉱石は 前と 同じ 場所（同じ 鉱石）', () => {
    const bad: string[] = [];
    let n = 0;
    for (const seed of G.seeds) {
      for (const [x, y, z, kind] of G.surface[String(seed)]!) {
        n++;
        const want = kind === 1 ? COAL : IRON;
        const got = cellAt(seed, x, y, z);
        if (got !== want) bad.push(`seed ${seed} (${x}, ${y}, ${z}): ${blockIdFromIndex(want)} → ${blockIdFromIndex(got)}`);
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(bad.slice(0, 8), `${bad.length} / ${n} マスが 前と ちがう`).toEqual([]);
  }, 60_000);

  it('はじまりの 岩山の せきたんは 前と 同じ 場所', () => {
    const bad: string[] = [];
    let n = 0;
    for (const seed of G.seeds) {
      for (const [x, y, z] of G.rock[String(seed)]!) {
        n++;
        if (cellAt(seed, x, y, z) !== COAL) bad.push(`seed ${seed} (${x}, ${y}, ${z})`);
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(bad, `${bad.length} / ${n} マス`).toEqual([]);
  }, 60_000);
});

// ------------------------------------------------------------------ A2・A3・A16: はらっぱ・もりの 陸の 列

interface Sample {
  seed: number;
  cx: number;
  cz: number;
  mine: MineHook;
  ores: ReturnType<MineHook['columnOres']>;
  clusters: ReturnType<MineHook['oreClusters']>;
}
const samples: Sample[] = [];

beforeAll(() => {
  for (const seed of G.seeds) {
    const mine = createMineHook({ seed });
    for (const [cx, cz] of G.a2[String(seed)]!) {
      const ores = mine.columnOres(cx, cz);
      if (!ores.normal) continue; // 坑道・部屋が かかる 列は 数えない（1C・1D の あと）
      samples.push({ seed, cx, cz, mine, ores, clusters: mine.oreClusters(cx, cz) });
    }
  }
}, 240_000);

type OreCount = { all: number; visible: number };
const oreOf = (s: Sample, layer: Layer, block: string, key: 'all' | 'visible'): number => (s.ores.layers[layer]?.ores as Record<string, OreCount | undefined> | undefined)?.[block]?.[key] ?? 0;
const avg = (f: (s: Sample) => number): number => samples.reduce((p, s) => p + f(s), 0) / samples.length;

describe('A2: 鉱石の 量（せきたん・てつ。はらっぱ・もりの 陸の 列 × シード 3 つ × 64）', () => {
  const rows = () => createMineHook({ seed: G.seeds[0]! }).oreTable().filter((r) => (BLOCKS as readonly string[]).includes(r.block));

  it('数える 列が 十分 ある（normal の 列）', () => {
    expect(samples.length).toBeGreaterThan(150);
  });

  it('層ごとの 平均が oreTable() の 見える・ぜんぶ の 0.7〜1.4 倍（目安が 1 未満の 物は 0.6〜1.6 倍）', () => {
    const table = rows();
    // 1A の 表: あさい せきたん・てつ、なかほど てつ、ふかい てつ（§4.2）
    for (const [layer, block] of [['asai', 'coal_ore'], ['asai', 'iron_ore'], ['nakahodo', 'iron_ore'], ['fukai', 'iron_ore']] as const) {
      expect(table.find((r) => r.layer === layer && r.block === block), `表に ${layer} ${block}`).toBeDefined();
    }
    const bad: string[] = [];
    for (const r of table) {
      for (const key of ['visible', 'all'] as const) {
        const want = r[key];
        const got = avg((s) => oreOf(s, r.layer, r.block, key));
        const [lo, hi] = want < 1 ? [0.6, 1.6] : [0.7, 1.4];
        if (!(got >= want * lo && got <= want * hi)) bad.push(`${r.layer} ${r.block} ${key}: 平均 ${got.toFixed(2)}（表 ${want} の ${(got / want).toFixed(2)} 倍。ゆるし ${lo}〜${hi}）`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('せきたんは あさい だけ（なかほど・ふかいで 0）。表にも ない。てつは 3 つの 層に ある', () => {
    for (const layer of ['nakahodo', 'fukai'] as const) {
      expect(avg((s) => oreOf(s, layer, 'coal_ore', 'all')), `${layer} の せきたん`).toBe(0);
      expect(rows().some((r) => r.block === 'coal_ore' && r.layer === layer), `${layer} の せきたんの 行`).toBe(false);
    }
    for (const layer of LAYER_IDS) expect(avg((s) => oreOf(s, layer, 'iron_ore', 'all')), `${layer} の てつ`).toBeGreaterThan(0);
  });

  it('前の ゲームと くらべて（§4.2）: せきたん＋てつ の 見える は 約 3 倍・ぜんぶ は 約 4 倍（かたまりは 石に かくれる ので ぜんぶの ほうが 多く ふえる）', () => {
    const sum = (key: 'all' | 'visible') => avg((s) => LAYER_IDS.reduce((p, L) => p + BLOCKS.reduce((q, b) => q + oreOf(s, L, b, key), 0), 0));
    const before = { all: G.old.coal.all + G.old.iron.all, visible: G.old.coal.visible + G.old.iron.visible };
    // 約 3 倍 ＝ 2.5〜5 倍、約 4 倍 ＝ 3〜5.5 倍。表どおりだと この 列の 前の 平均〔見える 1.56・ぜんぶ 51.6〕に たいして 3.7 倍・4.2 倍
    const want = { visible: [2.5, 5], all: [3, 5.5] } as const;
    for (const key of ['visible', 'all'] as const) {
      const ratio = sum(key) / before[key];
      const [lo, hi] = want[key];
      expect(ratio, `${key}: 前 ${before[key].toFixed(2)} → 今 ${sum(key).toFixed(2)}（${lo}〜${hi} 倍の はず）`).toBeGreaterThanOrEqual(lo);
      expect(ratio, `${key}: 前 ${before[key].toFixed(2)} → 今 ${sum(key).toFixed(2)}（${lo}〜${hi} 倍の はず）`).toBeLessThanOrEqual(hi);
    }
  });
});

describe('A3: 見える ÷ ぜんぶ（かべに 寄せない。かたまりで 約 2.7%）', () => {
  it('せきたん・てつ とも 2〜4%', () => {
    for (const block of BLOCKS) {
      const visible = avg((s) => LAYER_IDS.reduce((p, L) => p + oreOf(s, L, block, 'visible'), 0));
      const all = avg((s) => LAYER_IDS.reduce((p, L) => p + oreOf(s, L, block, 'all'), 0));
      expect(all, `${block} の ぜんぶ`).toBeGreaterThan(0);
      expect(visible / all, `${block}: 見える ${visible.toFixed(2)} ÷ ぜんぶ ${all.toFixed(2)}`).toBeGreaterThanOrEqual(0.02);
      expect(visible / all, `${block}: 見える ${visible.toFixed(2)} ÷ ぜんぶ ${all.toFixed(2)}`).toBeLessThanOrEqual(0.04);
    }
  });
});

// ------------------------------------------------------------------ 窓口が 本当の 生成を 数えて いるか

describe('窓口の 正直さ: columnOres・oreClusters は 生成した 中身と 同じ（A2・A16 の 土台）', () => {
  const pick = (): Sample[] => G.seeds.flatMap((seed) => samples.filter((s) => s.seed === seed).slice(0, 4));

  it('columnOres の ぜんぶ は 層ごとの 鉱石ブロックの 数と 同じ', () => {
    const ls = createMineHook({ seed: G.seeds[0]! }).layers();
    for (const s of pick()) {
      const arr = flat(s.seed, s.cx, s.cz);
      for (const L of ls) {
        const top = L.maxY ?? WORLD_HEIGHT - 1;
        for (const block of ORE_BLOCKS) {
          const idx = BLOCK_INDEX[block];
          let n = 0;
          for (let y = L.minY; y <= top; y++) for (let i = 0; i < 256; i++) if (arr[y * 256 + i] === idx) n++;
          expect(oreOf(s, L.id, block, 'all'), `seed ${s.seed} 列 (${s.cx}, ${s.cz}) ${L.id} ${block}`).toBe(n);
        }
      }
    }
  });

  it('columnOres の 見える の 合計は 6 方向の となりが 地面より 下の 空気か 水 の 数と だいたい 同じ（±20%）', () => {
    let hook = 0;
    let mine = 0;
    for (const s of pick()) {
      const T = terrainFor(s.seed);
      const around = new Map<string, Uint8Array>();
      const get = (cx: number, cz: number): Uint8Array => {
        const k = `${cx},${cz}`;
        let v = around.get(k);
        if (!v) around.set(k, (v = flat(s.seed, cx, cz)));
        return v;
      };
      const arr = get(s.cx, s.cz);
      for (const L of LAYER_IDS) for (const b of ORE_BLOCKS) hook += oreOf(s, L, b, 'visible');
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const x = s.cx * 16 + lx;
          const z = s.cz * 16 + lz;
          for (let y = 1; y < WORLD_HEIGHT; y++) {
            const here = arr[(y * 16 + lz) * 16 + lx];
            if (!ORE_INDEXES.has(here!)) continue;
            for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
              const nx = x + dx;
              const ny = y + dy;
              const nz = z + dz;
              const nb = get(nx >> 4, nz >> 4)[(ny * 16 + (nz & 15)) * 16 + (nx & 15)];
              // となりの マスが 水、または その 列の 地形の 高さ 以下の 空気（ほらあな・口・坑道・部屋）
              if (nb === WATER || (nb === AIR && ny <= T.height(nx, nz))) {
                mine++;
                break;
              }
            }
          }
        }
      }
    }
    expect(mine).toBeGreaterThan(0);
    expect(hook).toBeGreaterThanOrEqual(mine * 0.8);
    expect(hook).toBeLessThanOrEqual(mine * 1.2);
  });

  it('oreClusters の どの マスも 実際に その 鉱石ブロック（窓口が 作り話を して いない）', () => {
    for (const s of pick()) {
      const arr = flat(s.seed, s.cx, s.cz);
      for (const c of s.clusters) {
        const want = BLOCK_INDEX[c.block] ?? -1;
        expect(want, `知らない 鉱石 ${c.block}`).toBeGreaterThan(0);
        for (const m of c.cells) {
          const got = arr[(m.y * 16 + (m.z - s.cz * 16)) * 16 + (m.x - s.cx * 16)];
          expect(got, `seed ${s.seed} (${m.x}, ${m.y}, ${m.z})`).toBe(want);
        }
      }
    }
  });
});

// ------------------------------------------------------------------ A16: かたまり

describe('A16: かたまり（§4.2。同じ 鉱石が 面で くっついた 2〜5 こ）', () => {
  const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  const key = (m: { x: number; y: number; z: number }): string => `${m.x},${m.y},${m.z}`;

  it('かたまりが 十分 ある（列が 0 でも かたまりが 0 でも 通らない ように）', () => {
    const n = samples.reduce((p, s) => p + s.clusters.length, 0);
    expect(n).toBeGreaterThan(300);
  });

  it('① マスが 面で つながる ② その 列・その 層の 中 ③ 大きさ 1〜target ④ 同じ 列の 同じ 鉱石の ほかの かたまりと 面で ふれない', () => {
    const bad: string[] = [];
    for (const s of samples) {
      const owner = new Map<string, number>();
      s.clusters.forEach((c, i) => c.cells.forEach((m) => owner.set(`${c.block}|${key(m)}`, i)));
      s.clusters.forEach((c, i) => {
        const where = `seed ${s.seed} 列 (${s.cx}, ${s.cz}) ${c.block} ${c.layer} target ${c.target} 大きさ ${c.cells.length}`;
        // ③
        if (c.cells.length < 1 || c.cells.length > c.target) bad.push(`③ ${where}`);
        // ②
        for (const m of c.cells) {
          if (Math.floor(m.x / 16) !== s.cx || Math.floor(m.z / 16) !== s.cz) bad.push(`② 列の 外 ${where} (${key(m)})`);
          if (s.mine.layerAt(m.y) !== c.layer) bad.push(`② 層の 外 ${where} y=${m.y}`);
        }
        // ①（cells が 空なら ③ が 報告ずみ。ここで 落として ③ の 本当の 理由を かくさない）
        if (c.cells.length > 0) {
          const left = new Set(c.cells.map(key));
          const todo = [c.cells[0]!];
          left.delete(key(todo[0]!));
          while (todo.length > 0) {
            const m = todo.pop()!;
            for (const [dx, dy, dz] of NB6) {
              const n = { x: m.x + dx, y: m.y + dy, z: m.z + dz };
              if (left.delete(key(n))) todo.push(n);
            }
          }
          if (left.size > 0) bad.push(`① つながって いない ${where}`);
        }
        // ④
        for (const m of c.cells) {
          for (const [dx, dy, dz] of NB6) {
            const o = owner.get(`${c.block}|${m.x + dx},${m.y + dy},${m.z + dz}`);
            if (o !== undefined && o !== i) bad.push(`④ ほかの かたまりと ふれる ${where}`);
          }
        }
      });
    }
    expect(bad.slice(0, 8), `${bad.length} 件`).toEqual([]);
  });

  it('⑤ 列の 中の その 鉱石の ブロックの 数 ＝ かたまりの マスの 合計（かたまりの 外の 鉱石が ない。1B の 新しい 鉱物も）', () => {
    const bad: string[] = [];
    for (const s of samples) {
      for (const block of ORE_BLOCKS) {
        const inClusters = s.clusters.filter((c) => c.block === block).reduce((p, c) => p + c.cells.length, 0);
        const inColumn = LAYER_IDS.reduce((p, L) => p + oreOf(s, L, block, 'all'), 0);
        if (inClusters !== inColumn) bad.push(`seed ${s.seed} 列 (${s.cx}, ${s.cz}) ${block}: かたまり ${inClusters} ・ 列 ${inColumn}`);
      }
    }
    expect(bad.slice(0, 8), `${bad.length} 列`).toEqual([]);
  });

  it('⑥ target の わりあいが ダイヤ いがいを あわせて 2:40%・3:30%・4:20%・5:10% から ±0.03（ダイヤの 1:60%・2:40% は B15）', () => {
    const all = samples.flatMap((s) => s.clusters).filter((c) => (c.block as string) !== 'diamond_ore');
    const want: Record<number, number> = { 2: 0.4, 3: 0.3, 4: 0.2, 5: 0.1 };
    expect(all.length).toBeGreaterThan(300);
    for (const c of all) expect(want[c.target], `target ${c.target}`).toBeDefined();
    for (const t of [2, 3, 4, 5]) {
      const f = all.filter((c) => c.target === t).length / all.length;
      expect(Math.abs(f - want[t]!), `target ${t}: ${(f * 100).toFixed(1)}%（${want[t]! * 100}% の はず）`).toBeLessThanOrEqual(0.03);
    }
  });

  it('⑦ target に 届かなかった かたまり（大きさ < target）は 1 割まで', () => {
    const all = samples.flatMap((s) => s.clusters);
    const short = all.filter((c) => c.cells.length < c.target).length;
    expect(short / all.length, `${short} / ${all.length}`).toBeLessThanOrEqual(0.1);
  });

  it('⑧ 置けた 大きさで 数えても 大きい ほど 少ない（2 ＞ 3 ＞ 4 ＞ 5。ダイヤいがい）', () => {
    const all = samples.flatMap((s) => s.clusters).filter((c) => (c.block as string) !== 'diamond_ore');
    const n = (k: number) => all.filter((c) => c.cells.length === k).length;
    expect(n(2), '2 こ').toBeGreaterThan(n(3));
    expect(n(3), '3 こ').toBeGreaterThan(n(4));
    expect(n(4), '4 こ').toBeGreaterThan(n(5));
    expect(n(5), '5 こ').toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ 置く 順（§4.2）

describe('鉱石は 地形・ふつうの ほらあな・洞くつの 口を 掘った あとに 置く', () => {
  it('洞くつの 口の ある 列で、かたまりの マスが ぜんぶ 本当に 鉱石（口の 空気で あとから 切られて いない）', () => {
    // 口〔さか道・へや〕の 空気を 鉱石の あとに 掘ると、かたまりの マスが 空気に なって かたまりが 切れる
    let cells = 0;
    for (const seed of G.seeds) {
      const mine = createMineHook({ seed });
      for (const [cx, cz] of G.mouth[String(seed)]!) {
        const arr = flat(seed, cx, cz);
        for (const c of mine.oreClusters(cx, cz)) {
          const want = BLOCK_INDEX[c.block];
          for (const m of c.cells) {
            cells++;
            expect(arr[(m.y * 16 + (m.z - cz * 16)) * 16 + (m.x - cx * 16)], `seed ${seed} 列 (${cx}, ${cz}) (${m.x}, ${m.y}, ${m.z}) は ${c.block}`).toBe(want);
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ B6: ★の 量（MINE-1B。§4.2）

/**
 * ★の 鉱物 6 つ と 自分の 層（§4.2 の 表）。ダイヤは 見える 数が 少なくて ぶれるので ぜんぶ だけ くらべる（B6）。
 * id は 仕様 §4.4 の 案（ダイヤの `diamond_ore` は KONGO-1 と そろえた 決まりの id）。
 */
const STARS: ReadonlyArray<{ block: string; layer: Layer; compareVisible: boolean }> = [
  { block: 'nendo', layer: 'asai', compareVisible: true },
  { block: 'sekkaiseki', layer: 'nakahodo', compareVisible: true },
  { block: 'hotaruishi', layer: 'nakahodo', compareVisible: true },
  { block: 'kin_ore', layer: 'fukai', compareVisible: true },
  { block: 'suisho_ore', layer: 'fukai', compareVisible: true },
  { block: 'diamond_ore', layer: 'fukai', compareVisible: false },
];

describe('B6: ★の 量（ねんど・せっかいせき・ほたるいし・きんの いし・すいしょうの いし・ダイヤの いし。A2 と 同じ 列）', () => {
  const table = () => createMineHook({ seed: G.seeds[0]! }).oreTable();

  it('表 oreTable() に ★ 6 つの 行が 1 つずつ あり、層は §4.2 の とおり。表の ぜんぶ は 見える ÷ 0.027 で 決めた（比が 約 2.7%）', () => {
    for (const st of STARS) {
      const rows = table().filter((r) => r.block === st.block);
      expect(rows.map((r) => r.layer), `${st.block} の 行〔層〕`).toEqual([st.layer]);
      const r = rows[0]!;
      expect(r.all, `${st.block} の ぜんぶ`).toBeGreaterThan(0);
      expect(r.visible / r.all, `${st.block}: 見える ${r.visible} ÷ ぜんぶ ${r.all}`).toBeGreaterThanOrEqual(0.025);
      expect(r.visible / r.all, `${st.block}: 見える ${r.visible} ÷ ぜんぶ ${r.all}`).toBeLessThanOrEqual(0.029);
    }
  });

  it('層ごとの 平均が oreTable() の 見える・ぜんぶ の 0.7〜1.4 倍（目安が 1 未満の 物は 0.6〜1.6 倍）。ダイヤは ぜんぶ だけ', () => {
    const bad: string[] = [];
    for (const st of STARS) {
      const row = table().find((r) => r.block === st.block && r.layer === st.layer);
      if (!row) {
        bad.push(`${st.layer} ${st.block}: 表に 行が ない`);
        continue;
      }
      for (const key of st.compareVisible ? (['visible', 'all'] as const) : (['all'] as const)) {
        const want = row[key];
        const got = avg((s) => oreOf(s, st.layer, st.block, key));
        const [lo, hi] = want < 1 ? [0.6, 1.6] : [0.7, 1.4];
        if (!(got >= want * lo && got <= want * hi)) bad.push(`${st.layer} ${st.block} ${key}: 平均 ${got.toFixed(2)}（表 ${want} の ${(got / want).toFixed(2)} 倍。ゆるし ${lo}〜${hi}）`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('自分の 層の 外では 0（ほかの 層に 行も 出方も ない）。自分の 層には ある', () => {
    for (const st of STARS) {
      expect(avg((s) => oreOf(s, st.layer, st.block, 'all')), `${st.layer} の ${st.block}`).toBeGreaterThan(0);
      for (const layer of LAYER_IDS.filter((L) => L !== st.layer)) {
        expect(avg((s) => oreOf(s, layer, st.block, 'all')), `${layer} の ${st.block}`).toBe(0);
        expect(table().some((r) => r.block === st.block && r.layer === layer), `${layer} の ${st.block} の 行`).toBe(false);
      }
    }
  });

  it('★の かたまりが 本当に ある（oreClusters に ★の ブロックが 出る）。山の 面・はじまりの 岩山には ★は ない', () => {
    for (const st of STARS) {
      const n = samples.reduce((p, s) => p + s.clusters.filter((c) => c.block === st.block).length, 0);
      expect(n, `${st.block} の かたまり`).toBeGreaterThan(0);
    }
  });
});

// ------------------------------------------------------------------ B15: ダイヤの いし（生成。A16 の ダイヤの 分）

describe('B15: ダイヤの いし（ふかい 層だけ・かたまり 1〜2。1:60%・2:40% から ±0.1）', () => {
  /** ダイヤの かたまりが 300 こ 集まるまで、シードの はじまりの まわりの 列を ふやして 読む（窓口 oreClusters だけ。上限 1,600 列。表に 行が 無ければ 読まない） */
  let cache: OreCluster[] | null = null;
  function diamondClusters(): OreCluster[] {
    if (cache) return cache;
    const mine = createMineHook({ seed: G.seeds[0]! });
    const out: OreCluster[] = [];
    if (mine.oreTable().some((r) => (r.block as string) === 'diamond_ore')) {
      for (let cz = 0; cz < 40 && out.length < 300; cz++) {
        for (let cx = 0; cx < 40 && out.length < 300; cx++) out.push(...mine.oreClusters(cx, cz).filter((c) => (c.block as string) === 'diamond_ore'));
      }
    }
    return (cache = out);
  }
  // 列を 最大 1,600 本 読む さがしは 一度だけ、長い 時間切れで 先に 済ませる（負荷が 高くても 5 秒で 落ちない。上の samples と 同じ 考え）
  beforeAll(() => {
    diamondClusters();
  }, 240_000);

  it('かたまりが 300 こ 以上 集まる（列が 0 でも かたまりが 0 でも 通らない ように）', () => {
    expect(createMineHook({ seed: 1 }).oreTable().some((r) => (r.block as string) === 'diamond_ore'), '表に ダイヤの いし').toBe(true);
    expect(diamondClusters().length, 'ダイヤの かたまり').toBeGreaterThanOrEqual(300);
  });

  it('ぜんぶ ふかい 層。大きさは 1〜target で target は 1 か 2', () => {
    const all = diamondClusters();
    expect(all.length, 'ダイヤの かたまり').toBeGreaterThan(0);
    for (const c of all) {
      expect(c.layer, 'ダイヤの いしは ふかい 層だけ').toBe('fukai');
      expect([1, 2], `target ${c.target}`).toContain(c.target);
      expect(c.cells.length).toBeGreaterThanOrEqual(1);
      expect(c.cells.length).toBeLessThanOrEqual(c.target);
    }
  });

  it('target の わりあいが 1:60%・2:40% から ±0.1', () => {
    const all = diamondClusters();
    expect(all.length, 'ダイヤの かたまり').toBeGreaterThanOrEqual(300);
    const f1 = all.filter((c) => c.target === 1).length / all.length;
    const f2 = all.filter((c) => c.target === 2).length / all.length;
    expect(Math.abs(f1 - 0.6), `target 1: ${(f1 * 100).toFixed(1)}%（60% の はず）`).toBeLessThanOrEqual(0.1);
    expect(Math.abs(f2 - 0.4), `target 2: ${(f2 * 100).toFixed(1)}%（40% の はず）`).toBeLessThanOrEqual(0.1);
  });
});

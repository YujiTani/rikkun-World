import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { COL_VOLUME, HW, LAYER } from './columnLayout';
import { MINE_CONFIG } from './mineConfig';
import { placeMineOres, type OreCluster } from './mineOres';

/**
 * MINE-1A の 内がわの 部品: 鉱石の かたまりの 置き方 `placeMineOres`（docs/design/MINE-1.md §4.2）。
 * 外から 見える 数・割合は mineOres.test.ts（本物の 生成）。ここは 合成の 列（地面 150・石の 柱）で 置き方の 約束を 見る。
 */

const AIR = BLOCK_INDEX.air;
const STONE = BLOCK_INDEX.stone;
const DIRT = BLOCK_INDEX.dirt;
const BEDROCK = BLOCK_INDEX.bedrock;
const COAL = BLOCK_INDEX.coal_ore;
const IRON = BLOCK_INDEX.iron_ore;
const GROUND = 150;
const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

/** 地面 GROUND の 列: y 0 は そこいし、1〜GROUND−3 は 石、その 上は つち */
function stoneColumn(): { out: Uint8Array; heights: Int16Array } {
  const out = new Uint8Array(COL_VOLUME);
  out.fill(BEDROCK, 0, LAYER);
  out.fill(STONE, LAYER, (GROUND - 2) * LAYER);
  out.fill(DIRT, (GROUND - 2) * LAYER, (GROUND + 1) * LAYER);
  return { out, heights: new Int16Array(HW * HW).fill(GROUND) };
}

const at = (i: number): { x: number; y: number; z: number } => ({ x: i % 16, y: Math.floor(i / LAYER), z: Math.floor(i / 16) % 16 });
const layerOf = (y: number): string => (y >= 96 ? 'asai' : y >= 52 ? 'nakahodo' : y >= 1 ? 'fukai' : 'none');
const fnv = (a: Uint8Array): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i]!, 0x01000193);
  return h >>> 0;
};

function place(seed: number, cx: number, cz: number): { out: Uint8Array; rec: OreCluster[]; before: Uint8Array } {
  const { out, heights } = stoneColumn();
  const before = out.slice();
  const rec: OreCluster[] = [];
  placeMineOres(out, seed, cx, cz, heights, rec);
  return { out, rec, before };
}

describe('placeMineOres: 置く 場所', () => {
  it('石の マスだけを 鉱石に かえる。そこいし・地面より 上・つち は そのまま。せきたんは あさい 層だけ', () => {
    const { out, before } = place(1, 3, 4);
    let ore = 0;
    for (let i = 0; i < COL_VOLUME; i++) {
      if (out[i] === before[i]) continue;
      ore++;
      const { y } = at(i);
      expect(before[i], `y=${y} は 石だった`).toBe(STONE);
      expect(out[i] === COAL || out[i] === IRON, `y=${y} は せきたんか てつ`).toBe(true);
      expect(y, '地面より 1 つ 下まで').toBeLessThanOrEqual(GROUND - 1);
      expect(y, 'そこいしの 上').toBeGreaterThanOrEqual(1);
      if (out[i] === COAL) expect(layerOf(y), 'せきたんの 層').toBe('asai');
    }
    expect(ore).toBeGreaterThan(100);
  });

  it('てつは 3 つの 層に 出る', () => {
    const seen = new Set<string>();
    for (let cx = 0; cx < 6; cx++) {
      const { out } = place(7, cx, 0);
      for (let i = 0; i < COL_VOLUME; i++) if (out[i] === IRON) seen.add(layerOf(at(i).y));
    }
    expect([...seen].sort()).toEqual(['asai', 'fukai', 'nakahodo']);
  });

  it('石が 少ししか ない 列: 石の 外には 置かない。かたまりは target より 小さく なる', () => {
    const out = new Uint8Array(COL_VOLUME);
    // あさい 層の 中に 2×2×1 の 石の 板だけ（ほかは 空気）
    for (let lz = 5; lz < 7; lz++) for (let lx = 5; lx < 7; lx++) out[(100 * 16 + lz) * 16 + lx] = STONE;
    const before = out.slice();
    const rec: OreCluster[] = [];
    placeMineOres(out, 3, 0, 0, new Int16Array(HW * HW).fill(GROUND), rec);
    let placed = 0;
    for (let i = 0; i < COL_VOLUME; i++) {
      if (out[i] === before[i]) continue;
      placed++;
      expect(before[i]).toBe(STONE);
    }
    expect(placed).toBeLessThanOrEqual(4);
    for (const c of rec) expect(c.cells.length).toBeLessThanOrEqual(4);
  });

  it('層の 高さが 地面より 上なら 置かない（地面 60 の 列に あさい 層の せきたんは 出ない）', () => {
    const out = new Uint8Array(COL_VOLUME);
    out.fill(STONE, LAYER, 59 * LAYER);
    placeMineOres(out, 3, 0, 0, new Int16Array(HW * HW).fill(60));
    for (let i = 0; i < COL_VOLUME; i++) expect(out[i] === COAL, `coal y=${at(i).y}`).toBe(false);
    expect(out.some((b) => b === IRON)).toBe(true);
  });
});

describe('placeMineOres: かたまり', () => {
  it('記録は 実際の ブロックと 同じ。マスは 面で つながり、大きさは 1〜target。列の 鉱石は ぜんぶ どれかの かたまり', () => {
    for (const [seed, cx, cz] of [[1, 0, 0], [2, 5, -3], [9, -4, 7]] as const) {
      const { out, rec } = place(seed, cx, cz);
      const cells = new Map<number, string>();
      for (const c of rec) {
        expect(c.cells.length).toBeGreaterThanOrEqual(1);
        expect(c.cells.length).toBeLessThanOrEqual(c.target);
        for (const m of c.cells) {
          const i = ((m.y * 16 + (m.z - cz * 16)) * 16 + (m.x - cx * 16)) | 0;
          expect(out[i], `(${m.x}, ${m.y}, ${m.z})`).toBe(c.block === 'coal_ore' ? COAL : IRON);
          expect(cells.has(i), '同じ マスを 2 回 数えない').toBe(false);
          cells.set(i, c.block);
        }
        // つながり
        const left = new Set(c.cells.map((m) => `${m.x},${m.y},${m.z}`));
        const todo = [c.cells[0]!];
        left.delete(`${todo[0]!.x},${todo[0]!.y},${todo[0]!.z}`);
        while (todo.length > 0) {
          const m = todo.pop()!;
          for (const [dx, dy, dz] of NB6) {
            const n = { x: m.x + dx, y: m.y + dy, z: m.z + dz };
            if (left.delete(`${n.x},${n.y},${n.z}`)) todo.push(n);
          }
        }
        expect(left.size, `つながって いない かたまり（${c.block}）`).toBe(0);
      }
      let inColumn = 0;
      for (let i = 0; i < COL_VOLUME; i++) if (out[i] === COAL || out[i] === IRON) inColumn++;
      expect(cells.size, '列の 鉱石 ＝ かたまりの マスの 合計').toBe(inColumn);
    }
  });

  it('同じ 鉱石の ほかの かたまりと 面で ふれない（ちがう 鉱石とは ふれて よい）', () => {
    for (const [seed, cx, cz] of [[1, 0, 0], [4, 2, 2]] as const) {
      const { rec } = place(seed, cx, cz);
      const owner = new Map<string, number>();
      rec.forEach((c, i) => c.cells.forEach((m) => owner.set(`${c.block}|${m.x},${m.y},${m.z}`, i)));
      rec.forEach((c, i) => {
        for (const m of c.cells) {
          for (const [dx, dy, dz] of NB6) {
            const o = owner.get(`${c.block}|${m.x + dx},${m.y + dy},${m.z + dz}`);
            if (o !== undefined) expect(o, `${c.block} (${m.x}, ${m.y}, ${m.z})`).toBe(i);
          }
        }
      });
    }
  });

  it('target は 表の わりあい（2:40%・3:30%・4:20%・5:10%）どおりで、置けた 大きさの 平均は 3 に ちかい', () => {
    const sizes = MINE_CONFIG.cluster.sizes;
    const total = sizes.reduce((p, s) => p + s.percent, 0);
    const count = new Map<number, number>();
    let cells = 0;
    let n = 0;
    for (let cx = 0; cx < 16; cx++) {
      for (const c of place(5, cx, 1).rec) {
        count.set(c.target, (count.get(c.target) ?? 0) + 1);
        cells += c.cells.length;
        n++;
      }
    }
    expect(n).toBeGreaterThan(800);
    for (const s of sizes) expect(Math.abs((count.get(s.size) ?? 0) / n - s.percent / total), `target ${s.size}`).toBeLessThan(0.05);
    expect(cells / n).toBeGreaterThan(2.85);
    expect(cells / n).toBeLessThanOrEqual(3.15);
  });

  it('1 列の 鉱石の 数は 表の ぜんぶ（せきたん・てつの 合計）に ちかい', () => {
    const want = MINE_CONFIG.ores.reduce((p, r) => p + r.all, 0);
    let got = 0;
    const cols = 24;
    for (let cx = 0; cx < cols; cx++) for (const c of place(11, cx, 2).rec) got += c.cells.length;
    expect(got / cols).toBeGreaterThan(want * 0.92);
    expect(got / cols).toBeLessThan(want * 1.05);
  });
});

describe('placeMineOres: 決まった 結果', () => {
  it('同じ (seed, cx, cz) は いつも 同じ。ほかの 列を 先に 置いても 同じ', () => {
    const a = fnv(place(42, 3, 3).out);
    place(42, 4, 3);
    place(43, 3, 3);
    expect(fnv(place(42, 3, 3).out)).toBe(a);
  });

  it('列が ちがう・シードが ちがえば 中身も ちがう', () => {
    const a = fnv(place(42, 3, 3).out);
    expect(fnv(place(42, 3, 4).out)).not.toBe(a);
    expect(fnv(place(43, 3, 3).out)).not.toBe(a);
  });

  it('記録を 取っても 取らなくても ブロックは 同じ', () => {
    const { out: withRec } = place(8, 1, 1);
    const { out, heights } = stoneColumn();
    placeMineOres(out, 8, 1, 1, heights);
    expect(fnv(out)).toBe(fnv(withRec));
  });

  it('空気の 列には 何も 置かない', () => {
    const out = new Uint8Array(COL_VOLUME);
    out.fill(AIR);
    placeMineOres(out, 1, 0, 0, new Int16Array(HW * HW).fill(GROUND));
    expect(out.every((b) => b === AIR)).toBe(true);
  });
});

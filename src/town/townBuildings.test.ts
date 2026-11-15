import { afterEach, describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../contracts';
import { BLOCK_INDEX, BLOCK_TYPES } from '../world/blocks/blockTypes';
import { TOWN_BLOCK_DEFS } from '../world/blocks/townBlocks';
import { generateChunk } from '../world/gen/chunk';
import { LAYER } from '../world/gen/columnLayout';
import { terrainFor } from '../world/gen/terrain';
import { sectionToArray } from '../world/sections';
import { townBuildingCells } from './townBuildings';
import { SURF, at } from './townLayout';
import { chooseTown } from './townPlace';
import { activateTown, deactivateTown } from './townState';
import { TOWN } from './townTuning';

/** TOWN-1 1B-2 試作: よろずや・ふんすいの 置き方の 表（townBuildings.ts）と 街への 書きこみ */
afterEach(() => deactivateTown());

const cells = townBuildingCells();
const markOf = (id: string): string | null => /@([uv][+-]?)$/.exec(id)?.[1] ?? null;
const baseOf = (id: string): string => id.replace(/@.*$/, '');

function reader(seed: number): (x: number, y: number, z: number) => number {
  const cols = new Map<string, Uint16Array>();
  return (x, y, z) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let col = cols.get(key);
    if (!col) {
      const c = generateChunk(seed, cx, cz);
      col = new Uint16Array(LAYER * c.sections.length * CHUNK_SIZE);
      c.sections.forEach((s, i) => col!.set(sectionToArray(s), i * LAYER * CHUNK_SIZE));
      cols.set(key, col);
    }
    return col[y * LAYER + (z - cz * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE)]!;
  };
}

describe('建物の 表', () => {
  it('ぜんぶの ブロックが ある（向きの 印は 4 向き・2 向きの 名前に なる）', () => {
    for (const c of cells) {
      const base = baseOf(c.id);
      const m = markOf(c.id);
      if (m === null) expect(BLOCK_INDEX[base as keyof typeof BLOCK_INDEX], c.id).toBeGreaterThan(0);
      else if (m.length === 1) for (const a of ['x', 'z']) expect(BLOCK_INDEX[`${base}_${a}` as keyof typeof BLOCK_INDEX], `${c.id} → ${a}`).toBeGreaterThan(0);
      else for (const d of ['n', 'e', 's', 'w']) expect(BLOCK_INDEX[`${base}_${d}` as keyof typeof BLOCK_INDEX], `${c.id} → ${d}`).toBeGreaterThan(0);
    }
  });

  it('街の はんいの 中に 入り、建物は 奥の 列の 中・ふんすいは ひろばの 中・同じ マスに 2 つ 置かない', () => {
    const seen = new Set<string>();
    for (const c of cells) {
      expect(c.u >= 0 && c.u < TOWN.size && c.v >= 0 && c.v < TOWN.size && c.dy >= -1 && c.dy < 20, `${c.u},${c.v},${c.dy}`).toBe(true);
      const key = `${c.u},${c.v},${c.dy}`;
      expect(seen.has(key), `${key} が 2 回`).toBe(false);
      seen.add(key);
      if (c.dy < 0) {
        const paving = c.v >= 11 && c.v <= 14 && c.u >= 2 && c.u <= 74; // 奥の 列の 建物の 前
        const east = c.u >= 66 && c.u <= 98 && c.v >= 24 && c.v <= 90; // 道場の けいこ場・アスレチックの 池
        const stall = c.v >= 29 && c.v <= 33 && c.u >= 36 && c.u <= 64; // 屋台の ゆか・前の 石だたみ
        const gate = c.v >= 73 && c.u >= 48 && c.u <= 52; // 門の 通り道の 石だたみ
        expect(paving || east || stall || gate, `石だたみ・池は 決まった 所: ${c.u},${c.v}`).toBe(true);
      } else if (c.v <= 17) {
        expect(c.u >= 2 && c.u <= 74, `建物は 奥の 列の 中: ${c.u},${c.v}`).toBe(true);
      } else if ((c.v >= 18 && c.v <= 33 && c.u >= 9 && c.u <= 66) || (c.v >= 73 && c.u >= 36 && c.u <= 64)) {
        // 屋台（広場の 北）・たいこ橋・門（楼門・へい・どうろうは u 36〜64、v 73〜85）
      } else if (c.u >= 66 && c.v >= 24 && c.v <= 90) {
        expect(c.u <= 98, `道場・アスレチックは 東の 列: ${c.u},${c.v}`).toBe(true);
      } else {
        const half = TOWN.plaza.size / 2;
        expect(Math.abs(c.u - TOWN.size / 2) <= half && Math.abs(c.v - TOWN.size / 2) <= half, `ふんすいは ひろばの 中: ${c.u},${c.v}`).toBe(true);
      }
    }
  });

  it('あかり: 石どうろう 18（ふんすい 6・ひろば 4・よろずや 2・道場 2・門 4）・つりさげる あんどん 12（よろずや 5・かじや 2・だいく 3・道場 2）。数は §4.5 の 上限の 中', () => {
    const n = (id: string): number => cells.filter((c) => c.id === id).length;
    expect(n('town_toro_mini')).toBe(18); // ふんすい 6・ひろば 4・よろずや 2・道場 2・門 4
    expect(n('town_tsuri_andon')).toBe(12); // よろずや 5・かじや 2・だいく 3・道場 2
    expect(n('town_hi')).toBe(1); // 炉の 光る 火は 1 ブロック
    expect(n('town_toro_mini') + n('town_tsuri_andon')).toBeLessThanOrEqual(30);
    expect(n('town_tsuri_andon')).toBeLessThanOrEqual(12); // ちょうちん・あんどんは 12 まで
    expect(cells.filter((c) => c.id.startsWith('town_bench')).length).toBe(10); // ベンチ 4 つ（2 マスずつ）＋ アスレチックの 見物 2
    expect(n('town_hanabatake')).toBe(4);
  });

  it('かざりの 絵は ぜんぶ アトラスに ある（箱が はる 絵の 名前）', async () => {
    const { TILE_NAMES } = await import('../world/blocks/textures');
    const names = new Set<string>(TILE_NAMES);
    for (const d of TOWN_BLOCK_DEFS) {
      if (!('boxes' in d) || !d.boxes) continue;
      for (const b of d.boxes) {
        expect(names.has(b[6]), `${d.id}: ${b[6]}`).toBe(true);
        if (b[7]) expect(names.has(b[7]), `${d.id}: ${b[7]}`).toBe(true);
        expect(b[0] >= -1 && b[1] >= 0 && b[2] >= -1 && b[3] <= 17 && b[4] <= 16 && b[5] <= 17 && b[3] > b[0] && b[4] > b[1] && b[5] > b[2], `${d.id} の 箱の 大きさ`).toBe(true);
      }
    }
  });
});

describe('街への 書きこみ', () => {
  it('どの 向きでも 表の とおりに 世界に 書かれる（4 つの 向きが 出る シードを さがして 見る）', { timeout: 300_000 }, () => {
    const facings = new Set<string>();
    for (let seed = 1; seed <= 12 && facings.size < 4; seed++) {
      const rec = chooseTown(seed)!;
      if (facings.has(rec.facing)) continue;
      facings.add(rec.facing);
      const sp = terrainFor(seed).spawn();
      const plan = activateTown(seed, rec, { x: sp.x, z: sp.z });
      const read = reader(seed);
      const G = rec.groundY;
      for (const c of cells) {
        const w = plan.toWorld(c.u, c.v);
        const k = at(c.u, c.v);
        const topY = plan.layout.surf[k] === SURF.terrace ? G + TOWN.terrace.rise : G;
        const got = BLOCK_TYPES[read(w.x, topY + 1 + c.dy, w.z)]!.id;
        const m = markOf(c.id);
        if (m === null) expect(got, `${rec.facing} ${c.id} ${c.u},${c.v},${c.dy}`).toBe(c.id);
        else expect(got.startsWith(`${baseOf(c.id)}_`), `${rec.facing} ${c.id} → ${got}`).toBe(true);
      }
      // 水の まくは 塔の ほうを 向く: 塔の 南がわ（ローカル v が 大きい）の まくは、世界の どの 向きでも 塔の まん中へ むく
      const mid = TOWN.size / 2;
      const c0 = plan.toWorld(mid, mid);
      const s = plan.toWorld(mid, mid + 3);
      const sid = BLOCK_TYPES[read(s.x, G + 1 + 1, s.z)]!.id;
      const dir = sid.slice(-1);
      const expected = s.x > c0.x ? 'w' : s.x < c0.x ? 'e' : s.z > c0.z ? 'n' : 's';
      expect(sid.startsWith('town_taki_'), sid).toBe(true);
      expect(dir, `${rec.facing}: まくの 向き`).toBe(expected);
    }
    expect(facings.size).toBeGreaterThanOrEqual(2);
  });
});

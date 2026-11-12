// 古い 形（v1）の 世界を 確かめる テスト: 既定は 新しい 景色（木 v2・山 v2・目じるし）なので、古い 形を はっきり 指定する（world/gen/lookFlags.ts。import より 前に きまる）
vi.hoisted(() => {
  (globalThis as { location?: unknown }).location = { search: '?trees=v1&mountain=v1&structures=0&drift=0&water=v1' };
});
import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GOLDEN_CAVE_HALF, GOLDEN_CAVE_SEEDS, GOLDEN_E_FILE, GOLDEN_E_HALF, GOLDEN_E_SEEDS, hashOf, sidesSig, type GoldenE } from './mineYakataGolden';
import { pathHashOf } from './mineBokenGolden';
import { hookE } from './mineBokenKit';
import { goldenE, pathHashNoYakata } from './mineYakataGolden';
import { hookF, needYakataHook } from './mineYakataKit';
import { hookCave, type Cave } from './mineCaveKit';
import { spawnOf } from './terrain';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.1・§4.9・受け入れ基準 F3）: 1E を かえない。やかたの ある 坑道の `shaftPath`〔'yakata' を のぞく〕と 1D の 部屋が、
 * 1F を 入れる 前〔1E 入りの main〕と 同じ〔ハッシュ〕。1E の 坑道の 数・入口・箱・横穴・階も 同じ。
 *
 *   見本 `src/world/gen/__fixtures__/mine1e-before.json` は 1F を 入れる 前の main〔1E 入り。SAVE_GEN 7〕で 作る〔4 シード・スタートの まわり ± 2,048 マス・ふかい 坑道は 道の ハッシュ〕:
 *     MAKE_1E_GOLDEN=1 npx vitest run src/world/gen/mineYakataSame.test.ts
 *   〔見本は 書きかえて 通さない。F9 の 古い 保存の 確かめ〔src/save/mine1fSave.test.ts〕も 同じ 見本を 読む〕
 * 赤の 確かめ: 1F の 前は 見本と 同じ なので「やかたの ある 坑道が 標本に ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 900_000 });

const caveSig = (c: Cave): string => `${c.id}|${c.kind}|${c.layer}|${c.box.x0},${c.box.y0},${c.box.z0},${c.box.x1},${c.box.y1},${c.box.z1}`;
/** 1D の 部屋〔スタートの まわり ± GOLDEN_CAVE_HALF マス〕の 計画の ハッシュ */
function cavesHashOf(seed: number): string {
  const sp = spawnOf(seed);
  const caves = hookCave(seed).caves(sp.x - GOLDEN_CAVE_HALF, sp.z - GOLDEN_CAVE_HALF, sp.x + GOLDEN_CAVE_HALF - 1, sp.z + GOLDEN_CAVE_HALF - 1).map(caveSig).sort();
  return hashOf(caves.join(';'));
}

describe('見本を 作る', () => {
  it.skipIf(!process.env['MAKE_1E_GOLDEN'])('1E の あとの 形〔4 シードの 1E の 坑道・ふかい 坑道は 道の ハッシュ〕を 作る〔1E 入りの main で 1 回〕', () => {
    const seeds: GoldenE['seeds'] = {};
    for (const [si, seed] of GOLDEN_E_SEEDS.entries()) {
      const h = hookE(seed);
      const sp = spawnOf(seed);
      const win: [number, number, number, number] = [sp.x - GOLDEN_E_HALF, sp.z - GOLDEN_E_HALF, sp.x + GOLDEN_E_HALF - 1, sp.z + GOLDEN_E_HALF - 1];
      const es = h.shafts(...win).filter((s) => s.gen === 'e');
      const shafts = es.map((s) => {
        const deep = s.style?.depth === 'fukai';
        const path = deep ? h.shaftPath(s.id) : [];
        return {
          id: s.id,
          depth: s.style?.depth ?? '',
          entrance: { x: s.entrance.x, y: s.entrance.y, z: s.entrance.z },
          box: s.box,
          pathHash: deep ? pathHashOf(path) : '',
          pathLength: path.length,
          sides: sidesSig(s.sides),
          floors: JSON.stringify((s.floors ?? []).map((f) => f.y)),
        };
      });
      seeds[String(seed)] = { shafts, cavesHash: si < GOLDEN_CAVE_SEEDS ? cavesHashOf(seed) : '' };
    }
    writeFileSync(GOLDEN_E_FILE, JSON.stringify({ seeds } satisfies GoldenE));
    expect(Object.values(seeds).reduce((n, s) => n + s.shafts.filter((x) => x.depth === 'fukai').length, 0)).toBeGreaterThan(60);
  });
});

describe('F3: 1E を かえない', () => {
  it('やかたの ある 坑道の shaftPath〔yakata を のぞく〕・ふかい 坑道の 入口・箱・横穴・階・坑道の 数が 1F の 前と 同じ・1D の 部屋の 計画も 同じ', () => {
    const gold = goldenE();
    const bad: string[] = [];
    let withYakata = 0;
    let compared = 0;
    for (const [si, seed] of GOLDEN_E_SEEDS.entries()) {
      const g = gold.seeds[String(seed)]!;
      const h = hookF(seed);
      needYakataHook(h, ['yakataRolls']);
      const sp = spawnOf(seed);
      const win: [number, number, number, number] = [sp.x - GOLDEN_E_HALF, sp.z - GOLDEN_E_HALF, sp.x + GOLDEN_E_HALF - 1, sp.z + GOLDEN_E_HALF - 1];
      const live = new Map(h.shafts(...win).filter((s) => s.gen === 'e').map((s) => [s.id, s] as const));
      if (live.size !== g.shafts.length) bad.push(`seed ${seed}: 1E の 坑道の 数 ${live.size}〔${g.shafts.length} の はず〕`);
      for (const x of g.shafts) {
        const s = live.get(x.id);
        if (!s) {
          bad.push(`${x.id}: 坑道が ない`);
          continue;
        }
        compared++;
        if (JSON.stringify(s.entrance) !== JSON.stringify({ ...x.entrance, dir: s.entrance.dir, kind: s.entrance.kind })) bad.push(`${x.id}: 入口が ちがう`);
        if (JSON.stringify(s.box) !== JSON.stringify(x.box)) bad.push(`${x.id}: 箱が ちがう`);
        if (sidesSig(s.sides) !== x.sides) bad.push(`${x.id}: 横穴が ちがう`);
        if (JSON.stringify((s.floors ?? []).map((f) => f.y)) !== x.floors) bad.push(`${x.id}: 階が ちがう`);
        if (x.depth !== 'fukai') continue;
        if (s.yakata) withYakata++;
        const path = h.shaftPath(x.id);
        if (pathHashNoYakata(path) !== x.pathHash) bad.push(`${x.id}: shaftPath〔yakata を のぞく〕が 1F の 前と ちがう${s.yakata ? '〔やかたの ある 坑道〕' : ''}`);
      }
      if (si < GOLDEN_CAVE_SEEDS && cavesHashOf(seed) !== g.cavesHash) bad.push(`seed ${seed}: 1D の 部屋の 計画が 1F の 前と ちがう`);
    }
    expect(compared, '見本と くらべた 1E の 坑道').toBeGreaterThan(30);
    expect(withYakata, 'やかたの ある 坑道〔ふかい 1E の 坑道の うち〕').toBeGreaterThanOrEqual(10);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});

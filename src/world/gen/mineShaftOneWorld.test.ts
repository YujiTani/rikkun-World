import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { colKey } from '../stream/ring';
import { SEEDS_20, hook1c, type OldCols } from './mineShaftKit';
import { shaftWorldFor } from './mineShafts';
import { surfaceFor } from './surface';
import { heightAt, spawnOf } from './terrain';

/**
 * MINE-1C コードレビュー A〔重大 3〕: 1 つの 世界には ShaftWorld を 1 つだけ。実績・surface・生成が 同じ 坑道を 見る〔仕様 §4.8・§4.10〕。
 *
 *   ・生成〔save.ts の generateChunk・先読み〕は `shaftWorldFor(seed, restored.oldCols)`。実績の「いちばん した」と surface が 古い 列の 一覧なしの
 *     `shaftWorldFor(seed)` を 見ると、古い 世界では はじまりの 坑道の 場所が ちがい、本当の いちばん 下の へやに ついても 実績が 出ない。
 *   ・ゲームの 中の 呼び出しは E2E なしで 見る のは むずかしい ので 2 つに 分けて 見る:
 *       (1) ソースの 見張り: 本番の コードで `shaftWorldFor(seed)`〔古い 列の 一覧を わたさない 呼び出し〕は mineShafts.ts の 外に ない
 *           〔つなぎ込みが 1 つ 作って、実績・surface・窓口・先読みに わたす〕
 *       (2) surface: 古い 列の 一覧が ある 世界の surface は、その 世界の ShaftWorld を わたすと 本当の〔その 世界の〕はじまりの 坑道を 見る
 *           【窓口は 案】`surfaceFor(seed, { flora?, shafts?: ShaftWorld })`
 */

vi.setConfig({ testTimeout: 120_000 });

// ------------------------------------------------------------------ (1) ソースの 見張り

const ROOT = 'src';
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });

/** `shaftWorldFor(` の 呼び出しで 引数が 1 つだけ の もの〔カッコの 中の 一番 外の コンマで 数える〕 */
function oneArgCalls(src: string): number[] {
  const out: number[] = [];
  const re = /shaftWorldFor\(/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const before = src.slice(Math.max(0, m.index - 16), m.index);
    if (/function\s+$/.test(before)) continue; // 定義
    let depth = 1;
    let commas = 0;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i]!;
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 1) commas++;
    }
    const inner = src.slice(m.index + m[0].length, i - 1).trim();
    if (inner !== '' && commas === 0) out.push(src.slice(0, m.index).split('\n').length);
  }
  return out;
}

describe('R3〔重大 3〕: 古い 列の 一覧なしの ShaftWorld を ゲームの 中で 使わない', () => {
  it('見張りの 形が 1 引数の 呼び出しを みつける', () => {
    expect(oneArgCalls('const a = shaftWorldFor(seed).inBottom(1, 2, 3);')).toHaveLength(1);
    expect(oneArgCalls('shaftWorldFor(this.seed).zones(x >> 4, z >> 4)')).toHaveLength(1);
    expect(oneArgCalls('shaftWorldFor(seed, restored.oldCols).warm(x, z, 3)')).toHaveLength(0);
    expect(oneArgCalls('shaftWorldFor(seed, o.oldCols)')).toHaveLength(0);
    expect(oneArgCalls('export function shaftWorldFor(seed: number, oldCols?: OldCols): ShaftWorld {')).toHaveLength(0);
  });

  it('本番の コード〔テスト いがい〕に、古い 列の 一覧を わたさない shaftWorldFor(seed) が ない', () => {
    const bad: string[] = [];
    for (const f of files(ROOT)) {
      if (f.endsWith('mineShafts.ts')) continue;
      for (const line of oneArgCalls(readFileSync(f, 'utf8'))) bad.push(`${f}:${line}`);
    }
    expect(bad, '世界ごとに 1 つ 作った ShaftWorld〔restored.oldCols つき〕を 実績・surface・窓口に わたす').toEqual([]);
  });
});

// ------------------------------------------------------------------ (2) surface が その 世界の 坑道を 見る

/** スタートの 列の まわり 半径 r 列を 古い 列に する〔はじまりの 坑道が 別の 場所に 移る〕 */
const oldAround = (seed: number, r: number): OldCols => {
  const sp = spawnOf(seed);
  const kodo = new Set<number>();
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) kodo.add(colKey((sp.x >> 4) + dx, (sp.z >> 4) + dz));
  return { kodo, heya: new Set<number>() };
};

/** はじまりの 坑道の 入口〔置けなくて 投げる 世界は null。それは R2 で 見る〕 */
const entranceOf = (seed: number, old?: OldCols): { x: number; z: number } | null => {
  try {
    const e = hook1c(seed, old ? { oldCols: old } : {}).startShaft().entrance;
    return { x: e.x, z: e.z };
  } catch {
    return null;
  }
};

type SurfaceWith = (seed: number, o: { shafts: ReturnType<typeof shaftWorldFor> }) => ReturnType<typeof surfaceFor>;

describe('R3〔重大 3〕: surface は その 世界の ShaftWorld を 見る', () => {
  it.each(SEEDS_20.slice(0, 6))('seed %i: 古い 列つきの 世界の はじまりの 坑道の 地下の 道は、surface でも 空気〔古い 列の 一覧なしの 世界の 坑道ではない〕', (seed) => {
    const old = oldAround(seed, 3);
    const plain = entranceOf(seed);
    const moved = entranceOf(seed, old);
    // 古い 列で 場所が かわる 世界だけ 見る〔かわらなければ 2 つの 世界は 同じ ＝ くらべる 意味が ない〕
    if (plain === null || moved === null || (plain.x === moved.x && plain.z === moved.z)) return;
    const world = shaftWorldFor(seed, old);
    const surface = (surfaceFor as unknown as SurfaceWith)(seed, { shafts: world });
    const cells = world.path('start').filter((c) => c.part === 'ramp' && c.y <= heightAt(seed, c.x, c.z) - 4);
    expect(cells.length, '地下の さか道').toBeGreaterThan(0);
    const bad = cells.filter((c) => surface.blockAt(c.x, c.y, c.z) !== 'air').map((c) => `(${c.x}, ${c.y}, ${c.z}) = ${surface.blockAt(c.x, c.y, c.z)}`);
    expect(bad.slice(0, 5), `${bad.length} / ${cells.length} マス`).toEqual([]);
  });

  it('古い 列で はじまりの 坑道が 移る シードが 1 つ 以上 ある〔上の くらべが 空に ならない〕', () => {
    const moved = SEEDS_20.slice(0, 6).filter((seed) => {
      const a = entranceOf(seed);
      const b = entranceOf(seed, oldAround(seed, 3));
      return a !== null && b !== null && (a.x !== b.x || a.z !== b.z);
    });
    expect(moved.length).toBeGreaterThan(0);
  });
});

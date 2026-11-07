import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SEED_POOL_BIG, bigSample, hookE, needBokenHook, sum, tablesOf, type BokenShaft, type ESample } from './mineBokenKit';
import { GenCols, type PathCell } from './mineShaftKit';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.14・受け入れ基準 E19 の 【ユニット】の ぶん）: 数で きまる 上限。
 *
 *   ・列 1 つで 見る 坑道の 区画は 4 つ まで〔箱 128 でも。読みこんだ 列の 数で ふえない〕
 *   ・計画の 仕事〔ためした 回数〕は 1 か所の 表の 上限 まで・広さ 128 の 仕事が 広さ 64 の 4.8 倍 以下〔面積の 比 4 に 2 割〕
 *   ・光る ブロックは 1 列 80 こ まで・坑道 1 つの たいまつは 表の 上限〔320 本〕まで・迷路 1 つ 16 本 まで
 *   ・ブロック id は 1E で 10 こ まで〔src/dig/mineBoken.test.ts〕
 * 時間〔ms〕・描画回数・三角形・保存の 速さは 【perf】・【E2E】〔`npm run perf`・e2e/mine1e.spec.ts〕。**時間では 合否を きめない**。
 * 赤の 確かめ: 1E の 前は「1E の 坑道が ない」「窓口が まだ ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 1200_000 });

const bySize = (all: readonly ESample[], size: number): ESample[] => all.filter((a) => a.shaft.style?.size === size);
const enough = (all: readonly ESample[]): boolean => bySize(all, 128).length >= 12 && bySize(all, 64).length >= 12;

let all: ESample[] = [];
beforeAll(() => {
  all = bigSample(enough, SEED_POOL_BIG).all;
}, 1200_000);

const WORK_KEYS = ['entrance', 'floors', 'sides', 'eda', 'maze'] as const;
const totalWork = (s: BokenShaft): number => sum(WORK_KEYS.map((k) => s.work?.[k] ?? 0));

describe('E19: 計画の 仕事', () => {
  it('標本に 広さ 128 と 64 の 1E の 坑道が 12 こ ずつ ある・計画の 仕事 `work` が ある', () => {
    expect(all.length, '1E の 坑道が ない').toBeGreaterThan(0);
    expect(bySize(all, 128).length, '広さ 128').toBeGreaterThanOrEqual(12);
    expect(bySize(all, 64).length, '広さ 64').toBeGreaterThanOrEqual(12);
    for (const a of all) expect(a.shaft.work, `${a.shaft.id} の work`).toBeDefined();
  });

  it('ためした 回数が 1 か所の 表の 上限 〔`shaftShapeTable().limit.tries`〕を こえない', () => {
    const L = tablesOf().shape.limit.tries;
    const bad: string[] = [];
    for (const a of all) for (const k of WORK_KEYS) if ((a.shaft.work?.[k] ?? 0) > L[k]) bad.push(`${a.shaft.id}: ${k} ${a.shaft.work?.[k]} 回〔上限 ${L[k]}〕`);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('広さ 128 の 計画の 仕事の 平均が 広さ 64 の 4.8 倍 以下〔面積の 比 4 に 2 割〕', () => {
    const mean = (xs: ESample[]): number => sum(xs.map((a) => totalWork(a.shaft))) / xs.length;
    const m64 = mean(bySize(all, 64));
    const m128 = mean(bySize(all, 128));
    expect(m64, '広さ 64 の 仕事').toBeGreaterThan(0);
    expect(m128 / m64, `仕事の 比〔128: ${m128.toFixed(1)}・64: ${m64.toFixed(1)}〕`).toBeLessThanOrEqual(tablesOf().shape.limit.workRatio);
    expect(tablesOf().shape.limit.workRatio, '表の 比は 仕様の 4.8 倍 いか').toBeLessThanOrEqual(4.8);
  });
});

describe('E19: 列 1 つで 見る 区画・光る ブロック', () => {
  /** いちばん 大きい 坑道の 箱の まわりの 列〔外がわ 1 列 ふくむ〕 */
  function colsAround(s: BokenShaft): { cx: number; cz: number }[] {
    const out: { cx: number; cz: number }[] = [];
    for (let cz = (s.box.z0 >> 4) - 1; cz <= (s.box.z1 >> 4) + 1; cz++) for (let cx = (s.box.x0 >> 4) - 1; cx <= (s.box.x1 >> 4) + 1; cx++) out.push({ cx, cz });
    return out;
  }
  const biggest = (n: number): ESample[] =>
    [...bySize(all, 128)].sort((a, b) => (b.shaft.style?.floors ?? 0) - (a.shaft.style?.floors ?? 0) || (b.shaft.maze ? 1 : 0) - (a.shaft.maze ? 1 : 0)).slice(0, n);

  it('列 1 つで 見る 坑道の 区画は 4 つ まで〔箱 128 の まわりの 列 ぜんぶ〕', () => {
    const limit = tablesOf().shape.limit.regionsPerCol;
    expect(limit, '表の 上限は 仕様の 4').toBeLessThanOrEqual(4);
    let cols = 0;
    let max = 0;
    for (const a of biggest(6)) {
      const h = hookE(a.seed);
      needBokenHook(h, ['work']);
      for (const c of colsAround(a.shaft)) {
        const r = h.work(c.cx, c.cz).shaftRegions;
        cols++;
        max = Math.max(max, r);
        expect(r, `seed ${a.seed} 列 (${c.cx}, ${c.cz})`).toBeLessThanOrEqual(limit);
      }
    }
    expect(cols, '見た 列').toBeGreaterThan(100);
    expect(max, '1 つ 以上は 見て いる').toBeGreaterThan(0);
  });

  it('読みこんだ 列の 数で ふえない〔となり合う 列を たくさん 見ても 1 列で 見る 数は 同じ〕', () => {
    expect(biggest(1).length, '広さ 128 の 1E の 坑道が ない').toBeGreaterThan(0);
    const a = biggest(1)[0]!;
    const h = hookE(a.seed);
    needBokenHook(h, ['work']);
    const c = colsAround(a.shaft)[0]!;
    const first = h.work(c.cx, c.cz).shaftRegions;
    for (const o of colsAround(a.shaft)) h.work(o.cx, o.cz);
    expect(h.work(c.cx, c.cz).shaftRegions).toBe(first);
  });

  it('光る ブロックは 1 列 80 こ まで〔かくしべやの 中も 数える〕', () => {
    const limit = tablesOf().shape.limit.torchesPerCol;
    expect(limit).toBeLessThanOrEqual(80);
    let cols = 0;
    for (const a of biggest(6)) {
      const h = hookE(a.seed);
      for (const c of colsAround(a.shaft)) {
        cols++;
        expect(h.work(c.cx, c.cz).emitters, `seed ${a.seed} 列 (${c.cx}, ${c.cz})`).toBeLessThanOrEqual(limit);
      }
    }
    expect(cols).toBeGreaterThan(100);
  });
});

describe('E19: たいまつの 数', () => {
  /** 道の まわり〔左右 2 マス・下 1 〜 上 4〕の たいまつの 数〔同じ マスは 1 回〕 */
  function torchesNear(g: GenCols, cells: readonly PathCell[]): number {
    const seen = new Set<string>();
    for (const c of cells) {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 4; dy++) {
        const x = c.x + dx;
        const y = c.y + dy;
        const z = c.z + dz;
        const k = `${x},${y},${z}`;
        if (seen.has(k)) continue;
        if (g.id(x, y, z) === 'torch') seen.add(k);
      }
    }
    return seen.size;
  }

  it('坑道 1 つの たいまつは 表の 上限〔320 本〕まで・迷路 1 つ 16 本 まで〔いちばん 大きい 性格 ほか 6 こ ずつ〕', () => {
    const S = tablesOf().shape;
    expect(S.limit.torchesPerShaft, '表の 上限は 仕様の 320').toBeLessThanOrEqual(320);
    expect(S.maze.torchMax, '表の 迷路の 上限は 仕様の 16').toBeLessThanOrEqual(16);
    const big = [...bySize(all, 128)].sort((a, b) => (b.shaft.style?.floors ?? 0) - (a.shaft.style?.floors ?? 0)).slice(0, 4);
    const mazes = all.filter((a) => a.shaft.maze).sort((a, b) => (a.shaft.style?.size ?? 0) - (b.shaft.style?.size ?? 0)).slice(0, 4);
    expect(big.length, '大きい 坑道').toBeGreaterThan(0);
    expect(mazes.length, '迷路の ある 坑道').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const a of big) {
      const h = hookE(a.seed);
      needBokenHook(h, ['shaftPath']);
      const g = new GenCols(a.seed);
      const n = torchesNear(g, h.shaftPath(a.shaft.id));
      if (n > S.limit.torchesPerShaft) bad.push(`seed ${a.seed} ${a.shaft.id}: たいまつ ${n} 本〔上限 ${S.limit.torchesPerShaft}〕`);
    }
    for (const a of mazes) {
      const g = new GenCols(a.seed);
      // 迷路の 四角の 中〔外がわの かべ ふくむ。E9 と 同じ 箱〕だけ 数える。外の 本道・ひろばの たいまつは 入れない
      const m = a.shaft.maze!;
      let n = 0;
      for (let x = m.box.x0; x <= m.box.x1; x++) for (let z = m.box.z0; z <= m.box.z1; z++) for (let y = m.y; y <= m.y + S.maze.height; y++) if (g.id(x, y, z) === 'torch') n++;
      if (n > S.maze.torchMax) bad.push(`seed ${a.seed} ${a.shaft.id}: 迷路の たいまつ ${n} 本〔上限 ${S.maze.torchMax}〕`);
    }
    expect(bad).toEqual([]);
  });
});

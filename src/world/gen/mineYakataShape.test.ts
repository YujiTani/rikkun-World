import { beforeAll, describe, expect, it, vi } from 'vitest';
import { reachOf } from './mineBokenReport';
import { GenCols, SEEDS_20, type PathCell } from './mineShaftKit';
import { LOOKS, SEED_POOL_F, needYakataHook, tableOf, yakataPathCells, yakataSample, type Look, type YakataSampleRow } from './mineYakataKit';
import { lightProblemsF, placeProblemsF, shapeProblemsF, torchProblemsF, walkProblemsF, yakataBox } from './mineYakataReport';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.2・§4.3 の 形・§4.10 の 光る ブロック・受け入れ基準 F2・F17〔ためす 数・たいまつ 16〕）: やかたの 形を ブロックで しらべる。
 *
 *   新しい 世界の シード〔20 シードから はじめて、A・B が 6 つずつ そろうまで 足す〕で、スタートに 近い やかたを 1 シード 3 つまで あつめて、ブロックを 作って しらべる。
 *   数は ぜんぶ 表〔`yakataTable()`〕から 読む〔#311〕。時間〔ms〕では 合否を きめない。
 *   ・横穴: 表の 長さ・はば・高さ・平ら・曲がり 0・口が ほかの 口から 6 マス 以上・光 6 以上・口の 柱・たいまつは 3 マスごと 左右 こうご
 *   ・門: 表の はば × 高さ〔12 マス〕・床の 高さが 大広間と 同じ
 *   ・大広間: 床 17×17 で 平ら・空気は 床から 7 マス・柱 4 本〔まん中の 道 はば 5 を あける〕・出入り口は 門 だけ・かべ 外がわ 2 マスは ふつうの いし・床の 下 2 マス 固い
 *   ・祭壇 2 段〔1 段ずつ〕・宝箱 2 マスが 上の 段の まん中で 前が 門の ほう〔`chestAt` が 表 yakata・段 4〕・出る 場所の 候補 12〔左・右・前 4 ずつ〕
 *   ・look の 組の ブロック だけ〔ほかの 組が 1 こも まざらない〕・床・祭壇の 立てる マスが 光 `minLight` 以上・たいまつ `maxTorches` 本 以下
 *   ・入口と 横穴・大広間の どの 床・祭壇の 上が 行き来 できる・1E の ほかの 道と かさならない・区画の 中・海の 下 10
 * 赤の 確かめ: 1F の 前は やかたが なく「やかたが ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 900_000 });

const PER_LOOK = 6;
const count = (rows: readonly YakataSampleRow[], look: Look): number => rows.filter((r) => r.yakata.look === look).length;

let rows: YakataSampleRow[] = [];
beforeAll(() => {
  rows = yakataSample((all) => LOOKS.every((l) => count(all, l) >= PER_LOOK), { perSeed: 3, pool: SEED_POOL_F });
}, 1200_000); // CI は ほかの テストと 同時に 回るので 余裕を みる

const genOf = new Map<number, GenCols>();
const gOf = (seed: number): GenCols => {
  let g = genOf.get(seed);
  if (!g) genOf.set(seed, (g = new GenCols(seed)));
  return g;
};
const tag = (r: YakataSampleRow): string => `seed ${r.seed} ${r.shaft.id}〔${r.yakata.look}〕`;
const fail = (what: string, bad: string[]): void => expect(bad.slice(0, 8), `${what}: ${bad.length} つ`).toEqual([]);

/** 行ごとの 計算を 1 回ずつ〔道さがし・光は 重い〕 */
const memo = new Map<string, unknown>();
function once<T>(r: YakataSampleRow, key: string, make: () => T): T {
  const k = `${r.seed}|${r.shaft.id}|${key}`;
  if (!memo.has(k)) memo.set(k, make());
  return memo.get(k) as T;
}
const pathOf = (r: YakataSampleRow): PathCell[] => once(r, 'path', () => r.hook.shaftPath(r.shaft.id));

describe('F2: やかたの 標本', () => {
  it('はじまりの 20 シードを 見て、A・B の やかたが 6 つずつ あつまる〔くじで 見つけた やかた〕', () => {
    needYakataHook(rows[0]?.hook ?? (undefined as never), ['yakataTable']);
    expect(SEEDS_20.length).toBe(20);
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    for (const l of LOOKS) expect(count(rows, l), `${l} の やかた`).toBeGreaterThanOrEqual(PER_LOOK);
    expect(new Set(rows.map((r) => r.shaft.id)).size, '同じ 坑道を 2 回 数えて いない').toBe(rows.length);
    for (const r of rows) {
      expect(r.shaft.gen, `${tag(r)} は 1E の 坑道`).toBe('e');
      expect(r.shaft.style?.depth, `${tag(r)} は ふかい 坑道`).toBe('fukai');
    }
  });
});

describe('F2: 形〔横穴・門・大広間・祭壇・宝箱・出る 場所〕', () => {
  it('表の とおり〔ブロックを 作って しらべる〕。ほかの 組の ブロックが 1 こも まざらない', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    const T = tableOf();
    const bad: string[] = [];
    for (const r of rows) {
      const g = gOf(r.seed);
      for (const m of shapeProblemsF(g, r.shaft, T, (x, y, z) => r.hook.chestAt(x, y, z)).slice(0, 4)) bad.push(`${tag(r)}: ${m}`);
    }
    fail('形', bad);
  });

  it('道の まわり: 横穴の 光 6 以上・大広間の 床・祭壇の 立てる マスは minLight 以上', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    const T = tableOf();
    const bad: string[] = [];
    for (const r of rows) for (const m of once(r, 'light', () => lightProblemsF(gOf(r.seed), r.shaft, T)).slice(0, 4)) bad.push(`${tag(r)}: ${m}`);
    fail('光', bad);
  });

  it('あやしい たいまつ: maxTorches 本 以下・大広間に 4 本 以上・横穴は 3 マスごと 左右 こうご', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    const T = tableOf();
    const bad: string[] = [];
    for (const r of rows) for (const m of torchProblemsF(gOf(r.seed), r.shaft, T).slice(0, 4)) bad.push(`${tag(r)}: ${m}`);
    fail('たいまつ', bad);
  });

  it('shaftPath の part が yakata の 足の マス〔横穴・大広間・祭壇の 上〕が あり、道の 足の マスは 空気の マス・caveAt が yakata', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    const T = tableOf();
    const bad: string[] = [];
    for (const r of rows) {
      const cells = yakataPathCells(pathOf(r));
      const y = r.yakata;
      const have = new Set(cells.map((c) => `${c.x},${c.y},${c.z}`));
      if (cells.length < y.passage.length + 17 * 17 - 20) bad.push(`${tag(r)}: yakata の 足の マスが ${cells.length} こ〔少ない〕`);
      for (const c of y.passage) if (!have.has(`${c.x},${c.y},${c.z}`)) bad.push(`${tag(r)}: 横穴 (${c.x}, ${c.y}, ${c.z}) が shaftPath に ない`);
      for (const c of cells.slice(0, 40)) {
        if (r.hook.caveAt(c.x, c.y, c.z) !== 'yakata') bad.push(`${tag(r)}: caveAt (${c.x}, ${c.y}, ${c.z}) が ${String(r.hook.caveAt(c.x, c.y, c.z))}`);
      }
      const b = yakataBox(y, T);
      if (r.hook.caveAt(b.x1 + 5, y.hall.y, b.z1 + 5) === 'yakata') bad.push(`${tag(r)}: やかたの 外が yakata`);
    }
    fail('shaftPath・caveAt', bad);
  });

  it('入口と 横穴・大広間の どの 床・祭壇の 上が 行き来 できる〔道さがし。MINE-1 §6.1 の 歩ける きまり〕', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    const T = tableOf();
    const bad: string[] = [];
    for (const r of rows) {
      const g = gOf(r.seed);
      const b = yakataBox(r.yakata, T);
      const s = r.shaft;
      const big = { ...s, box: { x0: Math.min(s.box.x0, b.x0), z0: Math.min(s.box.z0, b.z0), x1: Math.max(s.box.x1, b.x1), z1: Math.max(s.box.z1, b.z1) } };
      const reach = once(r, 'reach', () => reachOf(g, big));
      expect(reach.fwd.capped, `${tag(r)}: 道さがしが 打ちきり`).toBeFalsy();
      for (const m of walkProblemsF(g, r.shaft, T, (p) => reach.ok(p)).slice(0, 3)) bad.push(`${tag(r)}: ${m}`);
    }
    fail('道さがし', bad);
  });

  it('1E の ほかの 道・へやと かさならない〔まわり 2〕・区画の 中・海の 下 10・天井の 上の 石', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    const T = tableOf();
    const bad: string[] = [];
    for (const r of rows) for (const m of placeProblemsF(r.seed, r.shaft, pathOf(r), T)) bad.push(`${tag(r)}: ${m}`);
    fail('場所', bad);
  });

  it('やかたの 口が 1E の ほかの 口〔横穴・迷路の 入口〕から 6 マス 以上', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const r of rows) {
      const m = r.yakata.passage[0]!;
      const others = [...r.shaft.sides.map((d) => d.from), ...(r.shaft.maze ? [r.shaft.maze.entrance] : []), ...(r.shaft.branches ?? []).map((b) => b.from)];
      for (const o of others) if (o.y === m.y && Math.max(Math.abs(o.x - m.x), Math.abs(o.z - m.z)) < 6) bad.push(`${tag(r)}: 口 (${m.x}, ${m.z}) が (${o.x}, ${o.z}) から 6 マス いない`);
      // 口は いちばん 下の 階の 本道か ひろばの そば〔1 マス うしろが 道の マス〕
      const path = pathOf(r);
      const d = r.yakata.passage[1] ? { dx: r.yakata.passage[1].x - m.x, dz: r.yakata.passage[1].z - m.z } : { dx: 0, dz: 0 };
      const near = path.some((c) => ((c.part as string) === 'main' || (c.part as string) === 'hiroba') && c.y === m.y && Math.max(Math.abs(c.x - (m.x - d.dx)), Math.abs(c.z - (m.z - d.dz))) <= 2);
      if (!near) bad.push(`${tag(r)}: 口 (${m.x}, ${m.z}) の うしろに 本道・ひろばが ない`);
    }
    fail('口', bad);
  });
});

describe('F17: 計画の 仕事・光る ブロックの 上限', () => {
  it('ためす 候補の 数 `work.yakata` が 表の 上限 `shaftShapeTable().limit.tries.yakata` いない・やかたの ある 坑道は 1 以上', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    for (const r of rows) {
      const lim = (r.hook.shaftShapeTable().limit.tries as unknown as Record<string, number | undefined>)['yakata'];
      expect(lim, '表の 上限 limit.tries.yakata').toBeTypeOf('number');
      const w = (r.shaft.work as unknown as Record<string, number | undefined> | undefined)?.['yakata'];
      expect(w, `${tag(r)} の work.yakata`).toBeTypeOf('number');
      expect(w!, `${tag(r)}`).toBeGreaterThanOrEqual(1);
      expect(w!, `${tag(r)}`).toBeLessThanOrEqual(lim!);
    }
  });

  it('やかた 1 つの あやしい たいまつは 表の maxTorches 本 まで〔torchProblemsF〕・やかたの かかる 列の 光る ブロックは 1 列 80 こ まで〔`work(cx, cz).emitters` ≦ 表の `torchesPerCol`〕', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    const T = tableOf();
    expect(T.maxTorches).toBeGreaterThan(0);
    const limit = rows[0]!.hook.shaftShapeTable().limit;
    const bad: string[] = [];
    for (const r of rows) {
      const b = yakataBox(r.yakata, T);
      for (let cz = b.z0 >> 4; cz <= b.z1 >> 4; cz++) {
        for (let cx = b.x0 >> 4; cx <= b.x1 >> 4; cx++) {
          const n = r.hook.work(cx, cz).emitters;
          if (n > limit.torchesPerCol) bad.push(`${tag(r)}: 列 (${cx}, ${cz}) の 光る ブロック ${n} こ〔${limit.torchesPerCol} まで〕`);
        }
      }
    }
    fail('光る ブロック', bad);
  });
});

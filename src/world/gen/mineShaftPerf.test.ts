import { beforeAll, describe, expect, it } from 'vitest';
import { colKey } from '../stream/ring';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SEEDS_20, GenCols, hook1c, sampleShafts, type Shaft } from './mineShaftKit';

/**
 * MINE-1C（docs/design/MINE-1.md §4.9・§6.1 `work`・受け入れ基準 C14 の【ユニット】の 分）: 坑道の 仕事の 数。
 *
 *   ・列 1 つで 見る 区画 〔`work(cx, cz).shaftRegions`〕は 4 つ まで。読みこんだ 列の 数・場所で ふえない
 *     〔同じ 列は いつ 数えても 同じ・ほかの 列を 先に 作っても 同じ〕
 *   ・生成で 置く 光る ブロック〔たいまつ・ほたるいし。`work(cx, cz).emitters`〕は 1 列 80 こ まで。かくれた ほたるいしも 数える
 *     → 窓口の 数だけで なく、実際に 作った 列の たいまつ・ほたるいしの 数も 80 以下で、窓口の 数は それ 以上〔ごまかさない〕
 *   ・坑道が かからない 列は 区画 0〔むだな しごとを しない〕・かかる 列〔道が 通る 列〕は 1 以上
 *   生成 8 ms・描画回数 ＋4・三角形 ＋20% は perf〔npm run perf。E2E では ms で 合否を しない〕。保存 1 回の 行の「12 バイト／列」は
 *   src/save/mine1cSave.test.ts〔C9〕。つらら〔1 本 三角形 16〕は 1D。
 *
 *   `mine.work` は 今の `__rikkun.work`〔#255〕とは べつ の 物〔仕様 §6.1〕。
 */

/** 区画の 上の 限り〔仕様 §4.9「坑道の 区画 4 つ まで」〕と 光る ブロックの 上の 限り〔「1 列 80 こ まで」〕 */
const LIMIT = { shaftRegions: 4, emitters: 80 } as const;
const SEEDS = SEEDS_20.slice(0, 4);

const TORCH = BLOCK_INDEX.torch;
const HOTARU = (BLOCK_INDEX as unknown as Record<string, number | undefined>).hotaruishi;

/** 作った 列の 中の たいまつ・ほたるいしの 数 */
function glowing(g: GenCols, cx: number, cz: number): number {
  const col = g.col(cx, cz);
  let n = 0;
  for (let i = 0; i < col.length; i++) if (col[i] === TORCH || (HOTARU !== undefined && col[i] === HOTARU)) n++;
  return n;
}

interface One {
  seed: number;
  shafts: Shaft[];
  g: GenCols;
  /** 道が 通る 列 */
  onPath: Set<number>;
  /** 見る 列〔道が 通る 列 ぜんぶ ＋ そのまわり ＋ 道から 遠い 列〕 */
  cols: { cx: number; cz: number }[];
}
const ones: One[] = [];

beforeAll(() => {
  for (const seed of SEEDS) {
    const s = sampleShafts(seed, 2);
    const onPath = new Set<number>();
    const cols = new Map<number, { cx: number; cz: number }>();
    const add = (cx: number, cz: number): void => void cols.set(colKey(cx, cz), { cx, cz });
    for (const shaft of s.shafts) {
      for (const c of s.hook.shaftPath(shaft.id)) {
        onPath.add(colKey(c.x >> 4, c.z >> 4));
        for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) add((c.x >> 4) + dx, (c.z >> 4) + dz);
      }
    }
    // 道から 遠い 列〔スタートの まわり 横 400 マス〕を 20 おきに
    const sp = s.shafts[0]!.entrance;
    for (let dx = -400; dx <= 400; dx += 20) for (let dz = -400; dz <= 400; dz += 20) add((sp.x + dx) >> 4, (sp.z + dz) >> 4);
    ones.push({ seed, shafts: s.shafts, g: s.g, onPath, cols: [...cols.values()] });
  }
}, 240_000);

describe('C14: 坑道の 仕事の 数（ユニット）', () => {
  it('見る 区画は 4 つ まで・光る ブロックは 80 こ まで〔窓口の 数〕。窓口は 数を 返す', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const o of ones) {
      const h = hook1c(o.seed);
      for (const { cx, cz } of o.cols) {
        const w = h.work(cx, cz);
        seen++;
        if (!(Number.isInteger(w.shaftRegions) && w.shaftRegions >= 0 && w.shaftRegions <= LIMIT.shaftRegions)) bad.push(`seed ${o.seed} (${cx}, ${cz}) 区画 ${w.shaftRegions}`);
        if (!(Number.isInteger(w.emitters) && w.emitters >= 0 && w.emitters <= LIMIT.emitters)) bad.push(`seed ${o.seed} (${cx}, ${cz}) 光る ブロック ${w.emitters}`);
      }
    }
    expect(seen).toBeGreaterThan(SEEDS.length * 100);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 240_000);

  it('ごまかさない: 作った 列の たいまつ・ほたるいしが 80 こ 以下で、窓口の「光る ブロック」は それ 以上', () => {
    const bad: string[] = [];
    let torches = 0;
    for (const o of ones) {
      const h = hook1c(o.seed);
      for (const { cx, cz } of o.cols) {
        const n = glowing(o.g, cx, cz);
        torches += n;
        const w = h.work(cx, cz).emitters;
        if (n > LIMIT.emitters) bad.push(`seed ${o.seed} (${cx}, ${cz}) 実際 ${n} こ`);
        if (w < n) bad.push(`seed ${o.seed} (${cx}, ${cz}) 窓口 ${w} < 実際 ${n}`);
      }
    }
    expect(torches, '坑道の たいまつが 1 本も ない').toBeGreaterThan(0);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 240_000);

  it('道が 通る 列は 区画 1 以上・坑道が かからない 列〔道の まわり 3 列の 外〕は 区画 0', () => {
    const bad: string[] = [];
    let near = 0;
    let far = 0;
    for (const o of ones) {
      const h = hook1c(o.seed);
      const around = new Set<number>();
      for (const k of o.onPath) {
        const cx = Math.floor(k / 65536) - 32768;
        const cz = (k % 65536) - 32768;
        for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) around.add(colKey(cx + dx, cz + dz));
      }
      for (const { cx, cz } of o.cols) {
        const k = colKey(cx, cz);
        const r = h.work(cx, cz).shaftRegions;
        if (o.onPath.has(k)) {
          near++;
          if (r < 1) bad.push(`seed ${o.seed} 道の 列 (${cx}, ${cz}) 区画 ${r}`);
        } else if (!around.has(k)) {
          far++;
          if (r !== 0) bad.push(`seed ${o.seed} 遠い 列 (${cx}, ${cz}) 区画 ${r}`);
        }
      }
    }
    expect(near, '道の 列').toBeGreaterThan(SEEDS.length * 10);
    expect(far, '遠い 列').toBeGreaterThan(SEEDS.length * 50);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 240_000);

  it('読みこんだ 列の 数・場所で ふえない: ほかの 列を 先に 調べ・作っても、同じ 列は 同じ 数', () => {
    const bad: string[] = [];
    for (const o of ones) {
      const fresh = hook1c(o.seed);
      const first = new Map(o.cols.map(({ cx, cz }) => [colKey(cx, cz), fresh.work(cx, cz)] as const));
      // 別の 窓口を 作り、世界の 大きな はんいの 坑道を さがして から、逆の 順で 数える
      const busy = hook1c(o.seed);
      busy.shafts(-3072, -3072, 3071, 3071);
      for (const { cx, cz } of [...o.cols].reverse()) {
        const w = busy.work(cx, cz);
        const f = first.get(colKey(cx, cz))!;
        if (w.shaftRegions !== f.shaftRegions || w.emitters !== f.emitters) bad.push(`seed ${o.seed} (${cx}, ${cz}) ${JSON.stringify(f)} → ${JSON.stringify(w)}`);
      }
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 240_000);

  it('同じ 列は 何回 数えても 同じ〔窓口は 列の 座標と シードだけで 決まる〕', () => {
    const o = ones[0]!;
    const h = hook1c(o.seed);
    const c = o.cols[0]!;
    const a = JSON.stringify(h.work(c.cx, c.cz));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(h.work(c.cx, c.cz))).toBe(a);
  });
});

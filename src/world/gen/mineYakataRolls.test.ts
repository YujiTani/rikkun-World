import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LOOKS, SEED_POOL_F, ROLL_HALF, blockIdsOf, hookF, needYakataHook, rollSample, tableOf, type Look, type RollSample, type YakataPlan } from './mineYakataKit';
import { SEEDS_20 } from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.1・§6.2 の F1・F20）: やかたの くじと 見た目の くじ〔計画だけ。ブロックは 作らない〕。
 *
 *   F1: シード いくつかの ふかい 1E の 坑道 **700 こ 以上**〔`yakataRolls`〕で `hit` の わりあいが 表の `chance` ± 0.06・当たりの 8 割 以上に 置ける〔`placed`〕。
 *       はじまりの 坑道〔20 シード〕・`gen: 'c'` の 坑道・ふかく ない 坑道は いつも `yakata` が null。同じ シードは 同じ。
 *   F20: 当たり **1,000 こ 以上**で `look` が `maou` の わりあいが 表の `looks.maou` ± 0.05・当たりで ない 坑道は `look` null・同じ シードは 同じ `look`〔ほかの 列を 先に 作っても〕。
 *        見た目が ほかに ひびかない〔20 こ。モジュールの `yakataPlanFor(seed, id, { looks })` を `{ 1, 0 }` と `{ 0, 1 }` で くらべる〕。A・B の ブロックの id は かさならない。
 *   保存して 開きなおしても・まけて 3 回 やり直しても 同じ は `mine1fSave.test.ts`・`mineYakataRun.test.ts`。
 * 数は 表から 読む〔#311〕。時間〔ms〕では 合否を きめない〔重い のは 標本 づくり 1 回 だけ〕。
 * 赤の 確かめ: 1F の 前は 窓口〔`yakataRolls`・`yakataTable`〕が なく「窓口が まだ ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 900_000 });

/** 仕様の 数の 下限〔F1 700・F20 1,000〕 */
const NEED = { deep: 700, hits: 1000 } as const;

const plans = import.meta.glob<{ yakataPlanFor?: (seed: number, shaftId: string, opt?: { looks?: Record<Look, number> }) => YakataPlan | null }>('./mineYakataPlan.ts', { eager: true });
const planFor = (): NonNullable<(typeof plans)[string]['yakataPlanFor']> => {
  const fn = Object.values(plans)[0]?.yakataPlanFor;
  if (typeof fn !== 'function') throw new Error('やかたの 計画の モジュール `src/world/gen/mineYakataPlan.ts` の 関数 `yakataPlanFor(seed, shaftId, opt?)` が まだ ない〔仕様 §6.1〕');
  return fn;
};

let all: RollSample[] = [];
let used = 0;
beforeAll(() => {
  const hits = (s: readonly RollSample[]): number => s.filter((r) => r.roll.hit).length;
  const r = rollSample((s) => s.length >= NEED.deep && hits(s) >= NEED.hits);
  all = r.all;
  used = r.seeds;
}, 1200_000); // CI は ほかの テストと 同時に 回るので 余裕を みる

describe('F1: くじ', () => {
  it('ふかい 1E の 坑道が 700 こ 以上 あつまる〔窓口 `yakataRolls`・`yakataTable` が ある〕', () => {
    expect(tableOf().chance, 'やかたの 表の chance').toBeGreaterThan(0);
    expect(all.length, `ふかい 1E の 坑道〔${used} シード〕`).toBeGreaterThanOrEqual(NEED.deep);
  });

  it('当たりの わりあいが 表の chance ± 0.06・当たりの 8 割 以上に 置ける〔placed〕・置けた ものは 当たり', () => {
    const T = tableOf();
    expect(all.length, 'ふかい 1E の 坑道').toBeGreaterThanOrEqual(NEED.deep);
    const hit = all.filter((r) => r.roll.hit);
    expect(Math.abs(hit.length / all.length - T.chance), `当たり ${hit.length} / ${all.length}`).toBeLessThanOrEqual(0.06);
    const placed = hit.filter((r) => r.roll.placed);
    expect(placed.length / hit.length, `置けた ${placed.length} / 当たり ${hit.length}`).toBeGreaterThanOrEqual(0.8);
    expect(all.filter((r) => r.roll.placed && !r.roll.hit).length, '当たりで ないのに 置けた').toBe(0);
  });

  it('同じ シードは 同じ くじ〔窓口を 作りなおしても・べつの はんいから 先に よんでも〕', () => {
    for (const seed of SEED_POOL_F.slice(0, 3)) {
      const sp = spawnOf(seed);
      const win: [number, number, number, number] = [sp.x - ROLL_HALF, sp.z - ROLL_HALF, sp.x + ROLL_HALF - 1, sp.z + ROLL_HALF - 1];
      const a = hookF(seed);
      needYakataHook(a, ['yakataRolls']);
      const first = a.yakataRolls(...win);
      const b = hookF(seed);
      // 先に 北東の はんいを よんで から 全体を よぶ〔作る 順が ちがっても 同じ〕
      b.yakataRolls(sp.x, sp.z - ROLL_HALF, sp.x + ROLL_HALF - 1, sp.z - 1);
      expect(b.yakataRolls(...win), `seed ${seed}`).toEqual(first);
      expect(first.length, `seed ${seed} の ふかい 1E の 坑道`).toBeGreaterThan(0);
    }
  });

  it('はじまりの 坑道〔20 シード〕は いつも やかた なし', () => {
    for (const seed of SEEDS_20) {
      const h = hookF(seed);
      needYakataHook(h, ['yakataTable']);
      const s = h.startShaft() as { yakata?: unknown; gen?: string };
      expect(s.gen, `seed ${seed}`).toBe('c');
      expect(s.yakata ?? null, `seed ${seed} の はじまりの 坑道に やかた`).toBeNull();
    }
  });

  it('1C・1D の 形〔gen: c〕の 坑道・ふかく ない 1E の 坑道は やかた なし。ふかい 1E の 坑道は 置けた ときだけ あり〔くじと 同じ〕', () => {
    let checked = 0;
    let deepE = 0;
    for (const seed of SEED_POOL_F.slice(0, 4)) {
      const h = hookF(seed);
      needYakataHook(h, ['yakataRolls']);
      const sp = spawnOf(seed);
      const half = 1536;
      const shafts = h.shafts(sp.x - half, sp.z - half, sp.x + half - 1, sp.z + half - 1);
      const rolls = new Map(h.yakataRolls(sp.x - half, sp.z - half, sp.x + half - 1, sp.z + half - 1).map((r) => [r.shaft, r] as const));
      for (const s of shafts) {
        const deep = s.gen === 'e' && s.style?.depth === 'fukai';
        if (!deep) {
          expect(s.yakata ?? null, `seed ${seed} ${s.id}〔gen ${String(s.gen)}・${s.style?.depth ?? '-'}〕`).toBeNull();
          expect(rolls.has(s.id), `${s.id} は くじの 行に ない`).toBe(false);
          checked++;
          continue;
        }
        deepE++;
        const r = rolls.get(s.id);
        expect(r, `${s.id} の くじ`).toBeDefined();
        expect(s.yakata !== null && s.yakata !== undefined, `${s.id}: やかたの あり なし〔placed ${String(r?.placed)}〕`).toBe(r!.placed);
        if (s.yakata) {
          expect(s.yakata.hit).toBe(true);
          expect(s.yakata.look, `${s.id} の 見た目`).toBe(r!.look);
        }
      }
    }
    expect(checked, '1C・1D の 形・ふかく ない 坑道').toBeGreaterThan(0);
    expect(deepE, 'ふかい 1E の 坑道').toBeGreaterThan(0);
  });
});

describe('F20: 見た目の くじ', () => {
  it('当たりが 1,000 こ 以上 あつまる', () => {
    expect(all.filter((r) => r.roll.hit).length, `当たり〔${used} シード〕`).toBeGreaterThanOrEqual(NEED.hits);
  });

  it('maou の わりあいが 表の looks.maou ± 0.05・look は 当たりの ときだけ ある〔当たりで ない 坑道は null〕', () => {
    const T = tableOf();
    expect(T.looks.maou + T.looks.otera, '表の looks の ごうけい').toBeCloseTo(1, 6);
    const hit = all.filter((r) => r.roll.hit);
    expect(hit.length).toBeGreaterThanOrEqual(NEED.hits);
    for (const r of hit) expect(LOOKS, `${r.roll.shaft} の look`).toContain(r.roll.look);
    for (const r of all.filter((x) => !x.roll.hit)) expect(r.roll.look, `${r.roll.shaft}〔当たりで ない〕`).toBeNull();
    const maou = hit.filter((r) => r.roll.look === 'maou').length / hit.length;
    expect(Math.abs(maou - T.looks.maou), `maou ${maou.toFixed(3)}〔当たり ${hit.length}〕`).toBeLessThanOrEqual(0.05);
  });

  it('同じ シードは 同じ look〔窓口を 作りなおしても・ほかの 坑道の 計画を 先に 作っても〕', () => {
    const rows = all.filter((r) => r.roll.hit).slice(0, 12);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const h = hookF(r.seed);
      // 近くの 窓を 先に よぶ〔坑道の 計画の 順を かえる〕
      const sp = spawnOf(r.seed);
      h.yakataRolls(sp.x + 1024, sp.z + 1024, sp.x + 2047, sp.z + 2047);
      const row = h.yakataRolls(sp.x - ROLL_HALF, sp.z - ROLL_HALF, sp.x + ROLL_HALF - 1, sp.z + ROLL_HALF - 1).find((x) => x.shaft === r.roll.shaft);
      expect(row?.look, `${r.roll.shaft}`).toBe(r.roll.look);
    }
  });

  it('見た目が ほかに ひびかない: looks を { maou: 1, otera: 0 } と { maou: 0, otera: 1 } に して くらべる〔20 こ〕と、look だけが ちがう', () => {
    const fn = planFor();
    const rows = all.filter((r) => r.roll.placed).slice(0, 20);
    expect(rows.length, '置けた やかた').toBe(20);
    const A: Record<Look, number> = { maou: 1, otera: 0 };
    const B: Record<Look, number> = { maou: 0, otera: 1 };
    const bad: string[] = [];
    for (const r of rows) {
      const a = fn(r.seed, r.roll.shaft, { looks: A });
      const b = fn(r.seed, r.roll.shaft, { looks: B });
      if (!a || !b) {
        bad.push(`${r.roll.shaft}: 計画が null`);
        continue;
      }
      if (a.yakata.look !== 'maou' || b.yakata.look !== 'otera') bad.push(`${r.roll.shaft}: look が ${a.yakata.look}・${b.yakata.look}`);
      const strip = (y: YakataPlan['yakata']): Omit<YakataPlan['yakata'], 'look'> => {
        const { look: _l, ...rest } = y;
        return rest;
      };
      if (JSON.stringify(strip(a.yakata)) !== JSON.stringify(strip(b.yakata))) bad.push(`${r.roll.shaft}: 場所・形が look で かわる`);
      if (JSON.stringify(a.foes) !== JSON.stringify(b.foes)) bad.push(`${r.roll.shaft}: 7 ひきが look で かわる`);
      if (JSON.stringify(a.chestPreview) !== JSON.stringify(b.chestPreview)) bad.push(`${r.roll.shaft}: 中身が look で かわる`);
      // 表の looks を かえない ままの 計画は くじの 答えと 同じ
      const c = fn(r.seed, r.roll.shaft);
      if (c?.yakata.look !== r.roll.look) bad.push(`${r.roll.shaft}: 表の まま の look ${String(c?.yakata.look)}〔くじ ${String(r.roll.look)}〕`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('A・B の やかたが 1 つずつ あり、lookBlocks の 組は ブロックの id が 1 こも かさならない・どちらも 4 つ ちがう id', () => {
    const T = tableOf();
    const a = blockIdsOf(T, 'maou');
    const b = blockIdsOf(T, 'otera');
    expect(new Set(a).size, 'A の 4 つ').toBe(4);
    expect(new Set(b).size, 'B の 4 つ').toBe(4);
    expect(a.filter((id) => b.includes(id)), 'A と B で かさなる id').toEqual([]);
    const hit = all.filter((r) => r.roll.placed);
    expect(hit.some((r) => r.roll.look === 'maou'), 'A の やかた').toBe(true);
    expect(hit.some((r) => r.roll.look === 'otera'), 'B の やかた').toBe(true);
  });

  it('モジュールの 入口 `yakataPlanFor` と 窓口の `__rikkun.mine.yakataPlanFor` が 同じ 答え', () => {
    const fn = planFor();
    const rows = all.filter((r) => r.roll.placed).slice(0, 3);
    expect(rows.length).toBe(3);
    for (const r of rows) {
      const h = hookF(r.seed);
      needYakataHook(h, ['yakataPlanFor']);
      expect(h.yakataPlanFor(r.roll.shaft), r.roll.shaft).toEqual(fn(r.seed, r.roll.shaft));
    }
  });
});

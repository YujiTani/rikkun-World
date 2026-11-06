import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CAVE_KINDS, CAVE_RULES, SEEDS_3, areaAround, hookCave, lotteryCaves, needCaveHook, type CaveKind, type CaveRoll } from './mineCaveKit';
import type { Layer } from './mineShaftKit';

/**
 * MINE-1D（docs/design/MINE-1.md §4.7.1・受け入れ基準 D1）: 抽選。
 *
 *   区画〔64×64〕× 層 ごとに 1 回 抽選〔`caveRolls`。わりあいは 窓口の 表 `caveTable()` から 読む。#311〕。
 *   ・わりあいが 表の ± 0.03〔すいしょうの ほらあなは ± 0.015〕・シード 3 つ × 1,000 区画 いじょう〔32×32 区画〕
 *   ・1 区画 1 層に 1 つ まで〔抽選の 行は 区画 × 層で 1 つ。部屋も 区画 × 層に 1 つ まで〕
 *   ・部屋は 区画の ふちから 4 マス 内がわ〔box が 区画の 中〕
 *   ・陸の 区画〔land ≥ 0.5〕で 当たりの 8 割 以上が 置ける〔placed〕
 *   ・置いた 抽選と 部屋の 一覧〔caves〕が 合う〔種類・区画・層〕
 *
 * 【自分で 決めた 窓口】 `mineCaveKit.ts` の 先頭〔caveTable・caveRolls の land・Cave.box〕。
 * 赤の 確かめ: 1D の 前は `mine.caveRolls` が なく「窓口が まだ ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 120_000 });

/** 「陸の 区画」の 目安〔区画の 陸の わりあい〕。部屋は 区画より 小さい ので 半分 以上 陸なら 置ける はず */
const LAND = 0.5;
const REGIONS_STAT = 32; // 32 × 32 ＝ 1,024 区画
const REGIONS_CAVES = 12; // 部屋の 一覧を くらべる はんい〔12 × 12 区画〕
const LAYERS: readonly Layer[] = ['asai', 'nakahodo', 'fukai'];

interface Sample {
  seed: number;
  rolls: CaveRoll[];
}
const samples: Sample[] = [];

beforeAll(() => {
  for (const seed of SEEDS_3) {
    const h = hookCave(seed);
    needCaveHook(h, ['caveRolls', 'caveTable', 'caves']);
    const a = areaAround(seed, REGIONS_STAT);
    samples.push({ seed, rolls: h.caveRolls(a.x0, a.z0, a.x1, a.z1) });
  }
}, 120_000);

const key = (r: { rx: number; rz: number; layer: string }): string => `${r.rx},${r.rz},${r.layer}`;

describe('D1: 抽選のわりあい', () => {
  it('抽選の 行が 集まる〔シード 3 つ × 1,000 区画 いじょう × 3 層〕・同じ 区画の 同じ 層に 2 回 ない', () => {
    for (const s of samples) {
      const keys = s.rolls.map(key);
      expect(new Set(keys).size, `seed ${s.seed}: 区画 × 層の 重なり`).toBe(keys.length);
      expect(new Set(s.rolls.map((r) => `${r.rx},${r.rz}`)).size, `seed ${s.seed}: 区画の 数`).toBeGreaterThanOrEqual(1000);
    }
  });

  it('表の 層ごとに わりあいが ± 0.03〔すいしょうの ほらあなは ± 0.015〕・表に ない 種類は その 層に 出ない', () => {
    const table = hookCave(SEEDS_3[0]!).caveTable();
    expect(table.length, '抽選の 表').toBeGreaterThan(0);
    for (const row of table) {
      const rolls = samples.flatMap((s) => s.rolls.filter((r) => r.layer === row.layer));
      expect(rolls.length, `層 ${row.layer} の 抽選`).toBeGreaterThanOrEqual(3000);
      for (const kind of CAVE_KINDS) {
        const want = row.kinds[kind] ?? 0;
        const got = rolls.filter((r) => r.kind === kind).length / rolls.length;
        const tol = kind === 'suisho' ? 0.015 : 0.03;
        expect(Math.abs(got - want), `層 ${row.layer} ${kind}: 表 ${want} に 対して ${got.toFixed(4)}`).toBeLessThanOrEqual(tol);
      }
    }
    // 表に 行が ない 層〔例: ふかい 層に ひろい ほらあな〕には 当たりが ない
    const tableLayers = new Set(table.map((t) => t.layer));
    for (const l of LAYERS) if (!tableLayers.has(l)) expect(samples.flatMap((s) => s.rolls).filter((r) => r.layer === l && r.kind !== null), `表に ない 層 ${l}`).toEqual([]);
  });

  it('当たりの 総数が 表の 当たり わりあいの 和と 合う〔種類の ぬけが ない〕', () => {
    const table = hookCave(SEEDS_3[0]!).caveTable();
    for (const row of table) {
      const total = Object.values(row.kinds).reduce((a, b) => a + b, 0);
      const rolls = samples.flatMap((s) => s.rolls.filter((r) => r.layer === row.layer));
      const hit = rolls.filter((r) => r.kind !== null).length / rolls.length;
      expect(Math.abs(hit - total), `層 ${row.layer} の 当たり ${hit.toFixed(4)}`).toBeLessThanOrEqual(0.03);
    }
  });
});

describe('D1: 置ける・区画の 中・1 区画 1 層に 1 つ', () => {
  it('当たりで ない 行は placed が false・陸の 区画〔land ≥ 0.5〕の 当たりの 8 割 以上が 置ける', () => {
    let want = 0;
    let got = 0;
    for (const s of samples) {
      for (const r of s.rolls) {
        if (r.kind === null) {
          expect(r.placed, `seed ${s.seed} 区画 (${r.rx}, ${r.rz}) ${r.layer} は はずれ`).toBe(false);
          continue;
        }
        if (r.land >= LAND) {
          want++;
          if (r.placed) got++;
        }
      }
    }
    expect(want, '陸の 当たり').toBeGreaterThanOrEqual(300);
    expect(got / want, `置けた ${got} / 当たり ${want}`).toBeGreaterThanOrEqual(0.8);
  });

  it('置いた 抽選と 部屋の 一覧が 合う〔区画・層・種類〕・1 区画 1 層に 部屋は 1 つ まで・部屋は 区画の ふちから 4 マス 内がわ・大きさの 目安の 層', () => {
    const R = CAVE_RULES.region;
    const E = CAVE_RULES.edge;
    for (const seed of SEEDS_3) {
      const h = hookCave(seed);
      const a = areaAround(seed, REGIONS_CAVES);
      const rolls = h.caveRolls(a.x0, a.z0, a.x1, a.z1);
      const caves = lotteryCaves(h, a);
      const placed = rolls.filter((r) => r.placed);
      expect(caves.length, `seed ${seed} の 部屋`).toBeGreaterThan(0);
      expect(caves.length, `seed ${seed}: 置いた 抽選の 数 と 部屋の 数`).toBe(placed.length);
      const byKey = new Map<string, CaveKind>();
      for (const r of placed) byKey.set(key(r), r.kind!);
      const seen = new Set<string>();
      for (const c of caves) {
        const rx = Math.floor(c.center.x / R);
        const rz = Math.floor(c.center.z / R);
        const k = key({ rx, rz, layer: c.layer });
        expect(seen.has(k), `seed ${seed}: 区画 (${rx}, ${rz}) ${c.layer} に 2 つ`).toBe(false);
        seen.add(k);
        expect(byKey.get(k), `seed ${seed}: 部屋 ${c.id} の 抽選`).toBe(c.kind);
        const b = c.box;
        expect(b.x0, `${c.id} 西`).toBeGreaterThanOrEqual(rx * R + E);
        expect(b.x1, `${c.id} 東`).toBeLessThanOrEqual(rx * R + R - 1 - E);
        expect(b.z0, `${c.id} 北`).toBeGreaterThanOrEqual(rz * R + E);
        expect(b.z1, `${c.id} 南`).toBeLessThanOrEqual(rz * R + R - 1 - E);
      }
    }
  });

  it('同じ シードは 同じ 抽選〔2 回 よんでも 同じ〕・シードが ちがえば ちがう', () => {
    const [s0, s1] = SEEDS_3 as [number, number, number];
    const a = areaAround(s0, 6);
    const x = hookCave(s0).caveRolls(a.x0, a.z0, a.x1, a.z1);
    const y = hookCave(s0).caveRolls(a.x0, a.z0, a.x1, a.z1);
    expect(y).toEqual(x);
    const z = hookCave(s1).caveRolls(a.x0, a.z0, a.x1, a.z1);
    expect(JSON.stringify(z.map((r) => r.kind))).not.toBe(JSON.stringify(x.map((r) => r.kind)));
  });
});

import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CAVE_KINDS,
  CAVE_RULES,
  CAVE_SPEC,
  SEEDS_3,
  areaAround,
  hookCave,
  lotteryCaves,
  needCaveHook,
  type Cave,
  type CaveKind,
  type MineHook1D,
} from './mineCaveKit';
import { plainRate, reportRoom, type RoomReport } from './mineCaveReport';
import { GenCols } from './mineShaftKit';

/**
 * MINE-1D（docs/design/MINE-1.md §4.7.2・§4.7.3・受け入れ基準 D2・D3・D4・D5・D12 の ユニットの 一部）: 部屋の 大きさ・中身・安全・歩いて 出られる。
 *
 *   シード 3 つの 抽選の 部屋 ぜんぶ〔スタートの まわり 12 × 12 区画〕と、種類ごとに `findCave` で 見つけた 部屋を、**生成した ブロック**で しらべる。
 *   ・D2: 種類ごとの 大きさ〔`Cave.size` ＝ box〕・層・部屋の 空気が ぜんぶ その 層の 中
 *   ・D3: 中身〔ひろい: かべの せきたん＋てつの わりあいが 同じ 層の ふつうの 列の 2 倍 以上・てつ 10 こ 以上／しょうにゅうどう: つらら 12 こ 以上・かべと 天井の 4 割 以上が せっかいせき／
 *        ちていこ: 池〔ふかさ 1〜2・横 10〜16〕・ねんど 30 こ 以上・岸から 水へ 1 段／ほたる: 見える ほたるいし 24〜32／すいしょう: すいしょうの いし 16〜24〕
 *   ・D4: 床の 下 2 マス 固い・かべの 穴は 行き来 できるか ふさがれて いる〔床から 4 以上 上・下の 穴 なし〕・地面まで 8／海まで 10・池 2 まで・床の 段差 1 まで
 *   ・D5: 9 割 以上の 部屋で 歩いて 出られる〔部屋の 床の どこからも 穴を 出て 外を 4 マス 以上 すすみ、もどれる〕・のこりは 穴の ない ひみつの 部屋
 *   ・窓口の 数〔`caveStats`〕が 実際の ブロックと 合う
 *
 * 数は 窓口の 表と、`mineCaveKit.ts` の 表〔仕様 §4.7.2 の 写し〕から 読む〔#311〕。歩ける きまりは 仕様 §6.1〔`mineShaftKit.ts` の stepTo〕。
 * 重い 生成なので beforeAll で 1 回だけ しらべて ためる〔時間切れの ゆとり〕。ms では 合否を 決めない。
 * 赤の 確かめ: 1D の 前は 窓口〔caves〕が なく「窓口が まだ ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 120_000 });

const REGIONS = 12;

interface Row extends RoomReport {
  h: MineHook1D;
}
const rows: Row[] = [];
const hooks = new Map<number, MineHook1D>();
const rateCache = new Map<string, Record<string, { ore: number; wall: number }>>();

beforeAll(() => {
  for (const seed of SEEDS_3) {
    const h = hookCave(seed);
    needCaveHook(h, ['caves', 'findCave', 'caveStats', 'caveAt', 'layers', 'columnOres', 'caveSpec']);
    hooks.set(seed, h);
    const g = new GenCols(seed);
    const a = areaAround(seed, REGIONS);
    const found = new Map<string, Cave>();
    for (const c of lotteryCaves(h, a)) found.set(c.id, c);
    for (const kind of CAVE_KINDS) {
      const c = h.findCave(kind);
      if (c && c.shaft === null) found.set(c.id, c);
    }
    const layers = h.layers();
    for (const c of found.values()) rows.push({ ...reportRoom(seed, g, h, c, layers), h });
  }
}, 280_000);

const of = (kind: CaveKind): Row[] => rows.filter((r) => r.cave.kind === kind);
const tag = (r: Row): string => `seed ${r.seed} ${r.cave.id} (${r.cave.kind}) 中心 (${r.cave.center.x}, ${r.cave.center.y}, ${r.cave.center.z})`;

describe('D2: 部屋が あつまる・種類ごとの 大きさと 層', () => {
  it('シード 3 つで 部屋が 集まる・ひろい・しょうにゅうどう・ちていこ・ほたるは どれも 1 つ 以上', () => {
    expect(rows.length).toBeGreaterThanOrEqual(30);
    for (const kind of ['hiroi', 'shonyudo', 'chiteiko', 'hotaru'] as const) expect(of(kind).length, kind).toBeGreaterThanOrEqual(1);
  });

  it('findCave: 種類が 合う・探した 先〔4,096 マス 以内〕で いちばん 近い', () => {
    for (const seed of SEEDS_3) {
      const h = hooks.get(seed)!;
      const a = areaAround(seed, REGIONS);
      const sp = { x: (a.x0 + a.x1) >> 1, z: (a.z0 + a.z1) >> 1 };
      const all = lotteryCaves(h, a);
      for (const kind of CAVE_KINDS) {
        const c = h.findCave(kind, sp);
        const near = all.filter((q) => q.kind === kind);
        if (near.length === 0) continue;
        expect(c, `seed ${seed} ${kind}`).not.toBeNull();
        expect(c!.kind).toBe(kind);
        const dist = (q: Cave): number => Math.hypot(q.center.x - sp.x, q.center.z - sp.z);
        expect(dist(c!), `seed ${seed} ${kind} の 一番 近い`).toBeLessThanOrEqual(Math.min(...near.map(dist)) + 1e-6);
        expect(dist(c!), `seed ${seed} ${kind} は 4,096 以内`).toBeLessThanOrEqual(4096);
      }
    }
  });

  it('大きさ〔box ＝ size〕が 種類の はんい・層が 種類の 層・部屋の 空気が ぜんぶ その 層の 中', () => {
    for (const r of rows) {
      expect(r.problems.size, `${tag(r)} の 大きさ`).toEqual([]);
      expect(r.problems.layer, `${tag(r)} の 層`).toEqual([]);
    }
  });

  it('caveAt: 部屋の 立てる マスは 種類を 答え、部屋の 外〔box の 外 3 マス〕は 同じ 種類を 答えない', () => {
    for (const r of rows) {
      const h = r.h;
      const b = r.cave.box;
      expect(h.caveAt(b.x0 - 3, b.y0 + 1, b.z0 - 3), tag(r)).not.toBe(r.cave.kind);
      expect(h.caveAt(b.x1 + 3, b.y1 + 3, b.z1 + 3), tag(r)).not.toBe(r.cave.kind);
      expect(r.counts.floor, `${tag(r)} の 立てる マス`).toBeGreaterThan(0);
    }
  });
});

describe('D3: 中身', () => {
  it('ひろい ほらあな: かべの せきたん＋てつの わりあいが 同じ 層の ふつうの 列の 2 倍 以上・てつ 10 こ 以上・なかほどでも せきたんが 出る', () => {
    const list = of('hiroi');
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const r of list) {
      const key = `${r.seed}`;
      if (!rateCache.has(key)) rateCache.set(key, plainRate(r.h, r.seed, ['asai', 'nakahodo']));
      const base = rateCache.get(key)![r.cave.layer]!;
      expect(base.wall, `${tag(r)}: ふつうの 列の かべ`).toBeGreaterThan(0);
      const baseRate = base.ore / base.wall;
      const coal = r.stats.visible['coal_ore'] ?? 0;
      const iron = r.stats.visible['iron_ore'] ?? 0;
      expect(r.stats.wall, `${tag(r)}: かべ`).toBeGreaterThan(0);
      const rate = (coal + iron) / r.stats.wall;
      expect(rate, `${tag(r)}: 部屋 ${rate.toFixed(4)} / ふつう ${baseRate.toFixed(4)}`).toBeGreaterThanOrEqual(baseRate * CAVE_RULES.hiroi.wallOreTimes);
      expect(iron, `${tag(r)} の てつ`).toBeGreaterThanOrEqual(CAVE_RULES.hiroi.ironMin);
      expect(r.exposed['iron_ore'] ?? 0, `${tag(r)} の ブロックの てつ`).toBeGreaterThanOrEqual(CAVE_RULES.hiroi.ironMin);
      if (r.cave.layer === 'nakahodo') expect(coal, `${tag(r)} の せきたん〔なかほど〕`).toBeGreaterThan(0);
    }
  });

  it('しょうにゅうどう: つらら 12 こ 以上・かべと 天井の 4 割 以上が せっかいせき', () => {
    const list = of('shonyudo');
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const r of list) {
      expect(r.tsurara, `${tag(r)} の つらら`).toBeGreaterThanOrEqual(CAVE_RULES.shonyudo.tsuraraMin);
      expect(r.shell.total, `${tag(r)} の かべ`).toBeGreaterThan(0);
      const share = r.shell.sekkaiseki / r.shell.total;
      expect(share, `${tag(r)}: せっかいせき ${r.shell.sekkaiseki} / かべ ${r.shell.total}`).toBeGreaterThanOrEqual(CAVE_RULES.shonyudo.sekkaisekiShare);
    }
  });

  it('ちていこ: 池〔ふかさ 1〜2・横 10〜16〕・ねんど 30 こ 以上・岸から 水へ 1 段', () => {
    const list = of('chiteiko');
    expect(list.length).toBeGreaterThanOrEqual(1);
    const c = CAVE_RULES.chiteiko;
    for (const r of list) {
      expect(r.pond.columns, `${tag(r)} の 池`).toBeGreaterThan(0);
      expect(r.pond.depth, `${tag(r)} の ふかさ`).toBeGreaterThanOrEqual(c.pondDepth[0]);
      expect(r.pond.depth, `${tag(r)} の ふかさ`).toBeLessThanOrEqual(c.pondDepth[1]);
      expect(r.pond.w, `${tag(r)} の 池の 横`).toBeGreaterThanOrEqual(c.pondWidth[0]);
      expect(r.pond.w, `${tag(r)} の 池の 横`).toBeLessThanOrEqual(c.pondWidth[1]);
      expect(r.pond.d, `${tag(r)} の 池の たて`).toBeGreaterThanOrEqual(c.pondWidth[0]);
      expect(r.pond.d, `${tag(r)} の 池の たて`).toBeLessThanOrEqual(c.pondWidth[1]);
      expect(r.exposed['nendo'] ?? 0, `${tag(r)} の 見える ねんど`).toBeGreaterThanOrEqual(c.nendoMin);
      expect(r.stats.visible['nendo'] ?? 0, `${tag(r)} の 窓口の ねんど`).toBeGreaterThanOrEqual(c.nendoMin);
      expect(r.problems.bank.slice(0, 3), `${tag(r)} の 岸〔${r.problems.bank.length} つ〕`).toEqual([]);
    }
  });

  it('ほたるの ほらあな: 見える ほたるいし 24〜32〔ブロックの 予算の 例外の 上の 限り 32〕', () => {
    const list = of('hotaru');
    expect(list.length).toBeGreaterThanOrEqual(1);
    const [lo, hi] = CAVE_RULES.hotaru.visible;
    for (const r of list) {
      expect(r.exposed['hotaruishi'] ?? 0, `${tag(r)} の ブロックの ほたるいし`).toBeGreaterThanOrEqual(lo);
      expect(r.exposed['hotaruishi'] ?? 0, `${tag(r)} の ブロックの ほたるいし`).toBeLessThanOrEqual(hi);
      expect(r.stats.visible['hotaruishi'] ?? 0, `${tag(r)} の 窓口の ほたるいし`).toBeGreaterThanOrEqual(lo);
      expect(r.stats.visible['hotaruishi'] ?? 0, `${tag(r)} の 窓口の ほたるいし`).toBeLessThanOrEqual(hi);
    }
  });

  it('すいしょうの ほらあな: すいしょうの いし 16〜24', () => {
    const list = of('suisho');
    if (list.length === 0) throw new Error('すいしょうの ほらあなが 1 つも 見つからない〔findCave〕');
    const [lo, hi] = CAVE_RULES.suisho.visible;
    for (const r of list) {
      expect(r.exposed['suisho_ore'] ?? 0, `${tag(r)} の ブロックの すいしょう`).toBeGreaterThanOrEqual(lo);
      expect(r.exposed['suisho_ore'] ?? 0, `${tag(r)} の ブロックの すいしょう`).toBeLessThanOrEqual(hi);
      expect(r.stats.visible['suisho_ore'] ?? 0, `${tag(r)} の 窓口の すいしょう`).toBeGreaterThanOrEqual(lo);
      expect(r.stats.visible['suisho_ore'] ?? 0, `${tag(r)} の 窓口の すいしょう`).toBeLessThanOrEqual(hi);
    }
  });

  it('窓口の 数が 実際の ブロックと 合う〔つらら・見える 鉱物。1 割か 2 こまでの ちがいは ゆるす〕', () => {
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(2, Math.ceil(Math.max(a, b) * 0.1));
    for (const r of rows) {
      expect(r.stats.tsurara, `${tag(r)} の つらら`).toBe(r.tsurara);
      for (const id of ['nendo', 'sekkaiseki', 'hotaruishi', 'suisho_ore', 'iron_ore', 'coal_ore']) {
        const own = r.exposed[id] ?? 0;
        const stat = r.stats.visible[id] ?? 0;
        expect(near(own, stat), `${tag(r)} の ${id}: ブロック ${own} / 窓口 ${stat}`).toBe(true);
      }
    }
  });
});

describe('D4: 安全', () => {
  it('床の 下 2 マスは 固い〔holesUnder 0〕・池の 底も', () => {
    for (const r of rows) {
      expect(r.stats.holesUnder, `${tag(r)} の holesUnder`).toBe(0);
      expect(r.problems.under.slice(0, 3), `${tag(r)} 〔${r.problems.under.length} つ〕`).toEqual([]);
    }
  });

  it('地面〔海の 下は 海の 底〕まで 8 マス 以上・海の 下は 10 以上〔roofToGround〕', () => {
    for (const r of rows) {
      expect(r.stats.roofToGround, `${tag(r)} の roofToGround`).toBeGreaterThanOrEqual(CAVE_RULES.roof.ground);
      expect(r.problems.roof.slice(0, 3), `${tag(r)} 〔${r.problems.roof.length} つ〕`).toEqual([]);
    }
  });

  it('池の ふかさ 2 まで〔pondDepth〕', () => {
    for (const r of rows) {
      expect(r.stats.pondDepth, `${tag(r)} の pondDepth`).toBeLessThanOrEqual(CAVE_RULES.chiteiko.pondDepth[1]);
      expect(r.pond.depth, `${tag(r)} の ブロックの 池`).toBeLessThanOrEqual(CAVE_RULES.chiteiko.pondDepth[1]);
    }
  });

  it('どの 部屋も 床の 段差 1 まで〔floorStep。立てる マスの 4 方向の となり〕', () => {
    for (const r of rows) {
      expect(r.stats.floorStep, `${tag(r)} の floorStep`).toBeLessThanOrEqual(1);
      expect(r.problems.step.slice(0, 3), `${tag(r)} 〔${r.problems.step.length} つ〕`).toEqual([]);
    }
  });

  it('かべの 穴は どれも 部屋の 床と 行き来 できるか ふさがれて いる〔床から 4 以上 上・下の 穴 なし〕', () => {
    for (const r of rows) expect(r.problems.hole.slice(0, 3), `${tag(r)} 〔${r.problems.hole.length} つ〕`).toEqual([]);
  });
});

describe('D5: 歩いて 出られる', () => {
  it('部屋の 床は ひとつながり〔どこからも どこへも 行き来 できる〕', () => {
    for (const r of rows) expect(r.exit.floorOut, `${tag(r)}: 行き来 できない 床の マス`).toBe(0);
  });

  it('9 割 以上の 部屋で 歩いて 出られる〔穴を 出て 外を 4 マス 以上 すすみ もどれる〕・のこりは 穴の ない ひみつの 部屋〔openings 0〕', () => {
    const ok = rows.filter((r) => r.exit.has && r.exit.outside);
    const secret = rows.filter((r) => !(r.exit.has && r.exit.outside));
    expect(ok.length / rows.length, `出られる ${ok.length} / ${rows.length}`).toBeGreaterThanOrEqual(CAVE_RULES.exitShare);
    for (const r of secret) expect(r.stats.openings, `${tag(r)}: 出口が ないのに 穴が ある`).toBe(0);
  });

  it('穴の 数 openings と linked が 合う〔穴が あれば linked・ひみつの 部屋は false〕', () => {
    for (const r of rows) expect(r.cave.linked, `${tag(r)}: openings ${r.stats.openings}`).toBe(r.stats.openings > 0);
  });
});

describe('D2〜D5: 同じ シードは 同じ 部屋', () => {
  it('部屋の 一覧が 2 回 よんで 同じ・種類の はんいの 表に 種類が そろう', () => {
    const seed = SEEDS_3[0]!;
    const a = areaAround(seed, 6);
    const x = lotteryCaves(hookCave(seed), a);
    const y = lotteryCaves(hookCave(seed), a);
    expect(y).toEqual(x);
    for (const k of CAVE_KINDS) expect(CAVE_SPEC[k].layers.length).toBeGreaterThan(0);
  });
});

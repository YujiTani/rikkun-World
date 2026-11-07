import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEAD_END_KINDS,
  DEPTHS,
  LEVELS,
  SEED_POOL,
  bigSample,
  cheb,
  hookE,
  inSpan,
  needBokenHook,
  sum,
  tablesOf,
  type ESample,
  type Level,
} from './mineBokenKit';
import { SEEDS_20, components, pathIndex } from './mineShaftKit';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.1〜§4.7・受け入れ基準 E1・E2・E4 の 形の きまり・E6・E7・E9・E10 の わりあい）: 坑道の 計画〔ブロックは 作らない〕。
 *
 *   新しい 世界の 1E の 坑道〔`gen: 'e'`〕を シード いくつかで **1 回だけ** あつめて〔E1 1,300 こ・E6 えだ道 1,200 本・E7 行きどまり 3,000 こ・E9 迷路 250 こ〕、
 *   わりあいを 表〔`shaftStyleTable()`・`shaftShapeTable()`・`deadEndTable()`〕と くらべる。数は 表から 読む〔#311〕。ブロックを 作って しらべる 所は
 *   mineBokenBlocks.test.ts・mineBokenEnds.test.ts。**時間〔ms〕では 合否を きめない**〔重い のは 標本 づくり 1 回 だけ〕。
 * 赤の 確かめ: 1E の 前は `gen`・表の 窓口が なく「1E の 坑道が ない」「窓口が まだ ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 600_000 });

/** 数の 下限〔仕様の 数: E1 1,300・E6 1,200・E7 3,000・E9 250〕 */
const NEED = { shafts: 1300, eda: 1200, ends: 3000, mazes: 250 } as const;
const edaOf = (all: readonly ESample[]): number => sum(all.map((a) => a.shaft.branches?.length ?? 0));
const endsOf = (all: readonly ESample[]): number => sum(all.map((a) => (a.shaft.branches?.length ?? 0) + Math.max(0, (a.shaft.maze?.deadEnds.length ?? 0) - 1)));
const mazesOf = (all: readonly ESample[]): number => all.filter((a) => a.shaft.maze).length;

let all: ESample[] = [];
let used = 0;
beforeAll(() => {
  const r = bigSample((s) => s.length >= NEED.shafts && edaOf(s) >= NEED.eda && endsOf(s) >= NEED.ends && mazesOf(s) >= NEED.mazes);
  all = r.all;
  used = r.seeds;
}, 900_000); // CI は ほかの テストと 同時に 回るので 余裕を みる

describe('E1: 性格', () => {
  it('はじまりの 坑道〔20 シード〕は gen が c・style が null。同じ シードは 同じ 性格〔窓口を 作りなおしても 同じ〕', () => {
    for (const seed of SEEDS_20) {
      const h = hookE(seed);
      const s = h.startShaft();
      expect(s.gen, `seed ${seed} の gen`).toBe('c');
      expect(s.style, `seed ${seed} の style`).toBeNull();
    }
    expect(all.length, `1E の 坑道〔${used} シード〕`).toBeGreaterThanOrEqual(NEED.shafts);
    for (const a of all.slice(0, 20)) {
      const again = hookE(a.seed).shafts(a.shaft.box.x0, a.shaft.box.z0, a.shaft.box.x1, a.shaft.box.z1).find((s) => s.id === a.shaft.id);
      expect(again?.style, `${a.shaft.id}`).toEqual(a.shaft.style);
    }
  });

  it('ふかさ・広さ・ふくざつさ・キャンプの わりあいが 表から ±0.06', () => {
    const T = tablesOf().style;
    const n = all.length;
    expect(n).toBeGreaterThanOrEqual(NEED.shafts);
    for (const d of T.depth) expect(Math.abs(all.filter((a) => a.shaft.style?.depth === d.id).length / n - d.chance), `ふかさ ${d.id}`).toBeLessThanOrEqual(0.06);
    for (const z of T.size) expect(Math.abs(all.filter((a) => a.shaft.style?.size === z.size).length / n - z.chance), `広さ ${z.size}`).toBeLessThanOrEqual(0.06);
    for (const l of T.level) expect(Math.abs(all.filter((a) => a.shaft.style?.level === l.id).length / n - l.chance), `ふくざつさ ${l.id}`).toBeLessThanOrEqual(0.06);
    expect(Math.abs(all.filter((a) => a.shaft.style?.camp).length / n - T.camp), 'キャンプ').toBeLessThanOrEqual(0.06);
  });

  it('迷路の わりあいが ふくざつさ ごとに 表から ±0.08・maze の ありなしが style.maze と 合う・ます数が 表の とおり', () => {
    const T = tablesOf().style;
    for (const l of T.level) {
      const of = all.filter((a) => a.shaft.style?.level === l.id);
      expect(of.length, `ふくざつさ ${l.id} の 坑道`).toBeGreaterThanOrEqual(100);
      expect(Math.abs(of.filter((a) => a.shaft.style?.maze).length / of.length - l.maze), `迷路 ${l.id}`).toBeLessThanOrEqual(0.08);
      for (const a of of) {
        const tag = `${a.shaft.id} ${l.id}`;
        expect(a.shaft.maze !== null && a.shaft.maze !== undefined, `${tag}: maze と style.maze`).toBe(a.shaft.style!.maze);
        if (a.shaft.maze) expect(a.shaft.maze.grid, `${tag}: ます数`).toBe(l.mazeGrid);
      }
    }
  });

  it('階の 数・横穴・えだ道の 本数が 表の はんい〔階の 数 ＝ style.floors・いちばん 下の へやからの 横穴は 0〜1〕', () => {
    const T = tablesOf().style;
    const bad: string[] = [];
    for (const a of all) {
      const s = a.shaft;
      const st = s.style!;
      const dep = T.depth.find((d) => d.id === st.depth)!;
      const lev = T.level.find((l) => l.id === st.level)!;
      const tag = `${s.id} ${st.depth} ${st.level}`;
      if (!inSpan(st.floors, dep.floors)) bad.push(`${tag}: 階の 数 ${st.floors}`);
      if ((s.floors?.length ?? -1) !== st.floors) bad.push(`${tag}: floors ${s.floors?.length} ≠ style.floors ${st.floors}`);
      for (let f = 0; f < st.floors; f++) {
        const n = s.sides.filter((d) => d.floor === f).length;
        if (!inSpan(n, lev.sides)) bad.push(`${tag}: 階 ${f} の 横穴 ${n} 本`);
      }
      const bottomSides = s.sides.filter((d) => d.floor === -1).length;
      if (bottomSides > 1) bad.push(`${tag}: いちばん 下の へやからの 横穴 ${bottomSides} 本`);
      if (s.sides.some((d) => d.floor === undefined || d.floor < -1 || d.floor >= st.floors)) bad.push(`${tag}: sides[].floor が おかしい`);
      const bs = s.branches ?? [];
      s.sides.forEach((_, i) => {
        const n = bs.filter((b) => b.side === i).length;
        if (!inSpan(n, lev.eda)) bad.push(`${tag}: 横穴 ${i} の えだ道 ${n} 本`);
      });
      if (bs.length > lev.edaMax) bad.push(`${tag}: えだ道 ${bs.length} 本 > 上限 ${lev.edaMax}`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('さか道の 本数が 坑道ごとに 3 とおり 以上〔shaftPath の さか道の かたまり。標本 150 こ〕', () => {
    const counts = new Set<number>();
    const picked = all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 150)) === 0).slice(0, 150);
    for (const a of picked) {
      const h = hookE(a.seed);
      needBokenHook(h, ['shaftPath']);
      counts.add(components(pathIndex(h.shaftPath(a.shaft.id)).byPart.get('ramp') ?? []).length);
    }
    expect(counts.size, `さか道の 本数 ${[...counts].sort((x, y) => x - y).join(',')}`).toBeGreaterThanOrEqual(3);
    expect(Math.min(...counts), '1 本 以上').toBeGreaterThanOrEqual(1);
  }, 600_000);
});

describe('E2: 階〔計画〕', () => {
  it('いちばん 下の 階の y が ふかさの はんい・となりの 階と 16 以上・いちばん 上の 階は 入口から 12 以上 下・通る 層ごとに 階 1 つ 以上', () => {
    const S = tablesOf().shape.floor;
    const layers = hookE(SEED_POOL[0]!).layers();
    const bad: string[] = [];
    for (const a of all) {
      const s = a.shaft;
      const ys = (s.floors ?? []).map((f) => f.y).sort((p, q) => q - p);
      const tag = `${s.id} ${s.style!.depth}`;
      if (ys.length === 0) {
        bad.push(`${tag}: floors が ない`);
        continue;
      }
      const bottom = ys[ys.length - 1]!;
      if (!inSpan(bottom, S.bottomY[s.style!.depth])) bad.push(`${tag}: いちばん 下の 階の y ${bottom}`);
      for (let i = 1; i < ys.length; i++) if (ys[i - 1]! - ys[i]! < S.gapMin) bad.push(`${tag}: 階の あいだ ${ys[i - 1]! - ys[i]!}`);
      if (s.entrance.y - ys[0]! < S.topBelowEntrance) bad.push(`${tag}: いちばん 上の 階が 入口から ${s.entrance.y - ys[0]!}`);
      const passed = layers.filter((l) => l.minY <= s.entrance.y && (l.maxY === null || l.maxY >= bottom));
      if (ys.length >= passed.length) {
        for (const l of passed) if (!ys.some((y) => y >= l.minY && (l.maxY === null || y <= l.maxY))) bad.push(`${tag}: 層 ${l.id} に 階が ない`);
      }
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('本道の 長さ〔歩数 ＝ main.length − 1〕が ふくざつさ の はんい・曲がり 1 まで・下り口の ある 階だけ 見る。いちばん 下の 階は 下り口が null', () => {
    const T = tablesOf();
    const bad: string[] = [];
    for (const a of all) {
      const s = a.shaft;
      const lev = T.style.level.find((l) => l.id === s.style!.level)!;
      const fl = [...(s.floors ?? [])].sort((p, q) => q.y - p.y);
      fl.forEach((f, i) => {
        const tag = `${s.id} 階 ${i}`;
        if (f.bends > T.shape.floor.main.bendsMax) bad.push(`${tag}: 本道の 曲がり ${f.bends}`);
        if (i === fl.length - 1) {
          if (f.down !== null) bad.push(`${tag}: いちばん 下の 階に 下り口`);
        } else {
          if (f.down === null) bad.push(`${tag}: 下り口が ない`);
          else if (!inSpan(f.main.length - 1, lev.mainLength)) bad.push(`${tag}: 本道の 長さ ${f.main.length - 1}〔${lev.mainLength.join('〜')}〕`);
        }
        if (f.main.some((p) => p.y !== f.y)) bad.push(`${tag}: 本道が 平らでない`);
      });
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});

describe('E4: 形の きまり〔計画〕', () => {
  it('曲がりは 本道 1・横穴 2・えだ道 1 まで・えだ道は 横穴の 番号を もち、えだ道から 分かれない〔えだ道の 口どうしは 同じ 横穴の えだ道だけ〕', () => {
    const S = tablesOf().shape;
    const bad: string[] = [];
    for (const a of all) {
      const s = a.shaft;
      for (const d of s.sides) if (d.bends > S.side.bendsMax) bad.push(`${s.id}: 横穴の 曲がり ${d.bends}`);
      for (const b of s.branches ?? []) {
        if (b.bends > S.eda.bendsMax) bad.push(`${s.id}: えだ道の 曲がり ${b.bends}`);
        if (!s.sides[b.side]) bad.push(`${s.id}: えだ道の side ${b.side} が ない`);
      }
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});

describe('E6: えだ道〔計画〕', () => {
  it('えだ道が 1,200 本 以上・長さ 6〜16・曲がり 0〜1・口の はなれ〔横穴の 口・おわりから 4・ほかの えだ道の 口から 6〕', () => {
    const S = tablesOf().shape.eda;
    const bad: string[] = [];
    let n = 0;
    for (const a of all) {
      const s = a.shaft;
      const bs = s.branches ?? [];
      n += bs.length;
      bs.forEach((b, i) => {
        const tag = `${s.id} えだ道 ${i}`;
        if (!inSpan(b.length, S.length)) bad.push(`${tag}: 長さ ${b.length}`);
        if (!inSpan(b.bends, [0, S.bendsMax])) bad.push(`${tag}: 曲がり ${b.bends}`);
        const side = s.sides[b.side];
        if (side && (cheb(b.from, side.from) < S.mouthGapSide || cheb(b.from, side.to) < S.mouthGapSide)) bad.push(`${tag}: 口が 横穴の 口・おわりに ${Math.min(cheb(b.from, side.from), cheb(b.from, side.to))} マス`);
        bs.forEach((o, j) => {
          if (j > i && o.side === b.side && cheb(o.from, b.from) < S.mouthGapEda) bad.push(`${tag}: 別の えだ道の 口と ${cheb(o.from, b.from)} マス`);
        });
        if (!b.end) bad.push(`${tag}: おわり〔end〕が ない`);
      });
    }
    expect(n, 'えだ道').toBeGreaterThanOrEqual(NEED.eda);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('むかしの えだ道の わりあいが 表から ±0.05・その うち 口に くずれた いしの ある わりあいが 表から ±0.08・くずれた いしは 6 こ・むかしでない えだ道には ない', () => {
    const S = tablesOf().shape.eda;
    const bs = all.flatMap((a) => a.shaft.branches ?? []);
    expect(bs.length).toBeGreaterThanOrEqual(NEED.eda);
    const old = bs.filter((b) => b.old);
    expect(Math.abs(old.length / bs.length - S.oldShare), `むかし ${old.length} / ${bs.length}`).toBeLessThanOrEqual(0.05);
    const rub = old.filter((b) => b.rubble.length > 0);
    expect(Math.abs(rub.length / old.length - S.rubbleShare), `くずれた いし ${rub.length} / ${old.length}`).toBeLessThanOrEqual(0.08);
    for (const b of rub) expect(b.rubble.length, 'くずれた いしの こすう').toBe(S.rubbleCells);
    expect(bs.filter((b) => !b.old && b.rubble.length > 0).length, 'むかしでない えだ道の くずれた いし').toBe(0);
  });
});

describe('E7: 行きどまりの くじ〔計画〕', () => {
  it('行きどまり 3,000 こ 以上〔迷路の いちばん おくは のぞく〕で 6 つの 結果の わりあいが 表から ±0.03〔5% の 物は ±0.015〕・表の 合計 1', () => {
    const D = tablesOf().dead;
    expect(D.kinds.map((k) => k.kind).sort()).toEqual([...DEAD_END_KINDS].sort());
    expect(sum(D.kinds.map((k) => k.chance)), '表の 合計').toBeCloseTo(1, 9);
    const ends = all.flatMap((a) => [...(a.shaft.branches ?? []).map((b) => b.end), ...(a.shaft.maze?.deadEnds ?? []).filter((_, i) => i !== a.shaft.maze!.farthest)]);
    expect(ends.length, '数えた 行きどまり').toBeGreaterThanOrEqual(NEED.ends);
    for (const k of D.kinds) {
      const got = ends.filter((e) => e.kind === k.kind).length / ends.length;
      const tol = k.chance <= 0.05 ? 0.015 : 0.03;
      expect(Math.abs(got - k.chance), `${k.kind}: 表 ${k.chance} に 対して ${got.toFixed(4)}`).toBeLessThanOrEqual(tol);
    }
    expect(ends.filter((e) => !DEAD_END_KINDS.includes(e.kind)).length, '表に ない 結果').toBe(0);
  });
});

describe('E9: 迷路〔計画〕', () => {
  it('迷路の ある 坑道が 250 こ 以上・横 4×grid＋1・行きどまり 2〜4・いちばん おくは oo／naka で わりあい 1/3・2/3 ±0.1', () => {
    const T = tablesOf();
    const mz = all.filter((a) => a.shaft.maze);
    expect(mz.length, '迷路').toBeGreaterThanOrEqual(NEED.mazes);
    let oo = 0;
    for (const a of mz) {
      const m = a.shaft.maze!;
      const tag = a.shaft.id;
      expect(m.box.x1 - m.box.x0 + 1, `${tag}: 横`).toBe(4 * m.grid + 1);
      expect(m.box.z1 - m.box.z0 + 1, `${tag}: 縦`).toBe(4 * m.grid + 1);
      expect(inSpan(m.deadEnds.length, T.shape.maze.deadEnds), `${tag}: 行きどまり ${m.deadEnds.length}`).toBe(true);
      const far = m.deadEnds[m.farthest];
      expect(far, `${tag}: farthest`).toBeDefined();
      expect(['oo', 'naka'], `${tag}: いちばん おく`).toContain(far!.kind);
      if (far!.kind === 'oo') oo++;
    }
    expect(Math.abs(oo / mz.length - T.dead.mazeFarthest.oo), `大当たり ${oo} / ${mz.length}`).toBeLessThanOrEqual(0.1);
  });

  it('迷路の 階は いちばん 上・いちばん 下に ない〔階が 2 つの 坑道は いちばん 下に ない〕・下り口は 迷路の 外・平ら〔迷路の y が どれかの 階の y〕', () => {
    const bad: string[] = [];
    for (const a of all) {
      const s = a.shaft;
      const m = s.maze;
      if (!m) continue;
      const fl = [...(s.floors ?? [])].sort((p, q) => q.y - p.y);
      const i = fl.findIndex((f) => f.y === m.y);
      if (i < 0) bad.push(`${s.id}: 迷路の y ${m.y} が 階の y に ない`);
      else if (i === fl.length - 1) bad.push(`${s.id}: 迷路が いちばん 下の 階`);
      else if (fl.length >= 3 && i === 0) bad.push(`${s.id}: 迷路が いちばん 上の 階`);
      for (const f of fl) {
        const d = f.down;
        if (d && d.y === m.y && d.x >= m.box.x0 && d.x <= m.box.x1 && d.z >= m.box.z0 && d.z <= m.box.z1) bad.push(`${s.id}: 下り口が 迷路の 中`);
      }
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});

describe('E10: キャンプあと〔計画〕', () => {
  it('ある わりあい 1/3 ±0.06〔表の camp〕・camp の ありなしが style.camp と 合う・1 坑道 1 つ・迷路の 外・床 5×5', () => {
    const T = tablesOf();
    const n = all.length;
    expect(Math.abs(all.filter((a) => a.shaft.camp).length / n - T.style.camp), 'キャンプ').toBeLessThanOrEqual(0.06);
    for (const a of all) {
      const s = a.shaft;
      const c = s.camp;
      expect(c !== null && c !== undefined, `${s.id}: camp と style.camp`).toBe(s.style!.camp);
      if (!c) continue;
      expect(c.room.x1 - c.room.x0 + 1, `${s.id} 横`).toBe(T.shape.camp.floor);
      expect(c.room.z1 - c.room.z0 + 1, `${s.id} 縦`).toBe(T.shape.camp.floor);
      const m = s.maze;
      if (m) expect(c.room.x1 < m.box.x0 || c.room.x0 > m.box.x1 || c.room.z1 < m.box.z0 || c.room.z0 > m.box.z1 || c.room.y !== m.y, `${s.id}: キャンプが 迷路の 中`).toBe(true);
    }
  });

});

describe('E1: 性格の 表の 形', () => {
  it('ふかさ・ふくざつさ・広さが 3 つずつ・LEVELS／DEPTHS の どれも ある・わりあいの 合計 1', () => {
    const T = tablesOf().style;
    expect(T.depth.map((d) => d.id).sort()).toEqual([...DEPTHS].sort());
    expect(T.level.map((l) => l.id).sort()).toEqual([...LEVELS].sort() as Level[]);
    for (const k of [T.depth, T.size, T.level]) expect(sum(k.map((r) => r.chance)), '合計').toBeCloseTo(1, 9);
  });
});

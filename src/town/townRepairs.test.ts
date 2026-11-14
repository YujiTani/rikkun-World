import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { TOWN } from './townTuning';
import { TownRepairs, type TownRepairDeps } from './townRepairs';

/**
 * TOWN-1 1.4 AC52〜54・56・AC9（しくみ）: 妖怪の わざで かわった マスの 記録・朝の もどし・人が いる とき・保存。
 * 描画なし。時間（ms）は 使わない。数は 表（TOWN.repair）から 読む。進める のは step() の 数 と day の 数。
 */

const R = TOWN.repair;
const GROUND = 8; // 地面（草）の ブロックの y
const FAR = { x: 110.5, y: GROUND + 1, z: 110.5 }; // 街の 記録から とおい 所
const design = (_x: number, y: number, _z: number): string => (y < 1 ? 'air' : y < GROUND ? 'stone' : y === GROUND ? 'grass' : 'air');
/** 地面が 高さ top まで ぎっしり 石の 設計（立てる 所が ない 世界） */
const solidDesign = (top: number) => (_x: number, y: number, _z: number): string => (y < 1 ? 'air' : y <= top ? 'stone' : 'air');

interface Player { who: 1 | 2; x: number; y: number; z: number }

function rig(o: { unloadedFrom?: number; fixedKeeps?: (x: number, y: number, z: number) => boolean; solidTop?: number } = {}) {
  const plan = o.solidTop === undefined ? design : solidDesign(o.solidTop);
  const real = new ArrayVoxelWorld({ x: 128, y: 32, z: 128 });
  for (let x = 0; x < 128; x++) for (let z = 0; z < 128; z++) for (let y = 1; y <= (o.solidTop ?? GROUND); y++) real.setBlock(x, y, z, plan(x, y, z) as BlockId);
  const unloadedFrom = { v: o.unloadedFrom ?? 1e9 };
  const sets: { x: number; y: number; z: number; step: number }[] = [];
  let stepNo = 0;
  const world: TownRepairDeps['world'] = {
    getBlock: (x, y, z) => (x >= unloadedFrom.v ? 'outside' : real.getBlock(x, y, z)),
    setBlock: (x, y, z, id) => {
      if (x >= unloadedFrom.v) return false;
      sets.push({ x, y, z, step: stepNo });
      return real.setBlock(x, y, z, id as BlockId);
    },
    isLoaded: (x) => x < unloadedFrom.v,
    isSolid: (x, y, z) => real.isSolid(x, y, z),
  };
  const state = { day: 5 };
  const players: Player[] = [{ who: 1, ...FAR }];
  const moved: { who: number; x: number; y: number; z: number }[] = [];
  const given: { item: string; who: number }[] = [];
  const occupied = new Set<string>();
  const evicted: { x: number; y: number; z: number }[] = [];
  const fallbackSpot = { x: 64.5, y: GROUND + 1, z: 64.5 };
  const deps: TownRepairDeps = {
    world,
    plan,
    keeps: o.fixedKeeps ?? ((x) => x < 4),
    inTown: (x) => x < 100,
    day: () => state.day,
    players: () => players,
    overlaps: (p, x, y, z) => x < p.x + 0.3 && x + 1 > p.x - 0.3 && y < p.y + 1.8 && y + 1 > p.y && z < p.z + 0.3 && z + 1 > p.z - 0.3,
    movePlayer: (who, x, y, z) => {
      const p = players.find((q) => q.who === who)!;
      Object.assign(p, { x, y, z });
      moved.push({ who, x, y, z });
    },
    occupied: (x, y, z) => occupied.has(`${x},${y},${z}`),
    evict: (x, y, z) => evicted.push({ x, y, z }),
    giveBack: (item, who) => given.push({ item, who }),
    fallback: () => fallbackSpot,
  };
  const t = new TownRepairs(deps);
  t.step(); // 起動の 1 ステップめ（ここで 日を おぼえる。ロードの あとの 1 ステップめとは べつ）
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      stepNo++;
      t.step();
    }
  };
  const blockOf = (x: number, y: number, z: number): string => real.getBlock(x, y, z);
  const break_ = (cells: { x: number; y: number; z: number }[], to: 'air' | 'stone' = 'air'): void => void t.damage(cells, to);
  const morning = (n = 1): void => {
    state.day += n;
  };
  return { t, real, state, players, moved, given, occupied, evicted, step, blockOf, break_, morning, unloadedFrom, sets, fallbackSpot, stepNo: () => stepNo };
}

/** 地面の 層（y ＝ 8）の 横 w × 奥 d マスの 四角（x0, z0 から） */
const slab = (x0: number, z0: number, w: number, d: number, y = GROUND): { x: number; y: number; z: number }[] => {
  const out: { x: number; y: number; z: number }[] = [];
  for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) out.push({ x: x0 + dx, y, z: z0 + dz });
  return out;
};
const key = (c: { x: number; y: number; z: number }): string => `${c.x},${c.y},${c.z}`;

describe('記録（AC9・§2.16 の 1）', () => {
  it('こわした マスは 現在の day で 入る・keeps と 街の 外は 入らない・もう 1 回 かえると 日が 新しく なる', () => {
    const r = rig();
    r.break_([{ x: 20, y: GROUND, z: 40 }, { x: 2, y: GROUND, z: 40 }, { x: 105, y: GROUND, z: 40 }]);
    expect(r.t.repairs().cells).toEqual([{ x: 20, y: GROUND, z: 40, day: 5 }]);
    expect(r.blockOf(2, GROUND, 40), 'keeps は かわらない').toBe('grass');
    expect(r.blockOf(105, GROUND, 40), '街の 外には 手を 出さない').toBe('grass');
    r.morning();
    r.break_([{ x: 20, y: GROUND, z: 40 }], 'stone');
    expect(r.t.repairs().cells).toEqual([{ x: 20, y: GROUND, z: 40, day: 6 }]);
    expect(r.blockOf(20, GROUND, 40)).toBe('stone');
  });

  it('まとまり: 同じ 日・横の ちがいが 3 マス 以内で つながる。4 マス はなれる・日が ちがうと 別', () => {
    const r = rig();
    r.break_([{ x: 20, y: GROUND, z: 40 }, { x: 23, y: GROUND, z: 43 }, { x: 23, y: GROUND - 1, z: 43 }]); // 3・3 の ななめも つながる
    r.break_([{ x: 30, y: GROUND, z: 40 }, { x: 34, y: GROUND, z: 40 }]); // 4 マス はなれて 別
    r.morning();
    r.break_([{ x: 21, y: GROUND, z: 41 }]); // 日が ちがう
    const g = r.t.repairs().groups;
    expect(g.map((x) => [x.day, x.left]).sort()).toEqual([[5, 1], [5, 1], [5, 3], [6, 1]].sort());
    const big = g.find((x) => x.left === 3)!;
    expect(big.min).toEqual({ x: 20, y: GROUND - 1, z: 40 });
    expect(big.max).toEqual({ x: 23, y: GROUND, z: 43 });
  });
});

describe('AC52 2 日で もどる', () => {
  for (const n of [1, 5, 40]) {
    it(`n=${n}: d の うちは そのまま・d+1 の 朝に ちょうど ⌈n/2⌉・下から・2 ステップに 1 マス 以下・d+2 の 朝の あと 0`, () => {
      const r = rig();
      const cells = n === 40 ? slab(20, 40, 8, 5) : n === 5 ? slab(20, 40, 5, 1) : slab(20, 40, 1, 1);
      if (n === 5) cells.push({ x: 20, y: GROUND - 1, z: 40 }); // 2 だん（y が ひくい 方が さき）
      const want = n === 5 ? 6 : n;
      const before = cells.map((c) => r.blockOf(c.x, c.y, c.z));
      r.break_(cells);
      expect(r.t.repairs().cells.length).toBe(want);
      r.step(3600);
      expect(r.t.repairs().cells.length, 'その 日の うちは もどらない').toBe(want);
      r.morning();
      let prev = want;
      const gaps: number[] = [];
      let last = -100;
      let maxPer = 0;
      for (let i = 0; i < 400; i++) {
        r.step();
        const left = r.t.repairs().cells.length;
        if (left < prev) {
          maxPer = Math.max(maxPer, prev - left);
          gaps.push(i - last);
          last = i;
        }
        prev = left;
      }
      expect(prev, '1 晩で 半分（切り上げ）').toBe(want - Math.ceil(want / 2));
      expect(maxPer).toBeLessThanOrEqual(R.worldPerStep);
      for (const g of gaps.slice(1)) expect(g, '1 まとまりは 2 ステップに 1 マス 以下').toBeGreaterThanOrEqual(R.groupGapSteps);
      const left = new Set(r.t.repairs().cells.map(key));
      for (const c of cells) {
        if (left.has(key(c))) continue;
        expect(r.blockOf(c.x, c.y, c.z), `もどった マス ${key(c)} は 設計の まま`).toBe(design(c.x, c.y, c.z));
        expect(left.has(key({ ...c, y: c.y - 1 })), `真下が 未もどりでは ない（下から）`).toBe(false);
      }
      r.morning();
      r.step(400);
      expect(r.t.repairs().cells.length, 'd+2 の 朝の あと 0').toBe(0);
      expect(cells.map((c) => r.blockOf(c.x, c.y, c.z)), 'こわす 前と 同じ').toEqual(before);
    });
  }

  it('(d) d+1 に 1 マスを また かえると その マスの 日は 新しい 日・ほかの マスは 予定どおり', () => {
    const r = rig();
    const cells = slab(20, 40, 6, 1);
    r.break_(cells);
    r.morning();
    r.step(100);
    const left = r.t.repairs().cells.filter((c) => r.blockOf(c.x, c.y, c.z) === 'air');
    expect(left.length).toBe(3);
    const again = left[0]!;
    r.break_([again], 'stone');
    expect(r.t.repairs().cells.find((c) => key(c) === key(again))!.day).toBe(6);
    r.morning();
    r.step(200);
    const rest = r.t.repairs().cells;
    expect(rest.every((c) => key(c) === key(again)), 'のこる のは また かえた マスだけ（半分に 入らなければ）か 0').toBe(true);
    r.morning();
    r.step(200);
    expect(r.t.repairs().cells.length, 'd+3 の 朝には 0').toBe(0);
  });

  it('(e) 世界 ぜんぶで 1 ステップに 8 マス 以下・1 まとまり 2 ステップに 1 マス 以下', () => {
    const r = rig();
    const all: { x: number; y: number; z: number }[] = [];
    for (let g = 0; g < 12; g++) all.push(...slab(10 + (g % 4) * 20, 10 + Math.floor(g / 4) * 20, 4, 4)); // 12 まとまり × 16
    r.break_(all);
    r.sets.length = 0;
    r.morning();
    let prev = r.t.repairs().cells.length;
    let maxPer = 0;
    for (let i = 0; i < 40; i++) {
      r.step();
      const left = r.t.repairs().cells.length;
      maxPer = Math.max(maxPer, prev - left);
      prev = left;
    }
    expect(maxPer, '上限まで 使う').toBe(R.worldPerStep);
    const byGroup = new Map<string, number[]>();
    for (const s of r.sets) {
      const g = `${Math.floor((s.x - 10) / 20)},${Math.floor((s.z - 10) / 20)}`;
      byGroup.set(g, [...(byGroup.get(g) ?? []), s.step]);
    }
    expect(byGroup.size).toBe(12);
    for (const steps of byGroup.values()) for (let i = 1; i < steps.length; i++) expect(steps[i]! - steps[i - 1]!, '1 まとまり 2 ステップに 1').toBeGreaterThanOrEqual(R.groupGapSteps);
  });

  it('(e) すぐ もどす とき（朝の 1 ステップめの のこり）は 上限なし', () => {
    const r = rig();
    r.players[0] = { who: 1, x: 14.5, y: GROUND + 1, z: 14.5 };
    r.break_(slab(10, 10, 8, 8)); // 64 マス・人が まんなかに いて d+1 は まつ
    r.morning();
    r.step(100);
    expect(r.t.repairs().cells.length).toBe(64);
    r.morning();
    r.sets.length = 0;
    r.step(1);
    expect(r.t.repairs().cells.length, 'd+1 の 分 32 こが 1 ステップで ぜんぶ').toBeLessThanOrEqual(32);
    expect(r.sets.length).toBeGreaterThan(R.worldPerStep);
  });

  it('(g) 読みこんで いない 所（街から とおい）は 2 晩 ねても その まま 待ち、読みこんだ とき もう もどって いる（ちがう マス 0）', () => {
    const r = rig({ unloadedFrom: 60 });
    const cells = slab(70, 40, 3, 3);
    r.break_(cells); // 読みこんで いない 列は かわらない ので 先に 世界を かえて 記録だけ とる
    for (const c of cells) r.t.note(c.x, c.y, c.z);
    r.morning(2);
    r.step(300);
    expect(r.t.repairs().cells.length, '読みこむ まで 記録が のこる').toBe(9);
    r.unloadedFrom.v = 1e9;
    for (const c of cells) r.real.setBlock(c.x, c.y, c.z, 'air');
    r.t.onColumnLoaded(70 >> 4, 40 >> 4);
    r.t.onColumnLoaded(72 >> 4, 40 >> 4);
    expect(cells.filter((c) => r.blockOf(c.x, c.y, c.z) !== design(c.x, c.y, c.z)).length).toBe(0);
    expect(r.t.repairs().cells.length).toBe(0);
  });

  it('もどした マスの ある チャンクだけ さわる（さわった チャンク ≦ もどした マスの ある チャンク）', () => {
    const r = rig();
    const cells = [...slab(20, 40, 4, 1), ...slab(40, 40, 4, 1)];
    r.break_(cells);
    r.morning(2);
    r.sets.length = 0;
    r.step(100);
    const chunks = new Set(r.sets.map((s) => `${s.x >> 4},${s.z >> 4}`));
    const cellChunks = new Set(cells.map((s) => `${s.x >> 4},${s.z >> 4}`));
    expect(chunks.size).toBeLessThanOrEqual(cellChunks.size);
  });

  it('(性能) 朝の 仕分けの 仕事は 記録 2 倍で 2.2 倍 以下・朝 いがいの 1 ステップの 仕事は 記録 2 倍でも かわらない', () => {
    const work = (w: number) => {
      const r = rig();
      r.break_(slab(10, 10, w, 20));
      r.morning();
      const w0 = r.t.stats.morningWork;
      r.step(1);
      const sort = r.t.stats.morningWork - w0;
      const s0 = r.t.stats.stepWork;
      r.step(1);
      const per = r.t.stats.stepWork - s0;
      return { sort, per };
    };
    const a = work(10);
    const b = work(20);
    expect(b.sort / a.sort).toBeLessThanOrEqual(2.2);
    expect(b.per, '朝 いがいの 1 ステップ').toBe(a.per);
  });
});

describe('AC53・AC56 人が いる とき・とじこめない', () => {
  const pit = (): { x: number; y: number; z: number }[] => [...slab(20, 40, 3, 3, GROUND), ...slab(20, 40, 3, 3, GROUND - 1)];

  it('(a) d+1 の 朝に 四角 ＋2 マスの 中に 人が いると 1 こも もどらず waiting。2 マス 外では もどる（1P も 2P も）', () => {
    for (const who of [1, 2] as const) {
      const r = rig();
      r.players.length = 0;
      r.players.push({ who, x: 20 - 2 + 0.5, y: GROUND + 1, z: 41.5 }); // 四角の すぐ 外 2 マス（まだ 中）
      r.break_(slab(20, 40, 3, 3));
      r.morning();
      r.step(300);
      expect(r.t.repairs().cells.length, `${who}P が 近くに いる 間は もどらない`).toBe(9);
      expect(r.t.repairs().groups[0]!.waiting).toBe(true);
      r.players[0]!.x = 20 - 3 + 0.5; // 外へ
      let first = -1;
      for (let i = 0; i < 60 && first < 0; i++) {
        r.step();
        if (r.t.repairs().cells.length < 9) first = i;
      }
      expect(first, '60 ステップ 以内に もどりはじめる').toBeGreaterThanOrEqual(0);
      expect(r.t.repairs().groups[0]?.waiting ?? false).toBe(false);
    }
  });

  it('妖怪・動物が 重なる マスだけ あとまわし（はなれたら もどす）', () => {
    const r = rig();
    const cells = slab(20, 40, 4, 1);
    r.break_(cells);
    r.occupied.add(key({ x: 20, y: GROUND, z: 40 }));
    r.morning();
    r.step(200);
    const left = r.t.repairs().cells.map(key);
    expect(left).toContain(key({ x: 20, y: GROUND, z: 40 }));
    r.occupied.clear();
    r.morning();
    r.step(200);
    expect(r.t.repairs().cells.length).toBe(0);
  });

  it('AC56 (a)(b): d+1 の 間 立ちつづけると 0 こ・d+2 の 朝の 1 ステップめに d+1 の 分が もどり waiting false・その 日の うちに 0', () => {
    const r = rig();
    r.players[0] = { who: 1, x: 21.5, y: GROUND + 1, z: 41.5 };
    const cells = slab(20, 40, 3, 3);
    r.break_(cells);
    r.morning();
    r.step(1000);
    expect(r.t.repairs().cells.length).toBe(9);
    expect(r.t.repairs().groups[0]!.waiting).toBe(true);
    r.morning();
    r.step(1);
    expect(r.t.repairs().cells.length, 'd+1 の 分（半分 = 5）は すぐ もどる').toBeLessThanOrEqual(9 - 5);
    expect(r.t.repairs().groups.every((g) => !g.waiting)).toBe(true);
    r.step(100);
    expect(r.t.repairs().cells.length).toBe(0);
    expect(cells.filter((c) => r.blockOf(c.x, c.y, c.z) !== design(c.x, c.y, c.z)).length).toBe(0);
  });

  it('AC56 (c): 重なって いた 体は もどる 前に 移す 先へ（足もとが すけない・体の 2 マスが 空気・未もどりでない・いちばん 近い）。体の 2 マスが ブロックと 重なる ステップは 0', () => {
    const r = rig();
    const cells = pit();
    r.break_(cells);
    r.players[0] = { who: 1, x: 21.5, y: GROUND - 1, z: 41.5 }; // あなの 底（足もとの 下 y = 6 は 石）
    r.morning(2);
    const inRecord = (x: number, y: number, z: number): boolean => r.t.repairs().cells.some((c) => c.x === x && c.y === y && c.z === z);
    const overlapsSolid = (): boolean => {
      const p = r.players[0]!;
      for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as const) {
        for (const dy of [0, 0.9, 1.79]) if (r.real.isSolid(Math.floor(p.x + dx), Math.floor(p.y + dy), Math.floor(p.z + dz))) return true;
      }
      return false;
    };
    for (let i = 0; i < 60; i++) {
      r.step();
      expect(overlapsSolid(), `ステップ ${i} で 体が ブロックと 重ならない`).toBe(false);
    }
    expect(r.moved.length, '移された').toBeGreaterThan(0);
    const to = r.moved[0]!;
    const fx = Math.floor(to.x);
    const fz = Math.floor(to.z);
    expect(r.real.isSolid(fx, to.y - 1, fz), '足もとは すけない').toBe(true);
    expect(r.blockOf(fx, to.y, fz)).toBe('air');
    expect(r.blockOf(fx, to.y + 1, fz)).toBe('air');
    expect(inRecord(fx, to.y - 1, fz) || inRecord(fx, to.y, fz)).toBe(false);
    // いちばん 近い 列（横の きょりが これより 小さい 立てる 所は ない）
    const d2 = (x: number, z: number): number => (x + 0.5 - 21.5) ** 2 + (z + 0.5 - 41.5) ** 2;
    for (let x = 21 - 16; x <= 21 + 16; x++) {
      for (let z = 41 - 16; z <= 41 + 16; z++) {
        if (x >= 20 && x <= 22 && z >= 40 && z <= 42) continue;
        if (x < 4) continue; // keeps ではなく 設計の 地面は ある（x < 4 も 立てる）
        if (d2(x, z) < d2(fx, fz) - 1e-9) expect.fail(`もっと 近い 列 ${x},${z} が ある`);
      }
    }
    expect(r.t.repairs().cells.length).toBe(0);
  });

  it('AC56 (c) 16 マス 以内に 立てる 所が 無いと ふんすいの 前へ。2P も 同じ', () => {
    for (const who of [1, 2] as const) {
      const r = rig({ solidTop: 24 });
      const cells: { x: number; y: number; z: number }[] = [];
      for (let y = GROUND + 1; y <= GROUND + 3; y++) cells.push(...slab(20, 40, 1, 1, y)); // 1 マスの あな
      r.break_(cells);
      r.players.length = 0;
      r.players.push({ who, x: 20.5, y: GROUND + 1, z: 40.5 });
      r.morning(2);
      r.step(5);
      expect(r.moved[0], '立てる 所が 無い').toEqual({ who, ...r.fallbackSpot });
    }
  });

  it('(d) 記録の マスに つちを 置くと もどる とき その人の もちものへ（2P が いなければ 1P へ）', () => {
    const r = rig();
    const cells = slab(20, 40, 2, 1);
    r.break_(cells);
    expect(r.t.canPlace(20, GROUND, 40)).toBe(true);
    r.real.setBlock(20, GROUND, 40, 'dirt');
    r.t.placed(20, GROUND, 40, 'dirt', 1);
    r.real.setBlock(21, GROUND, 40, 'dirt');
    r.t.placed(21, GROUND, 40, 'dirt', 2);
    expect(r.t.repairs().cells.filter((c) => c.placed).map((c) => c.placed)).toEqual([{ item: 'dirt', p: 1 }, { item: 'dirt', p: 2 }]);
    r.morning(2);
    r.step(50);
    expect(r.blockOf(20, GROUND, 40)).toBe('grass');
    expect(r.given.sort((a, b) => a.who - b.who)).toEqual([{ item: 'dirt', who: 1 }, { item: 'dirt', who: 2 }]);
  });

  it('(b2)(e) ほれる のは 記録の マスと ふち（1 マス）だけ・ふちの 印の となりは ふちに ならない・keeps と 記録も ふちも ない 所は ほれない', () => {
    const r = rig();
    r.break_(slab(20, 40, 3, 3, GROUND)); // あな（1 だん）
    expect(r.t.canDig(21, GROUND, 41), '記録の マス').toBe(true);
    expect(r.t.canDig(21, GROUND - 1, 41), '底の 面と となりあう → ふち').toBe(true);
    expect(r.t.canDig(19, GROUND, 41), 'かべ（面で となりあう）').toBe(true);
    expect(r.t.canDig(21, GROUND - 2, 41), '2 マス 下は ふちに ならない').toBe(false);
    expect(r.t.canDig(18, GROUND, 41), '1 マス ほどに 先').toBe(false);
    expect(r.t.canPlace(21, GROUND, 41)).toBe(true);
    expect(r.t.canPlace(19, GROUND, 41), 'ふちは 置けない').toBe(false);
    // ふちを ほる: アイテムに ならない・byPlayer で 記録・となりの ふちは ひろがらない
    expect(r.t.dug(21, GROUND - 1, 41), 'アイテムに ならない').toBe(true);
    r.real.setBlock(21, GROUND - 1, 41, 'air');
    const cell = r.t.repairs().cells.find((c) => c.x === 21 && c.y === GROUND - 1 && c.z === 41)!;
    expect(cell.byPlayer).toBe(true);
    expect(cell.day).toBe(5);
    expect(r.t.canDig(21, GROUND - 2, 41), '印の マスの となりは ふちに ならない').toBe(false);
    // keeps は ほれない（ふちでも）
    const k = rig({ fixedKeeps: (x) => x < 4 });
    k.break_(slab(5, 40, 1, 1));
    expect(k.t.canDig(4, GROUND, 40), 'ふち').toBe(true);
    k.break_([{ x: 4, y: GROUND, z: 41 }]);
    expect(k.t.canDig(3, GROUND, 41), 'keeps').toBe(false);
    // 600 ステップ ほっても…は DigSystem の ユニット（src/dig/townDig.test.ts）
    expect(r.t.dug(50, GROUND, 40), '記録も ふちも ない 所').toBe(false);
  });

  it('自分で 置いた 物を もどる 前に ほれば ふつうに もちものへ（アイテムに なる）', () => {
    const r = rig();
    r.break_(slab(20, 40, 1, 1));
    r.real.setBlock(20, GROUND, 40, 'dirt');
    r.t.placed(20, GROUND, 40, 'dirt', 1);
    expect(r.t.dug(20, GROUND, 40), 'ふつうの ドロップ').toBe(false);
    expect(r.t.repairs().cells[0]!.placed).toBeUndefined();
  });
});

describe('AC54 保存', () => {
  it('d+1 の 朝の あと セーブ → 開きなおすと 同じ・x y z day の 4 つ ＋ 印・置いた 物 だけ・つぎの 朝に のこりが もどる', () => {
    const a = rig();
    const cells = slab(20, 40, 6, 1);
    a.break_(cells);
    a.morning();
    a.step(30);
    a.real.setBlock(23, GROUND, 40, 'dirt');
    a.t.placed(23, GROUND, 40, 'dirt', 2);
    const saved = JSON.parse(JSON.stringify(a.t.serialize())) as { cells: number[] };
    expect(Object.keys(saved).sort()).toEqual(['byPlayer', 'cells', 'placed', 'v']);
    const n = a.t.repairs().cells.length;
    expect(saved.cells.length, '1 マス 4 つの 数').toBe(n * 4);
    const b = rig();
    for (let x = 0; x < 128; x++) for (let y = 1; y <= GROUND; y++) for (let z = 0; z < 128; z++) if (a.blockOf(x, y, z) !== b.blockOf(x, y, z)) b.real.setBlock(x, y, z, a.blockOf(x, y, z) as BlockId);
    b.state.day = a.state.day;
    b.t.deserialize(saved);
    expect(b.t.repairs().cells).toEqual(a.t.repairs().cells);
    b.step(100);
    expect(b.t.repairs().cells.length, '開いた 日の うちは そのまま').toBe(n);
    b.morning();
    b.step(100);
    expect(b.t.repairs().cells.length, 'つぎの 朝に のこりが もどる').toBe(0);
  });

  it('d+2 の 朝を すぎた マスの ある セーブは 開いた 1 ステップめに ぜんぶ もどる（近くに 1P が 立って いても。体は 移す）', () => {
    const a = rig();
    const cells = slab(20, 40, 3, 3);
    a.break_(cells);
    const saved = JSON.parse(JSON.stringify(a.t.serialize()));
    const b = rig();
    for (const c of cells) b.real.setBlock(c.x, c.y, c.z, 'air');
    b.state.day = 7; // 2 日 たって いる
    b.players[0] = { who: 1, x: 21.5, y: GROUND, z: 41.5 };
    b.t.deserialize(saved);
    b.step(1);
    expect(b.t.repairs().cells.length).toBe(0);
    expect(cells.filter((c) => b.blockOf(c.x, c.y, c.z) !== design(c.x, c.y, c.z)).length).toBe(0);
    expect(b.moved.length, '重なって いた 体は 移された').toBe(1);
  });

  it('記録の ない 古い セーブ・こわれた 中身は 0 こ', () => {
    const r = rig();
    for (const bad of [null, undefined, {}, { v: 99 }, 'x', { v: 1, cells: [1, 2, 3] }]) {
      r.t.deserialize(bad);
      expect(r.t.repairs().cells.length).toBe(0);
    }
  });
});

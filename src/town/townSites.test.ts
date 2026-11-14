import { describe, expect, it } from 'vitest';
import { townBuildingCells } from './townBuildings';
import { BUILDING_SITES, STALL_SITES, heightOf, type BuildingKind } from './townSites';
import { chooseTown } from './townPlace';
import { TownPlan } from './townPlan';

/** AC43・AC45 の 置き場所の 表: 建物 7（本ものの 4 つ ＋ かざりの 町家 2 ＋ おちゃや）・やたい 5（話せる 3 ＋ かざり 2）が town.info() に ならぶ */
const cells = townBuildingCells();
const KINDS: BuildingKind[] = ['yorozuya', 'kajiya', 'daiku', 'monoshiri', 'machiya', 'machiya', 'ochaya'];

describe('建物の 表', () => {
  it('7 けん（よろずや・かじや・だいく・道場・町家 2・おちゃや）', () => {
    expect(BUILDING_SITES.map((b) => b.kind)).toEqual(KINDS);
  });

  it('どの 2 けんも 外の 形（はば・おく・高さ）の どれかが 2 マス 以上 ちがう', () => {
    const shape = BUILDING_SITES.map((b) => ({ k: b.kind, w: b.u1 - b.u0 + 1, d: b.v1 - b.v0 + 1, h: heightOf(cells, b) }));
    for (let i = 0; i < shape.length; i++) {
      for (let j = i + 1; j < shape.length; j++) {
        const a = shape[i]!;
        const b = shape[j]!;
        expect(Math.max(Math.abs(a.w - b.w), Math.abs(a.d - b.d), Math.abs(a.h - b.h)), `${a.k}${i} と ${b.k}${j}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('かざりの 町家 2 けんは ブロックの ならびを 90 度ずつ まわしても かがみ写しに しても 同じに ならない', () => {
    const [a, b] = BUILDING_SITES.filter((s) => s.kind === 'machiya');
    const grab = (s: NonNullable<typeof a>): string[][] => {
      const rows: string[][] = [];
      for (const c of cells) if (c.u >= s.u0 && c.u <= s.u1 && c.v >= s.v0 && c.v <= s.v1) (rows[c.dy] ??= []).push(`${c.u - s.u0},${c.v - s.v0},${c.id}`);
      return rows;
    };
    const A = JSON.stringify(grab(a!).map((r) => r?.slice().sort()));
    const B = JSON.stringify(grab(b!).map((r) => r?.slice().sort()));
    expect(A).not.toBe(B);
    // 外の 形（はば・おく・高さ）も ちがう
    expect([a!.u1 - a!.u0, heightOf(cells, a!)]).not.toEqual([b!.u1 - b!.u0, heightOf(cells, b!)]);
  });

  it('かざりの 町家・おちゃやの 戸は しまって いる（入り口に 戸の ない あなが ない）', () => {
    for (const s of BUILDING_SITES.filter((q) => q.kind === 'machiya' || q.kind === 'ochaya')) {
      // 前の かべ（四角の ひとつ 手前の 列。いちばん 前は 飾りの 列）は どこも 地面から 2 マス 目まで ブロックが ある
      for (let u = s.u0; u <= s.u1; u++) for (let dy = 0; dy <= 1; dy++) expect(cells.some((c) => c.u === u && c.v === s.v1 - 1 && c.dy === dy), `${s.kind} ${u},${s.v1 - 1},${dy}`).toBe(true);
    }
  });
});

describe('town.info() の 建物・やたい', () => {
  const plan = new TownPlan(chooseTown(1)!);
  const info = plan.info();

  it('buildings は 7 けん。どれも 街の はんいの 中で、戸口が 建物の そば', () => {
    expect(info.buildings.map((b) => b.kind)).toEqual(KINDS);
    for (const b of info.buildings) {
      expect(b.min.x).toBeGreaterThanOrEqual(info.bounds.min.x);
      expect(b.max.x).toBeLessThanOrEqual(info.bounds.max.x);
      expect(b.max.y).toBeGreaterThan(b.min.y);
      expect(Math.hypot((b.min.x + b.max.x) / 2 - b.door.x, (b.min.z + b.max.z) / 2 - b.door.z), b.kind).toBeLessThan(25);
    }
  });

  it('stalls は 5 つ: 買いとり・だんご・ごはんは 話せる、かざりは 2 つで 話せない', () => {
    expect(info.stalls.map((s) => s.kind).sort()).toEqual(['dango', 'deco', 'deco', 'gohan', 'kaitori']);
    for (const s of info.stalls) expect(s.talk, s.kind).toBe(s.kind !== 'deco');
    expect(STALL_SITES.length).toBe(5);
  });
});

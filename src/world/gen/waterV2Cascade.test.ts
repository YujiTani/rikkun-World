import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { buildSupports, type Cascade } from './waterV2Cascade';
import { basinNorm, Edit, makeBasin, type Basin } from './waterV2Kit';
import { WATER_TUNE } from './waterV2Table';

/** 段々の 滝の 見た目（10 回め）: 受け皿の 形・ささえ岩の こぶ・山の 岩 */

describe('受け皿の 形（basinNorm）', () => {
  const round = makeBasin(1, 20.5, 20.5, 4, 50, 3);
  /** (cx + dx, cz + dz) の マスの まん中の 値 */
  const at = (b: Basin, dx: number, dz: number): number => basinNorm(b, Math.floor(b.cx + dx), Math.floor(b.cz + dz));

  it('形が なければ 丸（まわりの どの 向きも ゆがみの 範囲）', () => {
    for (const [dx, dz] of [[3, 0], [0, 3], [-3, 0], [0, -3]] as const) expect(at(round, dx, dz)).toBeGreaterThan(0.4);
  });

  it('だ円: かべに そった 向き（d に 直角）に 長く、d の 向きは みじかい', () => {
    const e = { ...round, amp: 0, shape: { ux: 1, uz: 0, ax: 1.5, flat: 1 } };
    const flat = { ...round, amp: 0 };
    expect(at(e, 0, 4)).toBeLessThan(at(flat, 0, 4)); // 直角: 長い ぶん 中に 近い
    expect(at(e, 4, 0)).toBeGreaterThan(at(flat, 4, 0)); // d の 向き: みじかい
  });

  it('半月: かべがわ（d の うしろ）だけ 半径が 小さい', () => {
    const m = { ...round, amp: 0, shape: { ux: 1, uz: 0, ax: 1, flat: 0.6 } };
    const flat = { ...round, amp: 0 };
    expect(at(m, -3, 0)).toBeGreaterThan(at(flat, -3, 0));
    expect(at(m, 3, 0)).toBeCloseTo(at(flat, 3, 0), 5);
  });
});

describe('Edit.recolor', () => {
  it('指定の ブロックだけ 置きかえる（x・y・z が わたる）', () => {
    const ed = new Edit();
    ed.set(3, 5, 7, 'ara_ishi' as BlockId);
    ed.set(3, 6, 7, 'water' as BlockId);
    ed.recolor('ara_ishi' as BlockId, (x, y, z) => (x === 3 && y === 5 && z === 7 ? ('stone' as BlockId) : ('dirt' as BlockId)));
    expect(ed.get(3, 5, 7)).toBe('stone');
    expect(ed.get(3, 6, 7)).toBe('water');
  });
});

describe('ささえ岩（buildSupports）', () => {
  // かべ（x <= 10 は 高さ 100）の 外に、水面 90 の 受け皿（中心 x = 17）。外は 低い 地面（40）
  const LEVEL = 90;
  const g = (x: number, _z: number): number => (x <= 10 ? 100 : 40);
  const vessel = makeBasin(3, 17.5, 0.5, 4, LEVEL, 3);
  const upper = makeBasin(3, 5.5, 0.5, 5, LEVEL + 10, 2);
  const lip: [number, number][] = [[10, -1], [10, 0], [10, 1]];
  const cascade: Cascade = { ponds: [upper, vessel], stages: [{ d: [1, 0], w: 3, lip, front: lip.map(([x, z]) => [x + 1, z] as [number, number]), source: [], ring: [] }] };
  const rock = (): BlockId => 'stone' as BlockId;
  const run = (seed: number): Edit => {
    const ed = new Edit();
    buildSupports(ed, g, seed, cascade, rock, () => true, () => false);
    return ed;
  };

  it('山の 岩だけ・水面の 下まで・列ごとに 地面から つながる（うかない）', () => {
    const ed = run(11);
    const blocks = ed.blocks();
    expect(blocks.length).toBeGreaterThan(100);
    for (const b of blocks) {
      expect(b.id).toBe('stone');
      expect(b.y).toBeLessThanOrEqual(LEVEL - 1);
    }
    const tops = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const b of blocks) {
      const k = `${b.x},${b.z}`;
      tops.set(k, Math.max(tops.get(k) ?? 0, b.y));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, top] of tops) expect(counts.get(k), `列 ${k}`).toBe(top - 40); // 41..top が ぜんぶ 岩
  });

  it('かべと 受け皿の すき間（落ち口の 列から 池の まん中まで）を うめる', () => {
    const ed = run(11);
    // 池の 中・ふち（x = 12〜）は 池が 書く ので ここでは さわらない。落ち口の すぐ そと（x = 11）は 池の よこまで 水面の すぐ 下
    for (const z of [-5, 5]) expect(ed.topOf(11, z), `z=${z}`).toBeGreaterThan(LEVEL - 4);
  });

  it('下へ 行くほど ひろがる（下の だんの 列の 数 ≧ 上の だんの 列の 数）・乱数は シード つき', () => {
    const ed = run(11);
    const cols = (y: number): number => ed.blocks().filter((b) => b.y === y).length;
    expect(cols(45)).toBeGreaterThan(cols(LEVEL - 1));
    expect(cols(45)).toBeLessThanOrEqual(WATER_TUNE.cascade.flare.steps * 2 * 400); // どこまでも ひろがらない
    expect(JSON.stringify(run(11).blocks())).toBe(JSON.stringify(run(11).blocks()));
    expect(JSON.stringify(run(12).blocks())).not.toBe(JSON.stringify(run(11).blocks()));
  });

  it('使えない 列（free が false・もう 書いた 列・taken）は さける', () => {
    const ed = new Edit();
    ed.set(13, 60, 0, 'water' as BlockId);
    buildSupports(ed, g, 11, cascade, rock, (x) => x !== 14, (x, z) => x === 15 && z === 0);
    expect(ed.get(13, 61, 0)).toBeUndefined();
    expect(ed.has(14, 0)).toBe(false);
    expect(ed.has(15, 0)).toBe(false);
  });
});

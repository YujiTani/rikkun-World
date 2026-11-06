import { describe, expect, it } from 'vitest';
import { LevelTool, stateOfDelta } from './level';

/** AC16（ユニット 1）: ちからだめし。high・low・ok・13×13・−4〜+5・16 マス */
function rig(topAt: (x: number, z: number) => number | null) {
  const solid = (x: number, y: number, z: number): boolean => {
    const t = topAt(x, z);
    return t !== null && y <= t;
  };
  const tool = new LevelTool(solid);
  tool.setBase(100, 20, 100);
  return tool;
}
const stateAt = (t: LevelTool, x: number, z: number) => t.view(true, 100, 100).cells.find((c) => c.x === x && c.z === z)?.state;

describe('みずもり: 色の 判定', () => {
  it('高さの 差 +1 以上 high・−1 以下 low・0 ok、−4〜+5 に 固い ブロックが 無い 列は low', () => {
    expect(stateOfDelta(1)).toBe('high');
    expect(stateOfDelta(5)).toBe('high');
    expect(stateOfDelta(0)).toBe('ok');
    expect(stateOfDelta(-1)).toBe('low');
    expect(stateOfDelta(-4)).toBe('low');
    expect(stateOfDelta(null)).toBe('low');
  });
  it('13×13 ＝ 169 列。base が まん中（±6）', () => {
    const t = rig(() => 20);
    const cells = t.view(true, 100, 100).cells;
    expect(cells).toHaveLength(169);
    expect([Math.min(...cells.map((c) => c.x)), Math.max(...cells.map((c) => c.x)), Math.min(...cells.map((c) => c.z)), Math.max(...cells.map((c) => c.z))]).toEqual([94, 106, 94, 106]);
    expect(cells.every((c) => c.state === 'ok')).toBe(true);
  });
  it('高い 列・低い 列・ずっと 低い 列（−4 より 下）・ずっと 高い 列（+5 より 上）', () => {
    const t = rig((x, z) => (x === 101 && z === 100 ? 22 : x === 99 && z === 100 ? 19 : x === 100 && z === 101 ? 10 : x === 100 && z === 99 ? 40 : 20));
    expect(stateAt(t, 101, 100)).toBe('high');
    expect(stateAt(t, 99, 100)).toBe('low');
    expect(stateAt(t, 100, 101)).toBe('low'); // 20 − 10 ＝ −10: 窓の 中に 固い ブロックが ない
    expect(stateAt(t, 100, 99)).toBe('high'); // +5 の 段まで 固い
    expect(stateAt(t, 100, 100)).toBe('ok');
  });
  it('ほる・うめる（blockChanged）で そのステップの うちに かわる。13×13 の そとの 変化は 無視', () => {
    let h = 22;
    const t = rig((x, z) => (x === 101 && z === 100 ? h : 20));
    expect(stateAt(t, 101, 100)).toBe('high');
    h = 20;
    t.blockChanged(101, 100);
    expect(stateAt(t, 101, 100)).toBe('ok');
    const before = t.view(true, 100, 100).cells;
    t.blockChanged(150, 150);
    expect(t.view(true, 100, 100).cells).toBe(before);
  });
  it('持って いない 間・base から 16 マスを こえた 間は cells が []。base は のこる。まだ base が なければ base null', () => {
    const t = rig(() => 20);
    expect(t.view(false, 100, 100)).toMatchObject({ base: { x: 100, y: 20, z: 100 }, cells: [] });
    expect(t.view(true, 100.5 + 16, 100.5).cells).toHaveLength(169);
    expect(t.view(true, 100.5 + 16.5, 100.5).cells).toEqual([]);
    const fresh = new LevelTool(() => true);
    expect(fresh.view(true, 0, 0)).toEqual({ base: null, cells: [] });
  });
});

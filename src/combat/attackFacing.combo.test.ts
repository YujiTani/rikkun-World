import { describe, expect, it } from 'vitest';
import { P, at, decide, yokaiAt } from './attackTestKit';

/** WEAPON-6 AC9b: 向きの補助の とどく（2 段目は R + 1.4 = 3.6、3 段目は 4.8。からかさ 半径 0.6 の 外がわ 0.85 まで） */
describe('AC9b 段ごとの とどく', () => {
  it('2 段目 きりあげ: 前 3.2（中心）は えらばれる・前 4.6 は えらばれない', () => {
    const near = yokaiAt('karakasa', at(0, 3.2));
    const far = yokaiAt('karakasa', at(0, 4.6));
    const a = decide({ tech: 'kiriage', step: 2, item: 'crystal_katana', yokai: [near] });
    expect(a.targetId).toBe(near.id);
    const b = decide({ tech: 'kiriage', step: 2, item: 'crystal_katana', yokai: [far] });
    expect(b.targetId).toBeNull();
  });
  it('1 段目 きりあげは 今のまま（前 3.2 は えらばれない）', () => {
    const near = yokaiAt('karakasa', at(0, 3.2));
    expect(decide({ tech: 'kiriage', step: 1, item: 'crystal_katana', yokai: [near] }).targetId).toBeNull();
  });
  it('2 段目 つき: 前 3.2 は えらばれる・前 4.6 は えらばれない', () => {
    const near = yokaiAt('karakasa', at(0, 3.2, P.y));
    const far = yokaiAt('karakasa', at(0, 4.6, P.y));
    expect(decide({ tech: 'thrust', step: 2, item: 'crystal_katana', yokai: [near] }).targetId).toBe(near.id);
    expect(decide({ tech: 'thrust', step: 2, item: 'crystal_katana', yokai: [far] }).targetId).toBeNull();
  });
  it('3 段目 おおげさぎり: 4.8 先（中心）までの 妖怪を えらぶ・5.5 は えらばない', () => {
    const near = yokaiAt('karakasa', at(0, 4.6));
    const far = yokaiAt('karakasa', at(0, 5.5));
    expect(decide({ tech: 'kesa', step: 3, item: 'crystal_katana', yokai: [near] }).targetId).toBe(near.id);
    expect(decide({ tech: 'kesa', step: 3, item: 'crystal_katana', yokai: [far] }).targetId).toBeNull();
  });
});

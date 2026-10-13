import { describe, expect, it } from 'vitest';
import type { FarmCropInfo } from '../contracts';
import { createM7Settings } from '../contracts';
import { createPet } from './pet';

const crop = (wild = false): FarmCropInfo & { wild: boolean } => ({ kind: 'tomato', stage: 1, stageTicks: 0, wet: false, lit: true, ripe: false, wild });
const mk = () => createPet({ settings: createM7Settings(), dayLength: () => 91_800 });

describe('なでる・ごきげん（AC12・AC13 の もと）', () => {
  it('1 回目 happy・のこり 91,800。2 回目 again で のびない', () => {
    const p = mk();
    expect(p.pet(3, 8, 4, crop())).toBe('happy');
    expect(p.left(3, 8, 4)).toBe(91_800);
    for (let i = 0; i < 100; i++) p.tick();
    expect(p.pet(3, 8, 4, crop())).toBe('again');
    expect(p.left(3, 8, 4)).toBe(91_700);
  });
  it('1.1 倍。ごきげん でなければ 1', () => {
    const p = mk();
    p.pet(1, 2, 3, crop());
    expect(p.growFactor(1, 2, 3)).toBeCloseTo(1.1, 10);
    expect(p.growFactor(1, 2, 4)).toBe(1);
  });
  it('91,800 ステップ あとに おわり、また なでられる', () => {
    const p = mk();
    p.pet(1, 2, 3, crop());
    for (let i = 0; i < 91_800; i++) p.tick();
    expect(p.isHappy(1, 2, 3)).toBe(false);
    expect(p.pet(1, 2, 3, crop())).toBe('happy');
  });
  it('やせい は wild で ごきげん に ならない', () => {
    const p = mk();
    expect(p.pet(1, 2, 3, crop(true))).toBe('wild');
    expect(p.isHappy(1, 2, 3)).toBe(false);
  });
  it('作物 が なくなる と きえる・設定 farmPetDays が 効く', () => {
    const s = createM7Settings();
    s.farmPetDays = 0.5;
    const p = createPet({ settings: s, dayLength: () => 1000 });
    p.pet(1, 2, 3, crop());
    expect(p.left(1, 2, 3)).toBe(500);
    p.onCropRemoved(1, 2, 3);
    expect(p.isHappy(1, 2, 3)).toBe(false);
  });
  it('保存: 4 こ ずつ・おかしい 行 は 飛ばす', () => {
    const p = mk();
    p.pet(1, 2, 3, crop());
    p.pet(5, 6, 7, crop());
    for (let i = 0; i < 10; i++) p.tick();
    const flat = p.serialize();
    expect(flat).toEqual([1, 2, 3, 91_790, 5, 6, 7, 91_790]);
    const q = mk();
    q.deserialize([...flat, 9, 9, 9, 0, 'x', 1, 1, 5, 8, 8, 8, 100], (x) => x !== 5 && x !== 8);
    expect(q.serialize()).toEqual([1, 2, 3, 91_790]);
    q.deserialize(null, () => true);
    expect(q.size).toBe(0);
  });
});

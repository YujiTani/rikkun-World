import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { BIG_ID_BASE, BigHit, damageOf, mulOf, partOf, type BoxLike, type YokaiWorldLike } from './gashaBigHit';
import { TUNE as T } from './gashaBigTuning';
import type { Vec3, YokaiRayHit } from '../contracts';

const hand = (): BoxLike => ({ name: 'handL', c: [0, 5, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [1, 1, 1] });
const girl = (): BoxLike => ({ name: 'girl', c: [10, 5, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [0.7, 0.9, 0.7] });

describe('座っている 少女の 当たり（FIX-BRIEF-2 §4）', () => {
  it('girl という 名前の 箱は 部位 girl で、倍率は 調整表の 大ダメージ（手より 大きい）', () => {
    expect(partOf('girl')).toBe('girl');
    expect(mulOf('girl')).toBe(T.hit.partMul.girl);
    expect(mulOf('girl')).toBeGreaterThan(mulOf('hand'));
    expect(damageOf('girl', 10)).toBeGreaterThan(damageOf('hand', 10));
  });

  it('setExtra で 足した 箱は 矢の 線に 当たり、ダメージが 体力から ひかれる。外すと 当たらない', () => {
    const ym: YokaiWorldLike = {
      raycast: () => null as YokaiRayHit | null,
      damage: (id: number, amount: number, from: Vec3) => { void id; void amount; void from; return 0; },
    };
    const bh = new BigHit({ scene: new Scene(), angry: () => undefined, sources: { yokai: () => ym } });
    bh.bind([hand()], null);
    const miss = ym.raycast({ x: 10, y: 5, z: -10 }, { x: 0, y: 0, z: 1 }, 30);
    expect(miss).toBeNull();
    bh.setExtra(girl());
    const hit = ym.raycast({ x: 10, y: 5, z: -10 }, { x: 0, y: 0, z: 1 }, 30);
    expect(hit?.id).toBe(BIG_ID_BASE + 1);
    const before = bh.hp;
    const dealt = ym.damage(BIG_ID_BASE + 1, 10, { x: 10, y: 5, z: -1 });
    expect(dealt).toBe(damageOf('girl', 10));
    expect(bh.hp).toBeCloseTo(before - damageOf('girl', 10), 5);
    expect(bh.last?.part).toBe('girl');
    bh.setExtra(null);
    expect(ym.raycast({ x: 10, y: 5, z: -10 }, { x: 0, y: 0, z: 1 }, 30)).toBeNull();
  });

  it('bind し直しても 足した 箱は のこる（体を 作りなおさない かぎり）', () => {
    const bh = new BigHit({ scene: new Scene(), angry: () => undefined });
    bh.bind([hand()], null);
    bh.setExtra(girl());
    bh.bind([hand(), hand()], null);
    expect(bh.damage('girl', 10)).toBeGreaterThan(0);
  });
});

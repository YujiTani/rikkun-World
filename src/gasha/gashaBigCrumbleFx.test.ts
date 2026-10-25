import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CRUMBLE_ORDER, CrumbleFx, crumbleSchedule } from './gashaBigCrumbleFx';
import { JOINT_NAMES } from './gashaBig';

describe('くずれる かけら', () => {
  it('かけらを まき散らし、重力で 落ちて、時間で 消える。数の 上限を こえない', () => {
    const scene = new Scene();
    const fx = new CrumbleFx(scene, 40);
    fx.burst({ x: 0, y: 20, z: 0 }, 10, 3, 1);
    expect(fx.alive()).toBe(10);
    const y0 = fx.maxY();
    for (let i = 0; i < 30; i++) fx.update(1 / 60);
    expect(fx.alive()).toBe(10);
    // 外へ とび出して 落ちて いく
    fx.burst({ x: 0, y: 20, z: 0 }, 100, 3, 2); // 上限 40 を こえる
    expect(fx.alive()).toBeLessThanOrEqual(40);
    expect(y0).toBeGreaterThan(19);
    for (let i = 0; i < 60 * 5; i++) fx.update(1 / 60);
    expect(fx.alive()).toBe(0);
    fx.clear();
    expect(scene.children.length === 0 || !fx.mesh.visible || fx.alive() === 0).toBe(true);
  });

  it('はがれる じゅんばん: 手・うで → 頭 → 胴 → こし。ぜんぶの 関節を 1 回ずつ。時刻は 0 〜 くずれの 9 割 までに ならぶ', () => {
    expect([...CRUMBLE_ORDER].sort()).toEqual([...JOINT_NAMES].sort());
    expect(CRUMBLE_ORDER.indexOf('LeftHand')).toBeLessThan(CRUMBLE_ORDER.indexOf('LeftArm'));
    expect(CRUMBLE_ORDER.indexOf('Head')).toBeLessThan(CRUMBLE_ORDER.indexOf('Spine02'));
    expect(CRUMBLE_ORDER[CRUMBLE_ORDER.length - 1]).toBe('Hips');
    // 親より 先に 子が はがれる(親を かくすと 子も 見えなく なる ため)
    const s = crumbleSchedule();
    expect(s.length).toBe(JOINT_NAMES.length);
    for (let i = 1; i < s.length; i++) expect(s[i]!.at).toBeGreaterThan(s[i - 1]!.at);
    expect(s[0]!.at).toBeGreaterThanOrEqual(0);
    expect(s[s.length - 1]!.at).toBeLessThanOrEqual(0.9 + 1e-9);
  });
});

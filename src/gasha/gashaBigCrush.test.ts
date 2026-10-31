import { describe, expect, it } from 'vitest';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig } from './gashaBig';
import { BigActor } from './gashaBigActor';
import { crushAt, crushable } from './gashaBigCrush';
import { TUNE as T } from './gashaBigTuning';

/** 小さな ブロックの 世界: 地面は y = 1〜4 が つち（立つ 面 = 5）、y = 0 は いちばん 下の 段 */
function world() {
  const m = new Map<string, string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const get = (x: number, y: number, z: number): string => m.get(key(x, y, z)) ?? (y >= 0 && y <= 4 ? 'dirt' : 'air');
  const set = (x: number, y: number, z: number, b: string) => { m.set(key(x, y, z), b); };
  const calls: number[] = [];
  return { get, set, calls, io: { getBlock: get, setAir: (x: number, y: number, z: number) => { set(x, y, z, 'air'); return true; }, onBlocks: (c: unknown[]) => calls.push(c.length) } };
}

describe('gashaBigCrush（#293 たたきつけた 手の 下と まわりを こわす。ぬりかべと おなじ きまり）', () => {
  it('手を 着いた 所の ブロックが 空気に なる（半径・深さ・上は 調整表）。外は のこる', () => {
    const w = world();
    w.set(10, 5, 10, 'wood'); w.set(10, 6, 10, 'wood'); // 手の 上の 木
    const out = crushAt(10.5, 5, 10.5, w.io);
    expect(out.length).toBeGreaterThan(0);
    expect(w.calls).toEqual([out.length]); // こわした マスを 1 回で 知らせる
    expect(w.get(10, 4, 10)).toBe('air'); // 手の 真下の 地面
    expect(w.get(10, 5 - T.slam.crushDepth, 10)).toBe('air');
    expect(w.get(10, 5 - T.slam.crushDepth - 1, 10)).toBe('dirt'); // それより 深くは のこる
    expect(w.get(10, 5, 10)).toBe('air'); expect(w.get(10, 6, 10)).toBe('air'); // 上の 木も
    expect(w.get(10 + Math.ceil(T.slam.crushRadius) + 1, 4, 10)).toBe('dirt'); // 半径の 外
    for (const c of out) expect(c.to).toBe('air');
  });

  it('いちばん 下の 段・みず・start_torch は こわさない（ぬりかべと おなじ）', () => {
    expect(crushable('dirt', 1)).toBe(true);
    expect(crushable('stone', 0)).toBe(false);
    expect(crushable('water', 3)).toBe(false);
    expect(crushable('start_torch', 3)).toBe(false);
    for (const id of ['house_door', 'house_door_top', 'house_door_open', 'house_door_open_top']) expect(crushable(id, 3), `${id}（家の 戸。AC24）`).toBe(false);
    expect(crushable('air', 3)).toBe(false);
    expect(crushable('outside', 3)).toBe(false);
    const w = world();
    w.set(10, 4, 10, 'water'); w.set(11, 4, 10, 'start_torch');
    crushAt(10.5, 2, 10.5, w.io); // 深さで y = 0 まで とどく
    expect(w.get(10, 4, 10)).toBe('water');
    expect(w.get(11, 4, 10)).toBe('start_torch');
    expect(w.get(10, 0, 10)).toBe('dirt');
    expect(w.get(10, 1, 10)).toBe('air');
  });

  it('がしゃどくろが 前へ 1 歩 たたきつけると、手の 下の ブロックが 空気に なる', () => {
    const w = world();
    const slams: { x: number; y: number; z: number }[] = [];
    const actor = new BigActor(buildBig(), { climbUp, climbDown, lookBack }, {
      groundY: () => 4, player: () => ({ x: 900, y: 5, z: 900, yawDeg: 0 }),
      onSlam: (x, y, z) => { slams.push({ x, y, z }); crushAt(x, y, z, w.io); },
    }, 293);
    actor.place(0.5, 5, 0.5, 0);
    actor.walk(false);
    actor.goTo(0.5, 400);
    for (let i = 0; i < Math.ceil(actor.step.stepSec() * 60); i++) actor.update(1 / 60);
    expect(slams.length).toBe(1);
    const s = slams[0]!;
    expect(w.get(Math.floor(s.x), 4, Math.floor(s.z))).toBe('air');
    expect(w.get(Math.floor(s.x), 3, Math.floor(s.z))).toBe('air');
  });
});

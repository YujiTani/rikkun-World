import { describe, expect, it } from 'vitest';
import { insetPane, placeBubble } from './houseBubble';

/** 2P の 半分の ふきだし: 半分の まん中の 線から 5% あける・時計に かからない（UI 検査 'duo-house-bubble-p2' で 見つかった） */
const RIGHT = { x: 512, y: 0, w: 512, h: 700 };
const SIZE = { w: 460, h: 140 };
const out = { left: 0, top: 0 };

describe('insetPane', () => {
  it('左右を 5% ずつ せまくする（上下は そのまま）', () => {
    expect(insetPane(RIGHT, { x: 0, y: 0, w: 0, h: 0 })).toEqual({ x: 512 + 25.6, y: 0, w: 512 * 0.9, h: 700 });
  });
  it('せまくした 区画では ふきだしは 半分の まん中の 線から 5% 以上 あく', () => {
    const p = insetPane(RIGHT, { x: 0, y: 0, w: 0, h: 0 });
    const r = placeBubble({ x: 300, y: 300 }, { w: 300, h: 100 }, p, out);
    expect(r.left).toBeGreaterThanOrEqual(RIGHT.x + RIGHT.w * 0.05);
  });
});

describe('placeBubble の avoid（よけたい 四角）', () => {
  const clock = { l: 880, t: 24, r: 1000, b: 170 };
  it('かからなければ 今までどおり', () => {
    expect({ ...placeBubble({ x: 700, y: 400 }, { w: 200, h: 100 }, RIGHT, out, 16, clock) }).toEqual({ left: 600, top: 400 - 100 - 16 });
  });
  it('かかる なら 四角の 下へ ずらす', () => {
    const r = placeBubble({ x: 800, y: 100 }, SIZE, RIGHT, out, 16, clock);
    expect(r.top).toBeGreaterThanOrEqual(clock.b);
  });
  it('avoid を 省くと 今までどおり', () => {
    const r = { ...placeBubble({ x: 800, y: 100 }, SIZE, RIGHT, out) };
    expect(r.top).toBe(16);
  });
});

import { describe, expect, it } from 'vitest';
import { ActionState } from '../input/actions';
import { WalkRelativeActions } from './walkActions';

describe('WalkRelativeActions（1 画面の とき 2P は 画面の 向きで 歩く）', () => {
  it('左スティック上 → moveForward だけ 押して いる ことに なり、向きは カメラの 奥', () => {
    const src = new ActionState();
    const w = new WalkRelativeActions(src);
    src.press('moveForward');
    w.sync(40);
    expect(w.isHeld('moveForward')).toBe(true);
    expect(w.isHeld('moveRight')).toBe(false);
    expect(w.heading()).toBeCloseTo(40, 6);
  });
  it('右に 倒すと 画面の 右（+90°）。倒していなければ 何も 押していない', () => {
    const src = new ActionState();
    const w = new WalkRelativeActions(src);
    src.press('moveRight');
    w.sync(40);
    expect(w.heading()).toBeCloseTo(130, 6);
    src.release('moveRight');
    w.sync(40);
    expect(w.heading()).toBeNull();
    expect(w.isHeld('moveForward')).toBe(false);
  });
  it('ジャンプなどは 元の まま。relative = false なら 4 方向も 元の まま', () => {
    const src = new ActionState();
    const w = new WalkRelativeActions(src);
    src.press('jump');
    src.press('moveBack');
    w.sync(0);
    expect(w.isHeld('jump')).toBe(true);
    w.relative = false;
    w.sync(0);
    expect(w.isHeld('moveBack')).toBe(true);
    expect(w.heading()).toBeNull();
  });
});

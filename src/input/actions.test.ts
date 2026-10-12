import { describe, expect, it } from 'vitest';
import { ActionState, DEFAULT_KEY_BINDINGS } from './actions';

describe('ActionState', () => {
  it('押した行動は押しっぱなし扱いになり、その回だけ wasPressed になる', () => {
    const s = new ActionState();
    s.press('jump');
    expect(s.isHeld('jump')).toBe(true);
    expect(s.wasPressed('jump')).toBe(true);
    s.endFrame();
    expect(s.isHeld('jump')).toBe(true);
    expect(s.wasPressed('jump')).toBe(false);
    s.release('jump');
    expect(s.isHeld('jump')).toBe(false);
  });

  it('同じ行動に 2 つの入力（W と ↑）があっても、両方離すまで押しっぱなし', () => {
    const s = new ActionState();
    s.press('moveForward');
    s.press('moveForward');
    s.release('moveForward');
    expect(s.isHeld('moveForward')).toBe(true);
    s.release('moveForward');
    expect(s.isHeld('moveForward')).toBe(false);
  });

  it('releaseAll ですべて離す（ウィンドウから離れたとき用）', () => {
    const s = new ActionState();
    s.press('moveLeft');
    s.releaseAll();
    expect(s.isHeld('moveLeft')).toBe(false);
  });
});

describe('DEFAULT_KEY_BINDINGS', () => {
  it('WASD と矢印キーの両方で移動できる', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyW).toBe('moveForward');
    expect(DEFAULT_KEY_BINDINGS.ArrowUp).toBe('moveForward');
    expect(DEFAULT_KEY_BINDINGS.KeyA).toBe('moveLeft');
    expect(DEFAULT_KEY_BINDINGS.ArrowLeft).toBe('moveLeft');
  });
});

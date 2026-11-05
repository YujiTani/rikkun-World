import { describe, expect, it } from 'vitest';
import { ActionState, DEFAULT_KEY_BINDINGS, actionForKey, bindKeyboardAndMouse } from './actions';

describe('CHAR-1 / GAMEPAD-1: V と 走る', () => {
  it('GAMEPAD-1: KeyV は toggleView', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyV).toBe('toggleView');
    expect(actionForKey('KeyV', false)).toBe('toggleView');
  });

  it('AC41: run は ShiftLeft・ShiftRight。シフト＋Q は dropStack 1 回・drop なし・run は押されたまま', () => {
    expect(DEFAULT_KEY_BINDINGS.ShiftLeft).toBe('run');
    expect(DEFAULT_KEY_BINDINGS.ShiftRight).toBe('run');
    const target = new EventTarget();
    const state = new ActionState();
    const counts: Record<string, number> = {};
    state.onPress((a) => (counts[a] = (counts[a] ?? 0) + 1));
    bindKeyboardAndMouse(target as unknown as Window, state);
    const key = (type: string, code: string, shiftKey: boolean) =>
      target.dispatchEvent(Object.assign(new Event(type), { code, shiftKey, preventDefault() {} }));
    key('keydown', 'ShiftLeft', true);
    expect(state.isHeld('run')).toBe(true);
    key('keydown', 'KeyQ', true);
    expect(counts.dropStack).toBe(1);
    expect(counts.drop ?? 0).toBe(0);
    expect(state.isHeld('run')).toBe(true);
    key('keyup', 'KeyQ', true);
    key('keyup', 'ShiftLeft', false);
    expect(state.isHeld('run')).toBe(false);
  });
});

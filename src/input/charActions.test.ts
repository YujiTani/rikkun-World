import { describe, expect, it } from 'vitest';
import { ActionState, DEFAULT_KEY_BINDINGS, actionForKey, bindKeyboardAndMouse } from './actions';

describe('CHAR-1: V と 走る', () => {
  it('AC2: KeyV には どの Action も割り当てられていない', () => {
    expect(DEFAULT_KEY_BINDINGS.KeyV).toBeUndefined();
    expect(actionForKey('KeyV', false)).toBeUndefined();
    expect(actionForKey('KeyV', true)).toBeUndefined();
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

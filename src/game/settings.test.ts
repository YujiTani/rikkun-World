import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA_CONFIG } from '../camera/config';
import { createPlayerSettings } from '../player/config';
import { createSettingsHook } from './settings';

function make() {
  const p = createPlayerSettings();
  const c = { ...DEFAULT_CAMERA_CONFIG };
  return { p, c, hook: createSettingsHook(p, c) };
}

describe('settings', () => {
  it('get / all は M1-02 §4.1 の名前で読める', () => {
    const { hook } = make();
    expect(hook.get('walkSpeed')).toBe(4);
    expect(hook.get('autoJump')).toBe(true);
    expect(Object.keys(hook.all()).sort()).toEqual(
      [
        'accelTime', 'autoJump', 'eyeHeight', 'fov', 'gravity', 'jumpHeight',
        'maxFallSpeed', 'mouseSensitivity', 'thirdPersonDistance', 'thirdPersonHeight', 'walkSpeed',
      ].sort(),
    );
  });

  it('set はプレイヤーの数値を変える', () => {
    const { p, hook } = make();
    hook.set('autoJump', false);
    hook.set('walkSpeed', 6);
    expect(p.autoJump).toBe(false);
    expect(hook.get('walkSpeed')).toBe(6);
  });

  it('カメラにも同じ名前があれば合わせて変える', () => {
    const { c, hook } = make();
    hook.set('fov', 90);
    hook.set('thirdPersonDistance', 6);
    expect(c.fov).toBe(90);
    expect(c.thirdPersonDistance).toBe(6);
  });

  it('知らない名前・型ちがい・NaN は例外', () => {
    const { hook } = make();
    expect(() => hook.get('nope')).toThrow();
    expect(() => hook.set('nope', 1)).toThrow();
    expect(() => hook.set('autoJump', 1)).toThrow();
    expect(() => hook.set('walkSpeed', Number.NaN)).toThrow();
  });
});

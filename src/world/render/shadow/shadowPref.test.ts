import { describe, expect, it } from 'vitest';
import { SHADOW_STORAGE_KEY, saveShadowPref } from './shadowPref';

describe('SHADOW かげの保存（はじめの値の決め方は weightPref.test.ts）', () => {
  it('保存は on / off の 2 つだけ', () => {
    const w: string[] = [];
    saveShadowPref({ getItem: () => null, setItem: (k, v) => w.push(`${k}=${v}`) }, false);
    expect(w).toEqual([`${SHADOW_STORAGE_KEY}=off`]);
    expect(() => saveShadowPref({ getItem: () => null, setItem: () => { throw new Error('full'); } }, true)).not.toThrow();
  });
});

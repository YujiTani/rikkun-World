import { describe, expect, it } from 'vitest';
import { SHADOW_STORAGE_KEY, decideShadowStart, saveShadowPref, type KeyValueStore } from './shadowPref';

const store = (v: string | null): KeyValueStore => ({ getItem: () => v, setItem: () => undefined });

describe('SHADOW 影のはじめの値（AC16: はじめはオン）', () => {
  it('なにも無ければ 作ってオン', () => {
    expect(decideShadowStart('', undefined, store(null))).toEqual({ build: true, on: true });
    expect(decideShadowStart('?nosave=1', undefined, null)).toEqual({ build: true, on: true });
  });
  it('?shadow=0 は 作らない、?shadow=1 は 作ってオン（保存より強い）', () => {
    expect(decideShadowStart('?shadow=0', undefined, store('on'))).toEqual({ build: false, on: false });
    expect(decideShadowStart('?shadow=1', undefined, store('off'))).toEqual({ build: true, on: true });
  });
  it('保存した値を使う。?nosave=1 のときは読まない', () => {
    expect(decideShadowStart('', undefined, store('off'))).toEqual({ build: true, on: false });
    expect(decideShadowStart('?nosave=1', undefined, store('off'))).toEqual({ build: true, on: true });
  });
  it('E2E のサーバー（VITE_SHADOW_DEFAULT=off）は 作らない。URL の ?shadow=1 は これに勝つ', () => {
    expect(decideShadowStart('?nosave=1', 'off', null)).toEqual({ build: false, on: false });
    expect(decideShadowStart('?nosave=1&shadow=1', 'off', null)).toEqual({ build: true, on: true });
  });
  it('保存は on / off の 2 つだけ', () => {
    const w: string[] = [];
    saveShadowPref({ getItem: () => null, setItem: (k, v) => w.push(`${k}=${v}`) }, false);
    expect(w).toEqual([`${SHADOW_STORAGE_KEY}=off`]);
    expect(() => saveShadowPref({ getItem: () => null, setItem: () => { throw new Error('full'); } }, true)).not.toThrow();
  });
});

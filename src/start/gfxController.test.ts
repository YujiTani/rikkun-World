// GFX-1 G3・G4・G6: おもさ・くわしくを かえる と、すぐ 効いて 保存される。輪の お知らせは ちがう ときだけ。
import { describe, expect, it } from 'vitest';
import { SHADOW_STORAGE_KEY } from '../world/render/shadow/shadowPref';
import { GFX_STORAGE_KEY, readGfxSaved } from './gfxPref';
import { createGfx } from './gfxController';
import { WEIGHT_STORAGE_KEY } from './weightPref';

function setup(o: { weight?: 'xlight' | 'light' | 'normal' | 'fine'; ring?: 'small' | 'full'; allowed?: boolean; saved?: Record<string, string> } = {}) {
  const data = new Map(Object.entries(o.saved ?? {}));
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  const live = { micro: 12, shadow: false };
  const calls: string[] = [];
  const gfx = createGfx({
    store,
    weight: o.weight ?? 'light',
    res: 1.5,
    ring: o.ring ?? 'small',
    shadowAllowed: o.allowed ?? true,
    live: { micro: () => live.micro, shadow: () => live.shadow },
    apply: {
      micro: (r) => {
        live.micro = r;
        calls.push(`micro${r}`);
      },
      res: (r) => calls.push(`res${r}`),
      shadow: (on, persist) => {
        live.shadow = on;
        calls.push(`shadow${on ? 'On' : 'Off'}${persist ? '' : '-nosave'}`);
        if (persist) data.set(SHADOW_STORAGE_KEY, on ? 'on' : 'off');
      },
    },
  });
  return { gfx, data, calls, live, store };
}

describe('G3 おもさを 押すと すぐ そろい、保存される', () => {
  it('きれい: 28・かげ オン・がめん 2 が すぐ 効き、おもさが 保存される', () => {
    const t = setup();
    t.gfx.setWeight('fine');
    expect(t.calls).toEqual(['micro28', 'res2', 'shadowOn-nosave']);
    expect(t.data.get(WEIGHT_STORAGE_KEY)).toBe('fine');
    expect(t.gfx.state()).toMatchObject({ weight: 'fine', microR: 28, res: 2, shadow: true });
  });
  it('とても かるい: 0・かげ オフ・がめん 1', () => {
    const t = setup({ weight: 'fine' });
    t.gfx.setWeight('xlight');
    expect(t.gfx.state()).toMatchObject({ weight: 'xlight', microR: 0, res: 1, shadow: false });
  });
  it('おもさを 押すと くわしくの 保存（gfx・かげ）は 消える', () => {
    const t = setup({ saved: { [GFX_STORAGE_KEY]: '{"res":1,"micro":8}', [SHADOW_STORAGE_KEY]: 'on' } });
    t.gfx.setWeight('normal');
    expect(t.data.has(GFX_STORAGE_KEY)).toBe(false);
    expect(t.data.has(SHADOW_STORAGE_KEY)).toBe(false);
    expect(t.data.get(WEIGHT_STORAGE_KEY)).toBe('normal');
  });
  it('?shadow=0（かげを 作らない）でも おもさは 押せる（かげだけ 変わらない）', () => {
    const t = setup({ allowed: false });
    t.gfx.setWeight('fine');
    expect(t.gfx.state()).toMatchObject({ weight: 'fine', microR: 28, shadowAllowed: false });
  });
});

describe('G4 くわしくは 1 つずつ 変わり、保存される（おもさの 印は そのまま）', () => {
  it('がめんの こまかさだけ', () => {
    const t = setup();
    t.gfx.setRes(1);
    expect(t.calls).toEqual(['res1']);
    expect(readGfxSaved(t.store)).toEqual({ res: 1 });
    expect(t.gfx.state()).toMatchObject({ weight: 'light', res: 1, microR: 12 });
    expect(t.data.has(WEIGHT_STORAGE_KEY)).toBe(false);
  });
  it('ちかくの こまかさは 0 も えらべる。res の 保存は のこる', () => {
    const t = setup();
    t.gfx.setRes(2);
    t.gfx.setMicro(0);
    expect(JSON.parse(t.data.get(GFX_STORAGE_KEY)!)).toEqual({ res: 2, micro: 0 });
    expect(t.gfx.state().microR).toBe(0);
  });
  it('かげだけ: かげの 保存に 書く（おもさは そのまま）', () => {
    const t = setup();
    t.gfx.setShadow(true);
    expect(t.data.get(SHADOW_STORAGE_KEY)).toBe('on');
    expect(t.gfx.state()).toMatchObject({ shadow: true, weight: 'light' });
  });
  it('F4 で かわった 今の microR を state が 読む', () => {
    const t = setup();
    t.live.micro = 24;
    expect(t.gfx.state().microR).toBe(24);
  });
});

describe('G6 輪の お知らせは ちがう ときだけ', () => {
  it('はじめは 出ない（おもさを 押していない）', () => {
    expect(setup({ weight: 'fine', ring: 'small' }).gfx.state().ringNote).toBe(false);
  });
  it('small で あそび中に ふつう・きれいを 押す → 出る。ringNext は full', () => {
    const t = setup({ ring: 'small' });
    t.gfx.setWeight('fine');
    expect(t.gfx.state()).toMatchObject({ ring: 'small', ringNext: 'full', ringNote: true });
  });
  it('small で かるいを 押しても 出ない', () => {
    const t = setup({ ring: 'small' });
    t.gfx.setWeight('xlight');
    expect(t.gfx.state().ringNote).toBe(false);
  });
  it('full で きれい・ふつう は 出ない。かるい は 出る。また きれいに もどすと きえる', () => {
    const t = setup({ weight: 'fine', ring: 'full' });
    t.gfx.setWeight('normal');
    expect(t.gfx.state().ringNote).toBe(false);
    t.gfx.setWeight('light');
    expect(t.gfx.state().ringNote).toBe(true);
    t.gfx.setWeight('fine');
    expect(t.gfx.state().ringNote).toBe(false);
  });
  it('くわしくを 変えても お知らせは かわらない', () => {
    const t = setup({ ring: 'small' });
    t.gfx.setWeight('fine');
    t.gfx.setMicro(8);
    expect(t.gfx.state().ringNote).toBe(true);
  });
});

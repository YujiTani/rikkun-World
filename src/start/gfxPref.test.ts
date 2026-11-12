// GFX-1 G1・G2・G4: おもさの 表・くわしくの 保存の 読み書き・がめんの こまかさの 決め方。
import { describe, expect, it } from 'vitest';
import { MICRO_RADII } from '../world/render/voxel/tier';
import { GFX_STORAGE_KEY, MICRO_CHOICES, WEIGHT_SPEC, clearGfxDetail, decideRes, readGfxSaved, ringNoteNeeded, saveGfxPart, type GfxStore } from './gfxPref';

function store(initial: Record<string, string> = {}, throws = false): GfxStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => {
      if (throws) throw new Error('denied');
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (throws) throw new Error('quota');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

describe('G2 おもさの 表', () => {
  it('GFX-1 §1 の とおり', () => {
    expect(WEIGHT_SPEC).toEqual({
      xlight: { microR: 0, ring: 'small', shadow: false, res: 1 },
      light: { microR: 12, ring: 'small', shadow: false, res: 1.5 },
      normal: { microR: 24, ring: 'full', shadow: true, res: 2 },
      fine: { microR: 28, ring: 'full', shadow: true, res: 2 },
    });
  });
  it('ちかくの こまかさの えらびは なし(0) / 8 / 12 / 16 / 24 / 28。おもさの microR は ぜんぶ その 中', () => {
    expect([...MICRO_CHOICES]).toEqual([0, 8, 12, 16, 24, 28]);
    expect([...MICRO_RADII]).toEqual([8, 12, 16, 24, 28]);
    for (const w of Object.values(WEIGHT_SPEC)) expect(MICRO_CHOICES).toContain(w.microR);
  });
});

describe('G4 くわしくの 保存（rikkun.gfx.v1）', () => {
  it('なければ 空。1 つずつ 書いて、もう 1 つは のこる', () => {
    const s = store();
    expect(readGfxSaved(s)).toEqual({});
    saveGfxPart(s, { res: 1 });
    saveGfxPart(s, { micro: 0 });
    expect(readGfxSaved(s)).toEqual({ res: 1, micro: 0 });
  });
  it('こわれた・ゆるされない 値は 無視。読み書きで 例外でも 止まらない・null でも 止まらない', () => {
    expect(readGfxSaved(store({ [GFX_STORAGE_KEY]: 'nope' }))).toEqual({});
    expect(readGfxSaved(store({ [GFX_STORAGE_KEY]: '{"res":9,"micro":5}' }))).toEqual({});
    expect(readGfxSaved(store({}, true))).toEqual({});
    expect(() => saveGfxPart(store({}, true), { res: 1 })).not.toThrow();
    expect(() => saveGfxPart(null, { res: 1 })).not.toThrow();
    expect(readGfxSaved(null)).toEqual({});
  });
  it('clearGfxDetail は くわしくと かげの 保存を 消す（おもさの 保存は 消さない）', () => {
    const s = store({ [GFX_STORAGE_KEY]: '{}', 'rikkun.shadow.v1': 'on', 'rikkun.weight.v1': 'fine' });
    clearGfxDetail(s, 'rikkun.shadow.v1');
    expect([...s.data.keys()]).toEqual(['rikkun.weight.v1']);
  });
});

describe('decideRes・ringNoteNeeded', () => {
  it('URL ＞ 保存 ＞ おもさ', () => {
    expect(decideRes('', {}, 'light')).toBe(1.5);
    expect(decideRes('', { res: 1 }, 'fine')).toBe(1);
    expect(decideRes('?res=2', { res: 1 }, 'light')).toBe(2);
  });
  it('G6: 輪が ちがう ときだけ', () => {
    expect(ringNoteNeeded('small', 'fine')).toBe(true);
    expect(ringNoteNeeded('small', 'light')).toBe(false);
    expect(ringNoteNeeded('full', 'xlight')).toBe(true);
    expect(ringNoteNeeded('full', 'normal')).toBe(false);
  });
});

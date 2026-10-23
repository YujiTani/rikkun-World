import { describe, expect, it } from 'vitest';
import type { AnimalLive2Hint, AnimalWindowHint } from '../contracts';
import { animalIconPixels } from './animalArt';
import { actionHintLines } from './actionHintModel';
import { ANIMAL_HINT_VIEW } from './animalHintModel';
import { findUnrubiedKanji } from './text';

describe('LIVE-2 合図 9 つ（§3.1）', () => {
  const R = '<ruby>右<rt>みぎ</rt></ruby>';
  const want: Record<AnimalLive2Hint, string> = {
    kitNeedEgg: `たまご を もって ${R}クリック`,
    kitWait: 'あたため ちゅう。まってね',
    coopNoRoom: 'ひろい たいら な ところ に おこう',
    coopMax: 'とりごや は 3 つ まで',
    coopFull: 'この とりごや は いっぱい',
    coopNotEmpty: 'こ が いる から こわせない よ。だっこ で そと へ',
    kitMax: 'あたためる の は 6 つ まで',
    coopNoEgg: 'むし を あげる と たまご を うむ よ',
    sleepHint: 'ねてる よ。あさ に あげよう',
  };
  it('9 つの 文（仕様 §3.1 の とおり）。漢字は ふりがな付き・絵 が ある', () => {
    for (const k of Object.keys(want) as AnimalLive2Hint[]) {
      expect(ANIMAL_HINT_VIEW[k].html, k).toBe(want[k]);
      expect(findUnrubiedKanji(ANIMAL_HINT_VIEW[k].html), k).toEqual([]);
      expect(ANIMAL_HINT_VIEW[k].art.length, `${k} は 絵 が 先`).toBeGreaterThan(0);
    }
  });
  it('合図 は 全部で 17（LIVE-1 の 8 ＋ 9）。画面 に 禁止語 と 小屋・大人 の 漢字 が 無い', () => {
    const all = Object.keys(ANIMAL_HINT_VIEW) as AnimalWindowHint[];
    expect(all.length).toBe(17);
    for (const k of all) {
      const t = ANIMAL_HINT_VIEW[k].html;
      for (const bad of ['ぬくぬく', '育成', 'たまご こたつ', 'きん の ひよこ', 'きん の にわとり', '小屋', '大人']) expect(t.includes(bad), `${k} ${bad}`).toBe(false);
    }
  });
  it('絵: たまご → こたつ、こたつ ＋ すなどけい、とりごや の 中 の ひよこ → 手、Z ＋ おひさま', () => {
    expect(ANIMAL_HINT_VIEW.kitNeedEgg.art).toEqual(['egg', 'nukunuku']);
    expect(ANIMAL_HINT_VIEW.kitWait.art).toEqual(['nukunuku', 'hourglass']);
    expect(ANIMAL_HINT_VIEW.coopNotEmpty.art).toEqual(['toriya', 'chick', 'hand']);
    expect(ANIMAL_HINT_VIEW.sleepHint.art).toEqual(['zzz', 'sun']);
    expect(ANIMAL_HINT_VIEW.kitMax.art.length).toBe(6);
  });
  it('小さな 絵 4 つ は 16x16 で 何か 描いて ある', () => {
    for (const k of ['chick', 'zzz', 'hourglass', 'hand'] as const) {
      const px = animalIconPixels(k);
      expect(px.length, k).toBe(256);
      expect(px.filter((p) => p[3] > 0).length, k).toBeGreaterThan(30);
    }
  });
});

describe('LIVE-2 照準 の 下 の 案内（§2.11）', () => {
  const ctx = { held: null, heldIsPickaxe: false, heldIsBlade: false };
  it('こたつ: egg ＋ いれる、kin_tamago ＋ いれる、入って いる → まってね', () => {
    expect(actionHintLines({ kind: 'kitPut', item: 'egg' }, null, ctx).right).toEqual({ icon: 'egg', word: 'いれる' });
    expect(actionHintLines({ kind: 'kitPut', item: 'kin_tamago' }, null, ctx).right).toEqual({ icon: 'kin_tamago', word: 'いれる' });
    expect(actionHintLines({ kind: 'kitWait', item: null }, null, ctx).right).toEqual({ icon: 'nukunuku', word: 'まってね' });
  });
  it('小屋: あつめる は egg の 絵。置く は toriya ＋ おく（入らない・3 つ そろった 所 は disabled）', () => {
    expect(actionHintLines({ kind: 'coopCollect', item: null }, null, ctx).right).toEqual({ icon: 'egg', word: 'あつめる' });
    expect(actionHintLines({ kind: 'coopPlace', item: 'toriya' }, null, ctx).right).toEqual({ icon: 'toriya', word: 'おく' });
    expect(actionHintLines({ kind: 'coopNoRoom', item: 'toriya' }, null, ctx).right).toEqual({ icon: 'toriya', word: 'おく', disabled: true });
    expect(actionHintLines({ kind: 'coopMax', item: 'toriya' }, null, ctx).right).toEqual({ icon: 'toriya', word: 'おく', disabled: true });
  });
  it('kitNeedEgg・coopNoEgg は 照準 の 下 に 出さない（クリック で 合図 の チップ）', () => {
    expect(actionHintLines({ kind: 'kitNeedEgg', item: null }, null, ctx).right).toBeUndefined();
    expect(actionHintLines({ kind: 'coopNoEgg', item: null }, null, ctx).right).toBeUndefined();
  });
});

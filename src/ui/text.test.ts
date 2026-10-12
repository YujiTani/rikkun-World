import { describe, expect, it } from 'vitest';
import { findUnrubiedKanji, ruby } from './text';

describe('ruby', () => {
  it('漢字にふりがなをつける', () => {
    expect(ruby('妖怪', 'ようかい')).toBe('<ruby>妖怪<rt>ようかい</rt></ruby>');
  });

  it('HTML を逃がす', () => {
    expect(ruby('<b>', 'x')).toBe('<ruby>&lt;b&gt;<rt>x</rt></ruby>');
  });
});

describe('findUnrubiedKanji', () => {
  it('ひらがな・カタカナだけなら何も見つけない', () => {
    expect(findUnrubiedKanji('りっくんワールド')).toEqual([]);
  });

  it('ruby で包まれた漢字は OK', () => {
    expect(findUnrubiedKanji(`${ruby('妖怪', 'ようかい')}がでた`)).toEqual([]);
  });

  it('ふりがなのない漢字を見つける', () => {
    expect(findUnrubiedKanji('<p>妖怪がでた</p>')).toEqual(['妖', '怪']);
  });
});

import { describe, expect, it } from 'vitest';
import * as text from './text';
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

/**
 * WEAPON-7 AC12e / §2.7 (2): アイテム名・実績の 名前の ［漢字｜よみ］ を 出す 共通の 手だて。
 * 名前は 開発が 決める 約束だが、テストの ために 仮に `withRuby`（HTML に する）・`yomiOf`（よみだけに する）と 呼ぶ。
 * ほかの 名前に したら、この ファイルの 2 つの 名前を 直す（テストの 期待は 変えない）。
 */
const T = text as unknown as { withRuby: (s: string) => string; yomiOf: (s: string) => string };
describe('WEAPON-7 AC12e: ［漢字｜よみ］', () => {
  it('HTML に する: ruby() と 同じ HTML', () => {
    expect(T.withRuby('［雷神剣｜らいじんけん］')).toBe(ruby('雷神剣', 'らいじんけん'));
    expect(T.withRuby('はじめて ［雷神剣｜らいじんけん］ を てにいれた！')).toBe(`はじめて ${ruby('雷神剣', 'らいじんけん')} を てにいれた！`);
    expect(T.withRuby('［虹｜にじ］と［風神剣｜ふうじんけん］')).toBe(`${ruby('虹', 'にじ')}と${ruby('風神剣', 'ふうじんけん')}`);
  });
  it('ほかの 字は エスケープ される（ヌシ が <b> のような 字）', () => {
    expect(T.withRuby('ヌシ が <b>')).toBe('ヌシ が &lt;b&gt;');
    expect(T.withRuby('<i>［虹｜にじ］&')).toBe(`&lt;i&gt;${ruby('虹', 'にじ')}&amp;`);
  });
  it('かなだけの 名前は 今と 同じ 字', () => {
    expect(T.withRuby('きらめく カタナ')).toBe('きらめく カタナ');
    expect(T.withRuby('')).toBe('');
  });
  it('よみだけに する', () => {
    expect(T.yomiOf('［雷神剣｜らいじんけん］')).toBe('らいじんけん');
    expect(T.yomiOf('ヌシ が ［雷神剣｜らいじんけん］ を おとした！')).toBe('ヌシ が らいじんけん を おとした！');
    expect(T.yomiOf('きらめく カタナ')).toBe('きらめく カタナ');
  });
  it('HTML に した ものに ふりがなの ない 漢字は ない', () => {
    expect(findUnrubiedKanji(T.withRuby('ヌシ が ［雷神剣｜らいじんけん］ を おとした！'))).toEqual([]);
    expect(T.withRuby('［雷神剣｜らいじんけん］')).toContain('<rt>らいじんけん</rt>');
  });
});

import { describe, expect, it } from 'vitest';
import { NG_ALLOWED, NG_GROUPS, NG_WORDS, hasNgName, hasNgWord, normalizeName, trimToClean } from './ngWords';
import { SUFFIXES } from './tuning';

/** HOUSE-1B AC58（よくない ことば。仕様 §2.6・docs/design/HOUSE-1-ngwords.md）の しらべ方。表の 中身は yuzu が 足し引きする ので、しくみと 約束の ことばだけ たしかめる */

/** ngwords.md 4 章の 止まらない 名前の 例 29 こ（テストは md を 読まない ので 写す。表を かえたら 見直す） */
const SAFE_NAMES = [
  'りっくん', 'ゆず', 'たろう', 'はなこ', 'ひみつ', 'ねこ', 'いぬ', 'ハヤテ', 'ドラゴン', 'にんじゃ',
  'さむらい', 'しんかんせん', 'シンデレラ', 'カステラ', 'かえろう', 'ちびっこ', 'やくそく', 'けいさつ', 'ころころ', 'かいじゅう',
  'おばけ', 'ばけねこ', 'きつね', 'もぐら', 'くじら', 'ぶどう', 'たまご', 'まんげつ', 'せんせい',
];

describe('normalizeName（そろえる）', () => {
  it('カタカナは ひらがなに・小さい っ ゃ ゅ ょ は 大きい つ や ゆ よ に・ー は とる', () => {
    expect(normalizeName('シネ')).toBe('しね');
    expect(normalizeName('しーね')).toBe('しね');
    expect(normalizeName('ぶっころ')).toBe('ぶつころ');
    expect(normalizeName('ブッコロ')).toBe('ぶつころ');
    expect(normalizeName('きゃっ')).toBe('きやつ');
    expect(normalizeName('ちゅうしゃ')).toBe('ちゆうしや');
    expect(normalizeName('ヴ')).toBe('ゔ');
  });

  it('゛ ゜ は そろえない（「でぶ」と「てふ」は ちがう ことば）', () => {
    expect(normalizeName('でぶ')).not.toBe(normalizeName('てふ'));
    expect(normalizeName('はぱ')).toBe('はぱ');
  });

  it('ほかの 字（英字・漢字）は そのまま', () => {
    expect(normalizeName('A1家')).toBe('A1家');
  });
});

describe('表', () => {
  it('1 章の 37 こ（①〜④）。分け方ごとの 数', () => {
    expect(NG_GROUPS.violence).toHaveLength(11);
    expect(NG_GROUPS.insult).toHaveLength(13);
    expect(NG_GROUPS.crude).toHaveLength(7);
    expect(NG_GROUPS.bias).toHaveLength(6);
    expect(NG_WORDS).toHaveLength(37);
    expect(new Set(NG_WORDS).size, 'そろえた 形で 同じ ことばが 2 つ ない').toBe(NG_WORDS.length);
  });

  it('テストの ことば（しね・でぶ・ぶっころ）は 必ず 入って いる', () => {
    for (const w of ['しね', 'でぶ', 'ぶっころ']) expect(NG_WORDS, w).toContain(normalizeName(w));
  });

  it('子どもが おもしろがる ことば（2 章。yuzu 21:49）は 表に ない', () => {
    for (const w of ['うんこ', 'うんち', 'おしっこ', 'おなら', 'おしり', 'おっぱい', 'ちんちん', 'ぱんつ', 'えっち', 'へんたい', 'くそ', 'はげ', 'ちび', 'くず', 'かす', 'ごみ']) {
      expect(hasNgWord(w), w).toBe(false);
    }
  });

  it('ゆるす ことば（ちびっこ）', () => {
    expect(NG_ALLOWED.map(normalizeName)).toContain('ちびつこ');
  });

  it('後ろの 文字 5 つ だけでは どの ことばにも ならない', () => {
    for (const s of SUFFIXES) expect(hasNgWord(s), s).toBe(false);
  });
});

describe('hasNgWord（止める 名前か）', () => {
  it('止める ことば: ひらがな・カタカナ・ー・大きい つ・名前の まん中', () => {
    for (const name of ['しね', 'シネ', 'しーね', 'でぶ', 'ぶっころ', 'ぶつころ', 'ブッコロ', 'あしね', 'しねこ', 'ばか', 'ちんこ', 'きちがい']) expect(hasNgWord(name), name).toBe(true);
  });

  it('止まらない: ゛ ゜ が ちがう「てふ」・字が たりない「し」・ふつうの ことば', () => {
    for (const name of ['てふ', 'はか', 'し', 'しん', 'かいじゅう', 'ころ', 'ばけ', '']) expect(hasNgWord(name), name).toBe(false);
  });

  it('止まらない 名前の 例 29 こは どこまで 入れても 止まらない（1 字ずつ・前から）', () => {
    expect(SAFE_NAMES).toHaveLength(29);
    for (const name of SAFE_NAMES) {
      const chars = [...name];
      for (let n = 1; n <= chars.length; n++) expect(hasNgWord(chars.slice(0, n).join('')), `${name} の ${n} 字目まで`).toBe(false);
    }
  });

  it('ゆるす ことばの 中に まるごと 入る 一致だけ ゆるす（ちびっこ）。はみ出して つながる 分は 止める（ちびっころす）', () => {
    expect(hasNgWord('ちびっこ')).toBe(false);
    expect(hasNgWord('ちびっこちびっこ')).toBe(false);
    expect(hasNgWord('ちびっころす'), 'ころす が ちびっこの 外へ はみ出す').toBe(true);
    expect(hasNgWord('ちびっこしね'), 'しね は ゆるす ことばの 外').toBe(true);
    expect(hasNgWord('びっこ'), 'ゆるす ことばの 中では ない').toBe(true);
    expect(hasNgWord('ちびこ')).toBe(false);
  });

  it('前の 文字と 後ろの 文字を つないだ 名前も しらべられる（つなぎ目で ことばに なる とき）', () => {
    expect(hasNgWord('あし' + 'ねこ')).toBe(true);
    expect(hasNgWord('りっくん' + SUFFIXES[0])).toBe(false);
  });
});

describe('hasNgName（前の 文字 ＋ 後ろの 文字）', () => {
  it('つないだ 名前で しらべる', () => {
    expect(hasNgName({ front: 'あし', back: 'ねこ' })).toBe(true);
    expect(hasNgName({ front: 'りっくん', back: SUFFIXES[0]! })).toBe(false);
    expect(hasNgName({ front: '', back: '' })).toBe(false);
  });
});

describe('trimToClean（なくなるまで 後ろから 消す）', () => {
  it('よくない ことばが なければ そのまま（0 字）', () => {
    expect(trimToClean('りっくん', SUFFIXES[0]!)).toEqual({ front: 'りっくん', cut: 0 });
    expect(trimToClean('ちびっこ', '')).toEqual({ front: 'ちびっこ', cut: 0 });
    expect(trimToClean('', '')).toEqual({ front: '', cut: 0 });
  });

  it('ことばが 見つからなく なるまで 1 字ずつ 消す', () => {
    expect(trimToClean('あしね', '')).toEqual({ front: 'あし', cut: 1 });
    expect(trimToClean('ばかばか', '')).toEqual({ front: 'ば', cut: 3 });
    expect(trimToClean('ころす', '')).toEqual({ front: 'ころ', cut: 1 });
  });

  it('後ろの 文字は 消さない（前の 文字だけ 消す）', () => {
    expect(trimToClean('ばか', 'ハウス')).toEqual({ front: 'ば', cut: 1 });
  });

  it('後ろの 文字と つながって できる ことばも 消す（つなぎ目）', () => {
    // 後ろに ことばの 後ろ半分が ある 形（表の 「しね」を 前 ＋ 後ろに 分ける）
    expect(trimToClean('あし', 'ね')).toEqual({ front: 'あ', cut: 1 });
  });
});

/**
 * 6歳向けの文字ルール:
 * ひらがな・カタカナはそのまま使える。漢字は必ず ruby() でふりがなをつける。
 */

/** 漢字にふりがなをつけた HTML を作る。例: ruby('妖怪', 'ようかい') */
export function ruby(kanji: string, yomi: string): string {
  return `<ruby>${escapeHtml(kanji)}<rt>${escapeHtml(yomi)}</rt></ruby>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const KANJI = /[一-鿿㐀-䶿]/;

/**
 * ruby() で包まれていない漢字が残っていないかを調べる。
 * テストで「ふりがなのつけ忘れ」を見つけるために使う。
 */
export function findUnrubiedKanji(html: string): string[] {
  const withoutRuby = html.replace(/<ruby>[\s\S]*?<\/ruby>/g, '');
  const textOnly = withoutRuby.replace(/<[^>]*>/g, '');
  return [...textOnly].filter((ch) => KANJI.test(ch));
}

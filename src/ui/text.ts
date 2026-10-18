/**
 * 6歳向けの文字ルール:
 * ひらがな・カタカナはそのまま使える。漢字は必ず ruby() でふりがなをつける。
 *
 * アイテム名・実績の名前（データ）に漢字を書くときは ［漢字｜よみ］（WEAPON-7 §2.7）。
 * 画面に出すときは **`textContent` に名前を入れない**。`withRuby()` で HTML にして `innerHTML` で入れる
 * （HTML にできない所〈ならべかえ・文字の長さの計算・テストの文字くらべ〉は `yomiOf()`）。
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

/** ［漢字｜よみ］ の 1 つ（全角のかっこ・たて線） */
const MARKED = /［([^｜］]+)｜([^］]+)］/g;

/**
 * ［漢字｜よみ］ を ruby() に して、ほかの 字は escapeHtml して つなぐ HTML にする（WEAPON-7 §2.7 (2)）。
 * ［］を 使わない（かなだけの）文は escapeHtml しただけ。
 */
export function withRuby(s: string): string {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(MARKED)) {
    out += escapeHtml(s.slice(last, m.index));
    out += ruby(m[1]!, m[2]!);
    last = m.index + m[0].length;
  }
  return out + escapeHtml(s.slice(last));
}

/** ［漢字｜よみ］ を よみだけに する（HTML に できない 所用）。例: ［雷神剣｜らいじんけん］ → らいじんけん */
export function yomiOf(s: string): string {
  return s.replace(MARKED, '$2');
}

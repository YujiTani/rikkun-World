// HOUSE-1B 名前に 入れられない ことば（よくない ことば）の 表と しらべ方。仕様 docs/design/HOUSE-1.md §2.6・AC58。DOM・three なし。
// 表は ゲームの 中で この 1 か所（なまえを かえる〔1C〕など ほかの 名前を 入れる 所も ここを 使う）。案は docs/design/HOUSE-1-ngwords.md の 1 章（37 こ）。
// 2 章の ことば（うんこ・ちび・くず など 子どもが おもしろがる ことば）は 止めない（yuzu 2026-10-30 21:49「表の 37 こだけ止める」）ので 足さない。

/** 分け方 4 つ（① 死・暴力 ② 悪口 ③ 下品・性的 ④ 差別）。ことばは 読みやすい 形で 書く（しらべる 前に そろえる） */
export const NG_GROUPS = {
  violence: ['しね', 'ころす', 'ころせ', 'ころして', 'ころしや', 'ぶっころ', 'ぶちころ', 'しんじゃえ', 'じさつ', 'さつじん', 'くたばれ'],
  insult: ['ばか', 'あほ', 'まぬけ', 'ぶす', 'でぶ', 'ぶさいく', 'うざい', 'きもい', 'だまれ', 'きえろ', 'やくたたず', 'ばばあ', 'じじい'],
  crude: ['ちんこ', 'ちんぽ', 'まんこ', 'きんたま', 'せっくす', 'れいぷ', 'えろい'],
  bias: ['がいじ', 'きちがい', 'かたわ', 'めくら', 'つんぼ', 'びっこ'],
} as const satisfies Record<'violence' | 'insult' | 'crude' | 'bias', readonly string[]>;

/**
 * ゆるす ことば（表の ことばで おわる ふつうの ことば）。この 中に まるごと 入って いる 一致だけ 止めない
 * （はみ出して つながる 分は 止める。「ちびっころす」は ころす で 止まる）
 */
export const NG_ALLOWED: readonly string[] = ['ちびっこ'];

const SMALL_TO_LARGE: Readonly<Record<string, string>> = { っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ' };

/**
 * 名前を くらべやすい 形に そろえる: カタカナ → ひらがな、小さい っ ゃ ゅ ょ → 大きい つ や ゆ よ、ー は とる。
 * ゛ ゜ は そろえない（「でぶ」と「てふ」は ちがう ことば）。「シネ」「しーね」も「しね」、「ぶつころ」も「ぶっころ」と 同じに なる
 */
export function normalizeName(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (ch === 'ー') continue;
    const hira = c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
    out += SMALL_TO_LARGE[hira] ?? hira;
  }
  return out;
}

/** そろえた 形の 止める ことば（表の ならび） */
export const NG_WORDS: readonly string[] = Object.values(NG_GROUPS).flatMap((list) => list.map(normalizeName));
const ALLOWED_NORMAL: readonly string[] = NG_ALLOWED.map(normalizeName);

/** s の 中の word の 場所（はじめの 位置）を 前から 1 つずつ 返す（重なって いても 数える） */
function* occurrences(s: string, word: string): Generator<number> {
  for (let at = s.indexOf(word); at >= 0; at = s.indexOf(word, at + 1)) yield at;
}

/**
 * 名前（前の 文字と 後ろの 文字を つなげた ぜんぶ）に よくない ことばが あるか。そろえて から 表の ことばを さがし、
 * ゆるす ことばの 中に まるごと 入って いる 一致は 数えない
 */
export function hasNgWord(name: string): boolean {
  const s = normalizeName(name);
  if (s.length < 2) return false;
  const allowed: Array<readonly [number, number]> = [];
  for (const w of ALLOWED_NORMAL) for (const at of occurrences(s, w)) allowed.push([at, at + w.length]);
  for (const w of NG_WORDS) {
    for (const at of occurrences(s, w)) {
      const end = at + w.length;
      if (!allowed.some(([a, b]) => a <= at && end <= b)) return true;
    }
  }
  return false;
}

/** 名前（前の 文字 ＋ 後ろの 文字）に よくない ことばが あるか（つなぎ目で ことばに なる 分も 数える） */
export function hasNgName(name: { readonly front: string; readonly back: string }): boolean {
  return hasNgWord(name.front + name.back);
}

/**
 * 前の 文字の 後ろから 1 字ずつ 消して、名前（前 ＋ 後ろ）から よくない ことばが なくなる ところで 止める（もう なければ 消さない）。
 * 後ろの 文字（back）は 消さない。cut ＝ 消した 字数
 */
export function trimToClean(front: string, back: string): { front: string; cut: number } {
  const chars = [...front];
  let cut = 0;
  while (chars.length > 0 && hasNgWord(chars.join('') + back)) {
    chars.pop();
    cut++;
  }
  return { front: chars.join(''), cut };
}

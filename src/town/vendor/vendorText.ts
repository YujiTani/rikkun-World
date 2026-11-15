/**
 * TOWN-1 1E の 画面の 文の 表（かじやさん・かいとりの やたい・食事・かえりの おふだ。docs/design/TOWN-1-shop.md §2.10〜§2.13。
 * 「ダマ」と 略さず「ようかいダマ」。AC50 が この 表を 読む）。漢字は ［漢字｜よみ］（画面で `withRuby()`）。ここは 何も import しない 葉。
 */
export const SMITH_TEXT = {
  /** 画面の 名前 */
  title: 'かじや',
  /** 人の 名前（ふきだし） */
  name: 'かじやさん',
  /** はなしかけた ときの ふきだし（§2.11 の 1） */
  greet: 'どれを なおす？',
  /** なおす 物が 1 つも ない（§2.11 の 4。画面の かわり） */
  none: 'どれも ピカピカ だね！',
  /** なおした */
  fixed: 'ピカピカに なったよ！',
  /** 一覧の まとまりの 名前 */
  list: 'なおす もの',
  /** えらぶ 前の 右の 説明 */
  pick: 'なおす ものを えらんでね',
  /** なおす ボタン */
  buy: 'なおす',
  /** たいきゅうの ラベル */
  durability: 'たいきゅう',
  /** ボタンの 上の ねだんの 文 */
  pay: (n: number): string => `ようかいダマ ${n} こで まんたん`,
  /** 一覧が からっぽに なった */
  empty: 'ぜんぶ ピカピカ！',
} as const;

export const STALL_TEXT = {
  title: 'かいとりの やたい',
  name: 'やたいさん',
  /** はなしかけた ときの ふきだし */
  greet: 'やさい・たまご・こうせきを ようかいダマと とりかえるよ',
  /** わたせる 物が 1 つも ない（画面の かわり） */
  none: 'やさいや たまご、こうせきを もってきてね',
  /** わたした */
  thanks: 'ありがとう！ ようかいダマ 1 こ どうぞ',
  /** きょうは もう いっぱい（§2.12 の 3） */
  cap: 'きょうは もう いっぱい。また あした ね',
  list: 'わたせる もの',
  pick: 'わたす ものを えらんでね',
  /** わたす ボタン */
  buy: 'わたす',
  /** 下の 帯「□ こ で ようかいダマ 1 こ」（§2.12 の 1） */
  rate: (n: number): string => `${n} こ で ようかいダマ 1 こ`,
  /** もって いる 数 */
  have: (n: number): string => `もっている かず ${n}`,
  /** きょう もらえる のこり */
  left: (n: number): string => `きょうは あと ${n} こ もらえるよ`,
  /** たりない（§2.12 の 2） */
  short: (n: number): string => `あと ${n} こ たりないよ`,
  empty: 'もう わたせる ものは ないよ',
} as const;

export const MEAL_TEXT = {
  dango: 'だんごやさん',
  gohan: 'ごはんやさん',
  /** 食べ物の 名前 */
  dangoFood: 'だんご',
  gohanFood: 'ごはん',
  /** はなしかけた ときの ふきだし（§2.13 の 1） */
  greet: 'おなか すいた？',
  /** たべる ボタン */
  eat: 'たべる',
  /** まんたん（§2.13 の 3） */
  full: 'おなか いっぱい だね！',
  /** とじる ボタン */
  close: '✕ とじる',
} as const;

export const OFUDA_TEXT = {
  /** 街の 中で つかった（§2.10 の 4） */
  inTown: 'もう まちに いるよ',
} as const;

/** みんなの 画面で 同じ 文 */
export const VENDOR_TEXT = {
  /** 上の 帯の ラベル */
  have: 'もっている ようかいダマ',
  /** ようかいダマが たりない（よろずやと 同じ。n ＝ たりない 数） */
  short: (n: number): string => `ようかいダマが あと ${n} こ たりないよ`,
  /** ✕ の 名前（読み上げ） */
  close: 'とじる',
  /** ようかいダマ（下の 帯の 名前） */
  orb: 'ようかいダマ',
} as const;

/** AC50 の しらべ用: 表の 文 ぜんぶ（数の 入る 文は 見本の 数で） */
export function vendorTexts(): string[] {
  const out: string[] = [];
  for (const t of [SMITH_TEXT, STALL_TEXT, MEAL_TEXT, OFUDA_TEXT, VENDOR_TEXT]) for (const v of Object.values(t)) out.push(typeof v === 'function' ? v(3) : v);
  return out;
}

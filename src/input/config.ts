/** 入力・案内画面の数値と文字（1 か所にまとめる） */
export const INPUT_CONFIG = {
  /** はじめての案内文字 */
  textFirst: 'クリックして あそぼう！',
  /** ロックが外れたあとの案内文字 */
  textResume: 'クリックして つづきを あそぼう！',
  /** ボタンの最小の大きさ（px） */
  buttonMinWidthPx: 512,
  buttonMinHeightPx: 96,
  buttonFontPx: 32,
  captionFontPx: 20,
  /** 画面の幅に対するボタンの幅 */
  buttonWidthVw: 40,
  /** うすい黒の不透明度 */
  dimOpacity: 0.5,
  /** 「ぷるん」の周期（秒） */
  pulseSeconds: 1.5,
} as const;

/** マウスホイール（M2 §2.1） */
export const WHEEL_CONFIG = {
  /** この量（deltaY）ごとに 1 マス動く */
  pixelsPerSlot: 50,
  /** 行単位のホイールは 1 行 = 1 マス */
  linePixels: 50,
  /** ページ単位のホイールは 1 ページ = 3 マス */
  pagePixels: 150,
  /** ロックのかけ直しの返事を待つ長さ（ミリ秒）。来なければ案内画面を出す */
  relockTimeoutMs: 1500,
} as const;

/** 操作の絵の説明（ひらがな・カタカナのみ） */
export const HELP_CAPTIONS = [
  'あるく',
  'ジャンプ',
  'むきを かえる',
  'みかた を かえる',
  'ほる（おしつづける）',
  'ひびが MAX なら もういちど クリック',
  'おく',
  'もちものを えらぶ',
  'もちもの',
] as const;

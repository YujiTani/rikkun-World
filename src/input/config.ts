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

/** 操作の絵の説明（ひらがな・カタカナのみ） */
export const HELP_CAPTIONS = ['あるく', 'ジャンプ', 'むきを かえる', 'みかた を かえる'] as const;

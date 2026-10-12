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

import { ruby } from '../ui/text';

const LEFT_CLICK = `${ruby('左', 'ひだり')}クリック`;
const RIGHT_CLICK = `${ruby('右', 'みぎ')}クリック`;

/** 操作の説明（短い文。漢字は ruby() でふりがな付き。HTML） */
export const HELP_CAPTIONS = [
  'W A S D で あるく',
  'スペース で ジャンプ',
  'マウスを うごかして むきを かえる',
  'V で みかた を かえる',
  `${LEFT_CLICK} を おしつづけて ほる`,
  'ひびが MAX で もういちど おす',
  `${RIGHT_CLICK} で おく`,
  '1〜9 か ホイール で もちものを えらぶ',
  'E で もちもの をひらく',
] as const;

/** 案内画面（Esc）のあそびかたのタブ（M4 §2.11）。字はひらがな・カタカナと、ふりがな付きの漢字 */
export type GuideTabId = 'move' | 'dig' | 'fight' | 'craft';

export const GUIDE_TAB_IDS: readonly GuideTabId[] = ['move', 'dig', 'fight', 'craft'];

export const GUIDE_TABS: Record<GuideTabId, { label: string; icon: string; captions: readonly string[] }> = {
  move: {
    label: 'うごく',
    icon: '🏃',
    captions: [HELP_CAPTIONS[0], HELP_CAPTIONS[1], HELP_CAPTIONS[2], HELP_CAPTIONS[3]],
  },
  dig: {
    label: 'ほる・おく',
    icon: '⛏',
    captions: [HELP_CAPTIONS[4], HELP_CAPTIONS[5], HELP_CAPTIONS[6], HELP_CAPTIONS[7], HELP_CAPTIONS[8]],
  },
  fight: {
    label: 'たたかう',
    icon: '⚔',
    captions: [
      `${LEFT_CLICK} で たたく`,
      'なぎなた は とおくまで とどく',
      'ゆみ は や を とばす',
      `${ruby('防具', 'ぼうぐ')}は ダブルクリック で ${ruby('着', 'き')}る・ぬぐ`,
      'よる は おうち に にげよう',
    ],
  },
  craft: {
    label: 'つくる・やく',
    icon: '🔨',
    captions: [
      'E で つくる',
      'ひかっている のを おす',
      'かなづち が でたら つくれる',
      `かまど に ${RIGHT_CLICK} で やく`,
      'ねんりょう は せきたん・あぶら・き',
      'Q で 1こ すてる',
      'たんす に しまう',
    ],
  },
};

/** 案内画面のタブの大きさ（1280px のとき 高さ 64px 以上・文字 24px 以上） */
export const GUIDE_TAB_STYLE = {
  heightPx: 64,
  fontPx: 26,
  selectedColor: '#FFD54F',
} as const;

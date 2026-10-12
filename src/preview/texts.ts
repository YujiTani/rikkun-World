/** 見本ページの画面の文字（ひらがな・カタカナ・数字だけ。AC6） */
export const BUTTON_TEXTS = {
  color: 'いろ',
  shadow: 'かげ',
  wait: 'まつ',
  move: 'うごく',
  attack: 'こうげき',
  hit: 'たたかれた',
  die: 'たおれる',
  spin: 'まわす',
  stop: 'とめる',
  front: 'まえ',
  side: 'よこ',
} as const;

export const PAGE_TITLE = 'ようかいみほん';
export const DOLL_LABEL = 'プレイヤー';

export const ALLOWED_TEXT = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・0-9\s]*$/u;

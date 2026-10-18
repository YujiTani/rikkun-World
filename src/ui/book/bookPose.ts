import type { BookAnim, BookView } from './bookModel';

/**
 * BOOK-1 §4・STYLE §6: 本の 姿勢（画面なし。3D の 前に 計算だけ する）。
 * e ＝ ひらき具合（0 ＝ とじた本、1 ＝ 見開き）。grow ＝ 大きさ（あらわれる・とじて 消える）。
 */
export interface PoseIn {
  view: BookView;
  anim: BookAnim;
  /** 動きの 進み 0〜1 */
  p: number;
  turnDir: 1 | -1;
  /** とじる 動きを 始めた ときの ひらき具合（途中から とじても とびはねない） */
  closeFromE: number;
}

export interface Pose {
  visible: boolean;
  e: number;
  /** 0〜1 → 大きさ 0.4〜1 倍 */
  grow: number;
  /** めくる 紙の 角度（0〜π）。めくって いないとき null */
  leaf: number | null;
  /** ゆれ（-1〜1） */
  shake: number;
}

export const ease = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
const easeOut = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** とじる 動きの うち 表紙が とじるのに 使う 割合（のこりで 小さくなって 消える） */
export const CLOSE_SPLIT = 0.7;

export function bookPose(i: PoseIn): Pose {
  const rest: Pose = { visible: true, e: 1, grow: 1, leaf: null, shake: 0 };
  if (i.view === 'closed' && i.anim === 'none') return { ...rest, visible: false };
  switch (i.anim) {
    case 'appear':
      return { ...rest, e: 0, grow: easeOut(i.p) };
    case 'open':
      return { ...rest, e: ease(i.p) };
    case 'turn':
      return { ...rest, leaf: Math.PI * (i.turnDir > 0 ? ease(i.p) : 1 - ease(i.p)) };
    case 'bump':
      return { ...rest, shake: Math.sin(i.p * Math.PI * 2) * (1 - i.p) };
    case 'close':
      return i.p < CLOSE_SPLIT
        ? { ...rest, e: i.closeFromE * (1 - ease(i.p / CLOSE_SPLIT)) }
        : { ...rest, e: 0, grow: 1 - ease((i.p - CLOSE_SPLIT) / (1 - CLOSE_SPLIT)) };
    default:
      return rest;
  }
}

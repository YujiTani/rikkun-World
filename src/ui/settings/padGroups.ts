/**
 * ゲームパッド画面の「ボタンのまとまり」と札のもと。
 * 図の四角（padDiagram）も、札の並び（padScreen）も、ここ 1 か所から作る。
 */
import type { Action } from '../../input/actions';
import type { PadFace } from '../../input/gamepad/mapping';
import { labelOfAction } from './controlRows';

/** 図の高さを のばす倍率（札の列の高さに ちかづけて、線を ほぼ横にするため） */
const PAD_STRETCH = 1.6;
/** 図の viewBox の高さ */
export const PAD_VIEW_H = Math.round(460 * PAD_STRETCH);
/** もとの y（高さ 460 の図）を、のばした図の y にする。ボタンのまとまりの中心だけ動かし、まとまりの大きさは変えない */
export function padY(y: number): number {
  return Math.round(y * PAD_STRETCH);
}
/** まとまりの中心の y（のばした図） */
export const PAD_CENTER = {
  shoulder: padY(93),
  mid: padY(168),
  stickL: padY(238),
  dpad: padY(352),
  abxy: padY(264),
  stickR: padY(384),
} as const;
function at(x: number, cy: number, w: number, h: number): PadGroup['box'] {
  return { x, y: cy - Math.round(h / 2), w, h };
}

export type PadSide = 'left' | 'right';

export interface PadGroup {
  id: string;
  side: PadSide;
  /** 図（viewBox 720×460）の中の四角 */
  box: { x: number; y: number; w: number; h: number };
  /** このまとまりに入る面。札はこの順に縦に並ぶ */
  faces: readonly PadFace[];
  /** 面ではないスティックの動き（割り当てなし）。あるなら先頭に出す */
  stick?: { id: string; text: string };
}

/** 左は上から ZL/L・−・ひだりスティック・十字、右は ZR/R・＋・ABXY・みぎスティック */
export const PAD_GROUPS: readonly PadGroup[] = [
  { id: 'zl', side: 'left', box: at(140, PAD_CENTER.shoulder, 160, 106), faces: ['l2', 'l1'] },
  { id: 'minus', side: 'left', box: at(244, PAD_CENTER.mid, 76, 40), faces: ['select'] },
  { id: 'stickL', side: 'left', box: at(146, PAD_CENTER.stickL, 88, 88), faces: ['l3'], stick: { id: 'stickL', text: 'あるく' } },
  { id: 'dpad', side: 'left', box: at(138, PAD_CENTER.dpad, 124, 124), faces: ['dpadUp', 'dpadLeft', 'dpadRight', 'dpadDown'] },
  { id: 'zr', side: 'right', box: at(420, PAD_CENTER.shoulder, 160, 106), faces: ['r2', 'r1'] },
  { id: 'plus', side: 'right', box: at(394, PAD_CENTER.mid, 76, 40), faces: ['start'] },
  { id: 'abxy', side: 'right', box: at(488, PAD_CENTER.abxy, 138, 138), faces: ['faceTop', 'faceLeft', 'faceRight', 'faceBottom'] },
  { id: 'stickR', side: 'right', box: at(476, PAD_CENTER.stickR, 88, 82), faces: ['r3'], stick: { id: 'stickR', text: 'みる' } },
];

/** 札 1 枚。faces は右の印（同じ ことばが 2 つの ボタンに あるときは 並べる） */
export interface PadLabel {
  /** testid と対応づけ用（action があれば action、なければ stick の id） */
  key: string;
  text: string;
  group: string;
  faces: readonly PadFace[];
  /** 割り当て直しできるときの action */
  action: Action | null;
  /** スティック（印は スティックの絵） */
  stick?: 'stickL' | 'stickR';
}

type Binds = Partial<Record<PadFace, Action | null>>;

/** あそぶ とき。同じ意味は 1 枚にまとめ、割り当てのない面は出さない（SETTINGS-1） */
export function playLabels(binds: Binds): PadLabel[] {
  const out: PadLabel[] = [];
  const byAction = new Map<Action, PadLabel>();
  for (const g of PAD_GROUPS) {
    if (g.stick) {
      const stickFace = g.stick.id as 'stickL' | 'stickR';
      out.push({ key: g.stick.id, text: g.stick.text, group: g.id, faces: [], action: null, stick: stickFace });
    }
    for (const face of g.faces) {
      const action = binds[face] ?? null;
      if (!action) continue;
      const same = byAction.get(action);
      if (same) {
        (same.faces as PadFace[]).push(face);
        continue;
      }
      const label: PadLabel = { key: action, text: labelOfAction(action), group: g.id, faces: [face], action };
      byAction.set(action, label);
      out.push(label);
    }
  }
  return out;
}

/** もちもの・クラフト（メニューを開いているとき）。reader.ts の menuOpen と同じ */
export const MENU_LABELS: readonly PadLabel[] = [
  { key: 'menu-dpad', text: 'えらぶ', group: 'dpad', faces: ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'], action: null },
  { key: 'menu-ok', text: 'きめる', group: 'abxy', faces: ['faceBottom'], action: null },
  { key: 'menu-back', text: 'もどる', group: 'abxy', faces: ['faceRight'], action: null },
  { key: 'menu-start', text: 'スタートメニュー', group: 'plus', faces: ['start'], action: null },
];

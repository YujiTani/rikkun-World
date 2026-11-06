/**
 * ゲームパッド画面の「ボタンのまとまり」と札のもと。
 * 図の四角（padDiagram）も、札の並び（padScreen）も、ここ 1 か所から作る。
 */
import type { Action } from '../../input/actions';
import type { PadFace } from '../../input/gamepad/mapping';
import { labelOfAction } from './controlRows';

/** 図の高さを のばす倍率（四角と札の高さを ちかづけて、線を ほぼ横にするため） */
const PAD_STRETCH = 1.5;
/** 図の viewBox の高さ */
export const PAD_VIEW_H = Math.round(460 * PAD_STRETCH);
/** もとの y（高さ 460 の図）を、のばした図の y にする。ボタンのまとまりの中心だけ動かし、まとまりの大きさは変えない */
export function padY(y: number): number {
  return Math.round(y * PAD_STRETCH);
}
/**
 * 肩ボタン（上から見た図）と 本体（正面図）の あいだの あき。図の座標で 90 ≒ 画面で 50px（図の幅 400px のとき）。
 * 本体のてっぺんは もとの y=136 あたり
 */
const SHOULDER_GAP = 90;
/** 本体（正面図）のてっぺんの y（のばした図） */
export const PAD_BODY_TOP = padY(136);
const SHOULDER_BOX_H = 106;
/** まとまりの中心の y（のばした図）。肩ボタンだけは 本体から はなして 上に置く */
export const PAD_CENTER = {
  shoulder: PAD_BODY_TOP - SHOULDER_GAP - SHOULDER_BOX_H / 2,
  /** − ＋ は 本体のまんなか（十字と ABXY の あいだ） */
  mid: padY(255),
  /** 十字と ABXY、左右のスティックは 左右対称（同じ高さ） */
  dpad: padY(250),
  abxy: padY(250),
  stickL: padY(372),
  stickR: padY(372),
} as const;
function at(x: number, cy: number, w: number, h: number): PadGroup['box'] {
  return { x, y: cy - Math.round(h / 2), w, h };
}

/** left・right: 図の左右に札のかたまり。topLeft・topRight: 図の上の まんなかに、左はんぶん・右はんぶんの札 */
type PadSide = 'left' | 'right' | 'topLeft' | 'topRight';

interface PadGroup {
  id: string;
  side: PadSide;
  /** 図（viewBox 720 × PAD_VIEW_H）の中の四角 */
  box: { x: number; y: number; w: number; h: number };
  /** このまとまりに入る面。札はこの順に縦に並ぶ */
  faces: readonly PadFace[];
  /** 面ではないスティックの動き（割り当てなし）。あるなら先頭に出す */
  stick?: { id: string; text: string };
}

/**
 * 札は、まとまりごとに そのまとまりの近くに置く。
 * 左: ZL/L（左上）・十字・ひだりスティック（左下）。上: − ＋（図のまんなかにあるボタン。札は図の上の中央で、線は まっすぐ上へ）。右: ZR/R（右上）・ABXY・みぎスティック（右下）。
 * 先に書いたまとまりに、同じ意味の札が入る（できごとは − の札に十字の左もまとめる）
 */
export const PAD_GROUPS: readonly PadGroup[] = [
  { id: 'zl', side: 'left', box: at(142, PAD_CENTER.shoulder, 146, SHOULDER_BOX_H), faces: ['l2', 'l1'] },
  { id: 'minus', side: 'topLeft', box: at(300, PAD_CENTER.mid, 56, 40), faces: ['select'] },
  { id: 'dpad', side: 'left', box: at(138, PAD_CENTER.dpad, 124, 124), faces: ['dpadUp', 'dpadLeft', 'dpadRight', 'dpadDown'] },
  { id: 'stickL', side: 'left', box: at(156, PAD_CENTER.stickL, 88, 88), faces: ['l3'], stick: { id: 'stickL', text: 'あるく' } },
  { id: 'zr', side: 'right', box: at(432, PAD_CENTER.shoulder, 146, SHOULDER_BOX_H), faces: ['r2', 'r1'] },
  { id: 'plus', side: 'topRight', box: at(364, PAD_CENTER.mid, 56, 40), faces: ['start'] },
  { id: 'abxy', side: 'right', box: at(451, PAD_CENTER.abxy, 138, 138), faces: ['faceTop', 'faceLeft', 'faceRight', 'faceBottom'] },
  { id: 'stickR', side: 'right', box: at(476, PAD_CENTER.stickR, 88, 88), faces: ['r3'], stick: { id: 'stickR', text: 'カメラを うごかす' } },
];

/** 札 1 枚。faces は右の印（同じ ことばが 2 つの ボタンに あるときは 並べる） */
export interface PadLabel {
  /** testid と対応づけ用（action があれば action、なければ stick の id） */
  key: string;
  text: string;
  group: string;
  faces: readonly PadFace[];
  /** 割り当て直しできるときの action（まとめた札では 先頭） */
  action: Action | null;
  /** 札にまとめた操作ごとの 割り当て（ことばが同じ L・R は 1 まいにして 2 つ入る） */
  parts: { action: Action; faces: PadFace[] }[];
  /** ヘルプの帯の文の名前（data-help。helpText.ts） */
  help: string;
  /** スティック（印は スティックの絵） */
  stick?: 'stickL' | 'stickR';
}

type Binds = Partial<Record<PadFace, Action | null>>;

/** フィールド（あそぶ とき）。同じ意味は 1 枚にまとめ、割り当てのない面は出さない（SETTINGS-1） */
export function playLabels(binds: Binds): PadLabel[] {
  const out: PadLabel[] = [];
  const byAction = new Map<Action, PadLabel['parts'][number]>();
  const byText = new Map<string, PadLabel>();
  for (const g of PAD_GROUPS) {
    if (g.stick) {
      const stickFace = g.stick.id as 'stickL' | 'stickR';
      out.push({ key: g.stick.id, text: g.stick.text, group: g.id, faces: [], action: null, parts: [], help: `ui:${stickFace}`, stick: stickFace });
    }
    for (const face of g.faces) {
      const action = binds[face] ?? null;
      if (!action) continue;
      const part = byAction.get(action);
      if (part) {
        part.faces.push(face);
        const owner = out.find((l) => l.parts.includes(part))!;
        (owner.faces as PadFace[]).push(face);
        continue;
      }
      const text = labelOfAction(action);
      const same = byText.get(text);
      const fresh = { action, faces: [face] };
      byAction.set(action, fresh);
      if (same) {
        // ことばが同じ（てにもつを きりかえる: L と R）は 1 まいにまとめる
        same.parts.push(fresh);
        (same.faces as PadFace[]).push(face);
        continue;
      }
      const label: PadLabel = { key: action, text, group: g.id, faces: [face], action, parts: [fresh], help: `act:${action}` };
      byText.set(text, label);
      out.push(label);
    }
  }
  return out;
}

/** もちもの・クラフト（メニューを開いているとき）。reader.ts の menuOpen と同じ */
export const MENU_LABELS: readonly PadLabel[] = [
  { key: 'menu-dpad', help: 'ui:menuDpad', text: 'えらぶ', group: 'dpad', faces: ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'], action: null, parts: [] },
  { key: 'menu-ok', help: 'ui:menuOk', text: 'きめる', group: 'abxy', faces: ['faceBottom'], action: null, parts: [] },
  { key: 'menu-back', help: 'ui:menuBack', text: 'もどる', group: 'abxy', faces: ['faceRight'], action: null, parts: [] },
  { key: 'menu-start', help: 'ui:menuStart', text: 'スタートメニュー', group: 'plus', faces: ['start'], action: null, parts: [] },
];

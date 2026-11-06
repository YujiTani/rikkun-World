import type { Action } from '../actions';

/** 論理ボタン（位置ベース。Switch/Xbox の刻印差は UI 側） */
export type PadFace =
  | 'faceBottom'
  | 'faceRight'
  | 'faceLeft'
  | 'faceTop'
  | 'l1'
  | 'r1'
  | 'l2'
  | 'r2'
  | 'select'
  | 'start'
  | 'l3'
  | 'r3'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight';

export type MappingKind = 'standard' | 'switch' | 'fallback';

/** 論理面の 並び（割り当て表で 回す） */
export const PAD_FACES: readonly PadFace[] = [
  'faceBottom', 'faceRight', 'faceLeft', 'faceTop',
  'l1', 'r1', 'l2', 'r2',
  'select', 'start', 'l3', 'r3',
  'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
];

/** standard 番号 → 論理面 */
const STANDARD_FACE: Readonly<Record<number, PadFace>> = {
  0: 'faceBottom',
  1: 'faceRight',
  2: 'faceLeft',
  3: 'faceTop',
  4: 'l1',
  5: 'r1',
  6: 'l2',
  7: 'r2',
  8: 'select',
  9: 'start',
  10: 'l3',
  11: 'r3',
  12: 'dpadUp',
  13: 'dpadDown',
  14: 'dpadLeft',
  15: 'dpadRight',
};

/**
 * 非 standard の Switch Pro 風でよくある並び（実機で微調整可）。
 * 推測: 多くの BT Pro 風は面ボタンが B A Y X の順、肩が L R ZL ZR。
 */
const SWITCH_FACE: Readonly<Record<number, PadFace>> = {
  0: 'faceBottom', // B
  1: 'faceRight', // A
  2: 'faceLeft', // Y
  3: 'faceTop', // X
  4: 'l1',
  5: 'r1',
  6: 'l2',
  7: 'r2',
  8: 'select',
  9: 'start',
  10: 'l3',
  11: 'r3',
  12: 'dpadUp',
  13: 'dpadDown',
  14: 'dpadLeft',
  15: 'dpadRight',
};

/** 遊び中の既定割り当て（メニュー中は reader が差し替え） */
export const DEFAULT_PLAY_BINDS: Readonly<Record<PadFace, Action | null>> = {
  faceBottom: 'jump',
  faceRight: 'run',
  faceLeft: 'toggleInventory',
  faceTop: 'toggleView',
  l1: 'hotbarPrev',
  r1: 'hotbarNext',
  l2: 'secondary',
  r2: 'primary',
  select: 'openLog',
  /** ＋ は スタートメニュー（Esc と同じ）。もちものではない（SETTINGS-1） */
  start: 'openStartMenu',
  l3: null,
  r3: 'dropStack',
  dpadUp: null,
  dpadDown: 'drop',
  dpadLeft: 'openLog',
  dpadRight: null,
};

export function detectMappingKind(pad: Pick<Gamepad, 'id' | 'mapping'>): MappingKind {
  if (pad.mapping === 'standard') return 'standard';
  const id = pad.id.toLowerCase();
  if (
    id.includes('pro controller') ||
    id.includes('057e') ||
    id.includes('2009') ||
    id.includes('switch') ||
    id.includes('wireless gamepad') ||
    id.includes('joy-con')
  ) {
    return 'switch';
  }
  return 'fallback';
}

export function faceTable(kind: MappingKind): Readonly<Record<number, PadFace>> {
  if (kind === 'standard') return STANDARD_FACE;
  if (kind === 'switch') return SWITCH_FACE;
  return STANDARD_FACE; // 予備でも番号が近いことが多い。暴発は binds で抑える
}

/** スティック軸: standard は 0/1 左、2/3 右。Switch 非 standard も同じことが多い */
export function axisLayout(_kind: MappingKind): { lx: number; ly: number; rx: number; ry: number } {
  return { lx: 0, ly: 1, rx: 2, ry: 3 };
}

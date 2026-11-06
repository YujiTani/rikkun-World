import type { PadFace } from '../../input/gamepad/mapping';

/** Switch の位置の文字（絵はゲームの色。他作品の絵は使わない） */
const SWITCH_NAME: Record<PadFace, string> = {
  faceBottom: 'B',
  faceRight: 'A',
  faceLeft: 'Y',
  faceTop: 'X',
  l1: 'L',
  r1: 'R',
  l2: 'ZL',
  r2: 'ZR',
  select: '−',
  start: '＋',
  l3: 'L3',
  r3: 'R3',
  dpadUp: '↑',
  dpadDown: '↓',
  dpadLeft: '←',
  dpadRight: '→',
};

export function glyphHtml(face: PadFace): string {
  const name = SWITCH_NAME[face];
  return `<span class="gp-g gp-g-${face}" data-face="${face}">${name}</span>`;
}

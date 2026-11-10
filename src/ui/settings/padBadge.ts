/** 札の右がわの、ボタンの小さな印。ローマ字（ZR・L・A・B など）はそのまま */
import type { PadFace } from '../../input/gamepad/mapping';

/** 面の 名前 → ボタンの 字（札の 絵と、アクションヒントの 肩ボタンの 絵〔ui/duoAimHud.ts〕が 使う 1 か所の 表） */
export const TEXT: Partial<Record<PadFace, string>> = {
  faceTop: 'X',
  faceLeft: 'Y',
  faceRight: 'A',
  faceBottom: 'B',
  l1: 'L',
  r1: 'R',
  l2: 'ZL',
  r2: 'ZR',
  select: '−',
  start: '＋',
  l3: 'L3',
  r3: 'R3',
};

const ARM: Partial<Record<PadFace, string>> = {
  dpadUp: 'M9 2h6v7H9z',
  dpadDown: 'M9 15h6v7H9z',
  dpadLeft: 'M2 9h7v6H2z',
  dpadRight: 'M15 9h7v6h-7z',
};

/** 十字の絵。おす場所を黄色にする。まとめて出すときは 4 方向とも黄色 */
function dpadIcon(faces: readonly PadFace[]): string {
  const on = (f: PadFace): boolean => faces.includes(f);
  const arms = (['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'] as const)
    .map((f) => `<path d="${ARM[f]}" fill="${on(f) ? '#ffc83d' : '#5a647c'}"/>`)
    .join('');
  return `<svg class="pad-badge-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h6v6H9z" fill="#5a647c"/>${arms}</svg>`;
}

/** スティックの絵（たおす） */
function stickIcon(): string {
  return (
    `<svg class="pad-badge-svg" viewBox="0 0 24 24" aria-hidden="true">` +
    `<circle cx="12" cy="12" r="10" fill="#3a4254" stroke="#aeb8d0" stroke-width="1.5"/>` +
    `<circle cx="12" cy="10" r="5" fill="#d5dbe6"/></svg>`
  );
}

export function badgeHtml(faces: readonly PadFace[], stick?: string): string {
  if (stick) return stickIcon();
  const dpad = faces.filter((f) => f in ARM);
  const out: string[] = [];
  if (dpad.length > 0) out.push(dpadIcon(dpad));
  for (const f of faces) {
    const t = TEXT[f];
    if (t) out.push(`<i class="pad-badge pad-b-${f.startsWith('face') ? f : 'key'}">${t}</i>`);
  }
  return out.join('');
}

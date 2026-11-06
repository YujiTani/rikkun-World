/**
 * オリジナルの Switch 風コントローラー。
 * 本体は 1 つの持ち手。ボタンの位置だけ Switch（B 下・A 右・Y 左・X 上）。
 * ボタンのまとまりは細い四角でかこむ（線は padScreen がその四角から引く）。
 * 他社のロゴ・写真・配置図の写しは使わない。
 */
import { PAD_CENTER, PAD_GROUPS, PAD_VIEW_H } from './padGroups';

/** 面ボタンの色。白い字で 4.5 以上の比になる濃さ（Y だけ黒い字） */
const FACE_COLORS = { faceTop: '#1f5fbf', faceLeft: '#e0b545', faceRight: '#1b7f3a', faceBottom: '#c62828' } as const;

function text(x: number, y: number, s: string, size: number): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${size}">${s}</text>`;
}

/** 図。data-pad-face は論理ボタン、data-pad-box はまとまりの四角 */
export function padSvg(): string {
  const boxes = PAD_GROUPS.map(
    (g) =>
      `<rect class="pad-box" data-pad-box="${g.id}" x="${g.box.x}" y="${g.box.y}" width="${g.box.w}" height="${g.box.h}" rx="8"/>`,
  ).join('');
  return (
    `<svg class="pad-svg" viewBox="0 0 720 ${PAD_VIEW_H}" role="img" aria-label="コントローラー">` +
    `<defs>` +
    `<linearGradient id="rkPadBody" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#f4f7fb"/><stop offset="0.55" stop-color="#d5dce8"/><stop offset="1" stop-color="#aeb8c9"/>` +
    `</linearGradient>` +
    `<linearGradient id="rkPadWell" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#1c2230"/><stop offset="1" stop-color="#3a4254"/>` +
    `</linearGradient>` +
    `<radialGradient id="rkStick" cx="35%" cy="32%" r="70%">` +
    `<stop offset="0" stop-color="#d5dbe6"/><stop offset="1" stop-color="#667084"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<g transform="scale(1 ${PAD_VIEW_H / 460})"><path fill="url(#rkPadBody)" d="` +
    `M250 150 C190 142 155 162 140 196 C100 214 78 260 90 330 C102 392 160 438 236 428 ` +
    `C270 422 286 398 314 384 C340 372 380 372 406 384 C434 398 450 422 484 428 ` +
    `C560 438 618 392 630 330 C642 260 620 214 580 196 C565 162 530 142 470 150 ` +
    `C420 132 300 132 250 150 Z"/>` +
    `<ellipse cx="360" cy="168" rx="150" ry="28" fill="#ffffff" opacity="0.28"/></g>` +
    `<g class="pad-part" data-pad-face="l2">${pill(150, C.shoulder - 45, 140, 34, 'ZL', 26)}</g>` +
    `<g class="pad-part" data-pad-face="l1">${pill(168, C.shoulder + 11, 116, 32, 'L', 26)}</g>` +
    `<g class="pad-part" data-pad-face="r2">${pill(430, C.shoulder - 45, 140, 34, 'ZR', 26)}</g>` +
    `<g class="pad-part" data-pad-face="r1">${pill(436, C.shoulder + 11, 116, 32, 'R', 26)}</g>` +
    `<g class="pad-part" data-pad-face="select">${pill(250, C.mid - 14, 64, 28, '−', 28)}</g>` +
    `<g class="pad-part" data-pad-face="start">${pill(400, C.mid - 14, 64, 28, '＋', 28)}</g>` +
    stick('stickL', 'l3', 190, C.stickL, 38) +
    dpad(200, C.dpad) +
    face('faceTop', 556, C.abxy - 44, 'X') +
    face('faceLeft', 512, C.abxy, 'Y') +
    face('faceRight', 600, C.abxy, 'A') +
    face('faceBottom', 556, C.abxy + 44, 'B') +
    stick('stickR', 'r3', 520, C.stickR, 36) +
    boxes +
    `</svg>`
  );
}

const C = PAD_CENTER;

function pill(x: number, y: number, w: number, h: number, label: string, size: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#2c3344"/>${text(x + w / 2, y + h / 2 + 1, label, size)}`;
}

/** スティック。押しこみ（l3・r3）もこの絵の上 */
function stick(id: string, press: string, cx: number, cy: number, r: number): string {
  return (
    `<g class="pad-part" data-pad-face="${id}"><g data-pad-face="${press}" class="pad-part">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rkPadWell)"/>` +
    `<circle cx="${cx}" cy="${cy - 5}" r="${r * 0.46}" fill="url(#rkStick)"/>` +
    `</g></g>`
  );
}

function face(id: keyof typeof FACE_COLORS, cx: number, cy: number, letter: string): string {
  const ink = id === 'faceLeft' ? '#141414' : '#fff';
  return (
    `<g class="pad-part" data-pad-face="${id}">` +
    `<circle cx="${cx}" cy="${cy}" r="22" fill="${FACE_COLORS[id]}"/>` +
    `<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="middle" font-size="26" fill="${ink}">${letter}</text>` +
    `</g>`
  );
}

function dpad(cx: number, cy: number): string {
  const arm = (id: string, x: number, y: number, w: number, h: number, label: string) =>
    `<g class="pad-part" data-pad-face="${id}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#2c3344"/>` +
    text(x + w / 2, y + h / 2 + 1, label, 24) +
    `</g>`;
  return (
    `<rect x="${cx - 18}" y="${cy - 18}" width="36" height="36" rx="6" fill="#2c3344"/>` +
    arm('dpadUp', cx - 18, cy - 58, 36, 40, '↑') +
    arm('dpadDown', cx - 18, cy + 18, 36, 40, '↓') +
    arm('dpadLeft', cx - 58, cy - 18, 40, 36, '←') +
    arm('dpadRight', cx + 18, cy - 18, 40, 36, '→')
  );
}

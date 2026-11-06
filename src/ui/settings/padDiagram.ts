/**
 * オリジナルの Switch 風コントローラー。
 * 本体は 1 つの持ち手。ボタンの位置だけ Switch（B 下・A 右・Y 左・X 上）。
 * 他社のロゴ・写真・配置図の写しは使わない。
 */

function text(x: number, y: number, s: string, size = 16): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${size}">${s}</text>`;
}

function dot(id: string, x: number, y: number): string {
  return `<circle class="pad-dot" data-pad-dot="${id}" cx="${x}" cy="${y}" r="3" fill="none"/>`;
}

/** 図。data-pad-face は論理ボタン */
export function padSvg(): string {
  return (
    `<svg class="pad-svg" viewBox="0 0 720 460" role="img" aria-label="コントローラー">` +
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
    `<path fill="url(#rkPadBody)" d="` +
    `M250 150 C190 142 155 162 140 196 C100 214 78 260 90 330 C102 392 160 438 236 428 ` +
    `C270 422 286 398 314 384 C340 372 380 372 406 384 C434 398 450 422 484 428 ` +
    `C560 438 618 392 630 330 C642 260 620 214 580 196 C565 162 530 142 470 150 ` +
    `C420 132 300 132 250 150 Z"/>` +
    `<ellipse cx="360" cy="168" rx="150" ry="28" fill="#ffffff" opacity="0.28"/>` +
    `<g class="pad-part" data-pad-face="l2">${pill(150, 48, 140, 34, 'ZL')}${dot('l2', 150, 65)}</g>` +
    `<g class="pad-part" data-pad-face="l1">${pill(168, 108, 116, 30, 'L')}${dot('l1', 168, 123)}</g>` +
    `<g class="pad-part" data-pad-face="r2">${pill(430, 48, 140, 34, 'ZR')}${dot('r2', 570, 65)}</g>` +
    `<g class="pad-part" data-pad-face="r1">${pill(436, 108, 116, 30, 'R')}${dot('r1', 552, 123)}</g>` +
    `<g class="pad-part" data-pad-face="select">${pill(250, 158, 64, 32, '−', 20)}${dot('select', 250, 174)}</g>` +
    `<g class="pad-part" data-pad-face="start">${pill(406, 158, 64, 32, '＋', 20)}${dot('start', 470, 174)}</g>` +
    `<g class="pad-part" data-pad-face="stickL">` +
    `<circle cx="248" cy="248" r="40" fill="url(#rkPadWell)"/>` +
    `<circle cx="248" cy="242" r="18" fill="url(#rkStick)"/>` +
    `${dot('stickL', 196, 248)}` +
    `</g>` +
    dpad(230, 355) +
    face('faceTop', 530, 200, 'X', '#4aa3e8') +
    face('faceLeft', 488, 248, 'Y', '#e6c15a', '#1a1a1a') +
    face('faceRight', 572, 248, 'A', '#3cba6a') +
    face('faceBottom', 530, 296, 'B', '#e25b55') +
    `<g class="pad-part" data-pad-face="stickR">` +
    `<circle cx="500" cy="368" r="36" fill="url(#rkPadWell)"/>` +
    `<circle cx="500" cy="362" r="17" fill="url(#rkStick)"/>` +
    `${dot('stickR', 548, 368)}` +
    `</g>` +
    `<g class="pad-part" data-pad-face="r3">${dot('r3', 500, 400)}</g>` +
    `</svg>`
  );
}

function pill(x: number, y: number, w: number, h: number, label: string, size = 16): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#2c3344"/>${text(cx, cy, label, size)}`;
}

function face(id: string, cx: number, cy: number, letter: string, fill: string, ink = '#fff'): string {
  const dotX = cx > 470 ? cx + 22 : cx - 22;
  return (
    `<g class="pad-part" data-pad-face="${id}">` +
    `<circle cx="${cx}" cy="${cy}" r="22" fill="${fill}"/>` +
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="18" fill="${ink}">${letter}</text>` +
    dot(id, dotX, cy) +
    `</g>`
  );
}

function dpad(cx: number, cy: number): string {
  const arm = (id: string, x: number, y: number, w: number, h: number, label: string, dx: number, dy: number) =>
    `<g class="pad-part" data-pad-face="${id}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#2c3344"/>` +
    text(x + w / 2, y + h / 2, label, 18) +
    dot(id, dx, dy) +
    `</g>`;
  return (
    `<rect x="${cx - 18}" y="${cy - 18}" width="36" height="36" rx="6" fill="#2c3344"/>` +
    arm('dpadUp', cx - 18, cy - 58, 36, 40, '↑', cx, cy - 58) +
    arm('dpadDown', cx - 18, cy + 18, 36, 40, '↓', cx, cy + 58) +
    arm('dpadLeft', cx - 58, cy - 18, 40, 36, '←', cx - 58, cy) +
    arm('dpadRight', cx + 18, cy - 18, 40, 36, '→', cx + 58, cy)
  );
}

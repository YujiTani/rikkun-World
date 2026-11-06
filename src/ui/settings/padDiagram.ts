/**
 * 自分で描いた Switch 風のコントローラー。
 * 他のゲームの絵・ロゴ・配置の写しは使わない。文字の位置だけ Switch（B が下、A が右、Y が左、X が上）。
 */

function face(id: string, cx: number, cy: number, letter: string, fill: string): string {
  return (
    `<g class="pad-part" data-pad-face="${id}">` +
    `<circle cx="${cx}" cy="${cy}" r="16" fill="${fill}"/>` +
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">${letter}</text>` +
    `<circle class="pad-dot" data-pad-dot="${id}" cx="${cx > 210 ? cx + 16 : cx - 16}" cy="${cy}" r="2" fill="none"/>` +
    `</g>`
  );
}

function shoulder(id: string, x: number, y: number, w: number, label: string, dotX: number): string {
  const cx = x + w / 2;
  const cy = y + 11;
  return (
    `<g class="pad-part" data-pad-face="${id}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="22" rx="8" fill="#3a4154"/>` +
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
    `<circle class="pad-dot" data-pad-dot="${id}" cx="${dotX}" cy="${cy}" r="2" fill="none"/>` +
    `</g>`
  );
}

function dpadKey(id: string, x: number, y: number, w: number, h: number, label: string): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    `<g class="pad-part" data-pad-face="${id}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#2c3140"/>` +
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
    `<circle class="pad-dot" data-pad-dot="${id}" cx="${x < 140 ? x : x + w}" cy="${cy}" r="2" fill="none"/>` +
    `</g>`
  );
}

/** 図の SVG。data-pad-face は論理ボタン */
export function padSvg(): string {
  return (
    `<svg class="pad-svg" viewBox="0 0 420 260" role="img" aria-label="コントローラー">` +
    `<rect class="pad-shell" x="86" y="52" width="248" height="128" rx="56"/>` +
    `<rect class="pad-grip" x="36" y="108" width="72" height="112" rx="30"/>` +
    `<rect class="pad-grip" x="312" y="108" width="72" height="112" rx="30"/>` +
    shoulder('l2', 46, 16, 92, 'ZL', 46) +
    shoulder('l1', 58, 40, 78, 'L', 58) +
    shoulder('r2', 282, 16, 92, 'ZR', 374) +
    shoulder('r1', 284, 40, 78, 'R', 362) +
    `<g class="pad-part" data-pad-face="select">` +
    `<circle cx="168" cy="86" r="13" fill="#3a4154"/>` +
    `<text x="168" y="86" text-anchor="middle" dominant-baseline="middle">−</text>` +
    `<circle class="pad-dot" data-pad-dot="select" cx="168" cy="73" r="2" fill="none"/>` +
    `</g>` +
    `<g class="pad-part" data-pad-face="start">` +
    `<circle cx="252" cy="86" r="13" fill="#3a4154"/>` +
    `<text x="252" y="86" text-anchor="middle" dominant-baseline="middle">＋</text>` +
    `<circle class="pad-dot" data-pad-dot="start" cx="252" cy="73" r="2" fill="none"/>` +
    `</g>` +
    `<g class="pad-part" data-pad-face="stickL">` +
    `<circle cx="132" cy="118" r="26" fill="#2c3140"/>` +
    `<circle cx="132" cy="118" r="12" fill="#6d7588"/>` +
    `<circle class="pad-dot" data-pad-dot="stickL" cx="106" cy="118" r="2" fill="none"/>` +
    `</g>` +
    `<g class="pad-part" data-pad-face="l3">` +
    `<circle class="pad-dot" data-pad-dot="l3" cx="132" cy="118" r="3" fill="none"/>` +
    `</g>` +
    dpadKey('dpadUp', 108, 156, 22, 16, '↑') +
    dpadKey('dpadDown', 108, 192, 22, 16, '↓') +
    dpadKey('dpadLeft', 86, 172, 22, 20, '←') +
    dpadKey('dpadRight', 130, 172, 22, 20, '→') +
    face('faceTop', 286, 100, 'X', '#3d7fe0') +
    face('faceLeft', 260, 126, 'Y', '#e0b545') +
    face('faceRight', 312, 126, 'A', '#3cba54') +
    face('faceBottom', 286, 152, 'B', '#e23b3b') +
    `<g class="pad-part" data-pad-face="stickR">` +
    `<circle cx="250" cy="188" r="24" fill="#2c3140"/>` +
    `<circle cx="250" cy="188" r="11" fill="#6d7588"/>` +
    `<circle class="pad-dot" data-pad-dot="stickR" cx="274" cy="188" r="2" fill="none"/>` +
    `</g>` +
    `<g class="pad-part" data-pad-face="r3">` +
    `<circle class="pad-dot" data-pad-dot="r3" cx="250" cy="188" r="3" fill="none"/>` +
    `</g>` +
    `</svg>`
  );
}

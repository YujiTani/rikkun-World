import type { Rgba } from '../world/blocks/textures';

/**
 * BAL（#113 ART-BAL）二つ名アイコン 3 種と おの 3 本の ドット絵 16x16（DESIGN 13.3・13.4）。
 * y = 0 が上。色は DESIGN 13 章の表の色だけ。つなぎこみは開発（#115）。
 */
export type NickTier = 'oyabun' | 'taisho' | 'nushi';
export type AxeItem = 'wood_axe' | 'stone_axe' | 'iron_axe';

const S = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const OUTLINE = 0x2a1e14;
const INK = 0x10141f;
const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

function blank(): Rgba[] {
  return new Array<Rgba>(S * S).fill(CLEAR);
}
function put(p: Rgba[], x: number, y: number, c: number): void {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  p[y * S + x] = hex(c);
}
function stamp(p: Rgba[], rows: string[], ox: number, oy: number, pal: Record<string, number>): void {
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      const c = pal[ch];
      if (c !== undefined) put(p, ox + x, oy + y, c);
    }),
  );
}
/** まわり 1 ドット（たて・よこ 4 方向）を ふちどる */
function outline(p: Rgba[], color: number): void {
  const src = p.slice();
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && src[y * S + x]![3] > 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (on(x, y)) continue;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) put(p, x, y, color);
    }
}

// ---------------- 二つ名アイコン ----------------
const STAR1 = [
  '.....KK.....',
  '....KYYK....',
  '....KYYK....',
  '.KKKYYYYKKK.',
  'KYYYYLYYYYYK',
  '.KYYYLYYYYK.',
  '..KYYYYYYK..',
  '..KYYYYYYK..',
  '.KYYYKKYYYK.',
  '.KYYK..KYYK.',
  '.KKK....KKK.',
];
const STAR_S = [
  '...K...',
  '..KYK..',
  'KKKLKKK',
  'KYYYYYK',
  '.KYYYK.',
  '.KYKYK.',
  '.KK.KK.',
];
const CROWN = [
  '.K...KK...K.',
  'KYK.KYYK.KYK',
  'KYK.KYYK.KYK',
  'KYYKYYYYKYYK',
  'KYYYYYYYYYYK',
  'KYYYYBBYYYYK',
  'KYYYYBBYYYYK',
  'KLLLLLLLLLLK',
  'KYYYYYYYYYYK',
  '.KKKKKKKKKK.',
];
const GOLD = { K: INK, Y: 0xffd23f, L: 0xfff3a0, B: 0x5fd3ff };
/** 内の ふちの色 = めずらしさ の色（緑・青・紫） */
export const NICK_RING: Record<NickTier, number> = { oyabun: 0x8fe08f, taisho: 0x7fb8ff, nushi: 0xc79bff };

/** 二つ名の 丸いバッジ（おやぶん = 星 1・たいしょう = 星 2・ヌシ = かんむり）。16x16 = 256 ドット */
export function nickIconPixels(tier: NickTier): Rgba[] {
  const p = blank();
  const ring = NICK_RING[tier];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (r > 8.1) continue;
      put(p, x, y, r > 7.1 ? INK : r > 5.9 ? ring : 0x252f47);
    }
  if (tier === 'oyabun') stamp(p, STAR1, 2, 3, GOLD);
  if (tier === 'taisho') {
    stamp(p, STAR_S, 1, 2, GOLD);
    stamp(p, STAR_S, 8, 7, GOLD);
  }
  if (tier === 'nushi') stamp(p, CROWN, 2, 3, GOLD);
  return p;
}

// ---------------- おの（かた刃） ----------------
/** 刃 / かげ / 刃先 */
export const AXE_COLORS: Record<AxeItem, { head: number; shade: number; edge: number }> = {
  wood_axe: { head: 0xc99860, shade: 0x9a6a3a, edge: 0xecc890 },
  stone_axe: { head: 0x8a8a8a, shade: 0x666666, edge: 0xbdbdbd },
  iron_axe: { head: 0xe0e0e8, shade: 0xa8a8b4, edge: 0xffffff },
};
const HANDLE = 0x8a5a2e;
const HANDLE_D = 0x5a3a1a;
const R2 = Math.SQRT2;

/** ななめの え（左下 → 右上）の 上に 片側だけの 大きな 刃（右下へ ひろがる）と 小さな みね */
export function axeItemPixels(item: AxeItem): Rgba[] {
  const p = blank();
  const c = AXE_COLORS[item];
  const b0 = (1.5 + 14.5) / R2;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const a = (x + 0.5 - (y + 0.5)) / R2; // え の むき
      const b = (x + 0.5 + (y + 0.5)) / R2; // 横（右下が +）
      if (Math.abs(b - b0) <= 0.75 && a >= -8.8 && a <= 4.3) put(p, x, y, b < b0 ? HANDLE : HANDLE_D);
      const ac = 2.4;
      const db = b - b0;
      if (db >= 0.75 && db <= 5.6) {
        const hw = 1.4 + 0.42 * db;
        if (Math.abs(a - ac) <= hw) put(p, x, y, db > 4.5 ? c.edge : a < ac - hw + 1.1 ? c.shade : c.head);
      }
      if (db <= -0.75 && db >= -2.3 && Math.abs(a - ac) <= 1.0) put(p, x, y, c.shade);
    }
  outline(p, OUTLINE);
  return p;
}

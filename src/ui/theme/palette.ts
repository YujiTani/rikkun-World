/**
 * §3.5 (2) の色の表（tokens.css と同じ値。tokens.test.ts でそろっているか確かめる）。
 * DOM しらべ（e2e/helpers/uiRules.ts）が「使ってよい色」として読む。
 */

export interface PaletteColor {
  /** CSS 変数の名前（先頭の -- つき） */
  name: string;
  rgb: [number, number, number];
}

import { RARITY_TIERS } from '../../drops/rarityTable';

/** --rk-rarity-0〜6（めずらしさの表 RARITY_TIERS から作る） */
const RARITY_PALETTE: Record<string, string> = Object.fromEntries(
  RARITY_TIERS.map((t) => [t.cssVar, `#${t.color.toString(16).padStart(6, '0')}`]),
);

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** `:root` に ぜんぶ なければならない変数 → 値（色は #rrggbb。不透明度つきのものは 元の色） */
export const PALETTE_HEX: Readonly<Record<string, string>> = {
  '--rk-bg-900': '#10141f',
  '--rk-bg-800': '#1a2132',
  '--rk-bg-700': '#252f47',
  '--rk-line': '#3a4766',
  '--rk-hud-bg': '#10141f',
  '--rk-scrim': '#000000',
  '--rk-text': '#ffffff',
  '--rk-text-sub': '#aeb8d0',
  '--rk-ink': '#141414',
  '--rk-accent': '#ffc83d',
  '--rk-accent-2': '#ff8a1f',
  '--rk-ok': '#3ddc84',
  '--rk-ng': '#ff5a5f',
  '--rk-info': '#4fc3f7',
  '--rk-heart': '#ff3d6e',
  '--rk-xp': '#9bf26b',
  '--rk-xp-2': '#28c76f',
  '--rk-shu': '#e8453c',
  '--rk-kiri': '#d2b07e',
  '--rk-kurogane': '#1f1f24',
  ...RARITY_PALETTE,
  '--rk-cat-soil': '#6e4b2a',
  '--rk-cat-stone': '#505a68',
  '--rk-cat-plant': '#2e6b35',
  '--rk-cat-ore': '#7a6220',
  '--rk-cat-build': '#8a3b2a',
  '--rk-cat-material': '#6b3f7a',
  '--rk-cat-metal': '#1e6e78',
  '--rk-cat-tool': '#2a5c99',
  '--rk-cat-weapon': '#9a2e4a',
  '--rk-cat-armor': '#46489e',
  '--rk-cat-light': '#a3561a',
  '--rk-cat-home': '#2e7a5e',
  '--rk-cat-food': '#8e3d73',
  '--rk-medal-bronze': '#cd7f32',
  '--rk-medal-silver': '#c0c0c0',
  '--rk-medal-gold': '#ffd54f',
};

/** にじ色の止まり（メダル） */
export const RAINBOW_HEX = ['#ff5a5f', '#ffc83d', '#3ddc84', '#4fc3f7', '#c79bff'] as const;

/** CSS 変数のうち 数・動きの名前（`:root` に あるべきもの） */
export const SCALE_VARS = [
  '--rk-fs-display',
  '--rk-fs-title',
  '--rk-fs-head',
  '--rk-fs-body',
  '--rk-fs-small',
  '--rk-sp-1',
  '--rk-sp-2',
  '--rk-sp-3',
  '--rk-sp-4',
  '--rk-sp-5',
  '--rk-sp-6',
  '--rk-sp-7',
  '--rk-r-s',
  '--rk-r-m',
  '--rk-r-l',
  '--rk-r-pill',
  '--rk-shadow-1',
  '--rk-shadow-2',
  '--rk-glow',
  '--rk-h-btn',
  '--rk-h-tab-guide',
  '--rk-slot-hotbar',
  '--rk-slot-inv',
  '--rk-slot-tansu',
  '--rk-ease',
  '--rk-ease-pop',
  '--rk-dur-fast',
  '--rk-dur',
  '--rk-dur-pop',
  '--rk-dur-slow',
  '--rk-dur-wave',
] as const;

export const ALL_RK_VARS: readonly string[] = [...Object.keys(PALETTE_HEX), ...SCALE_VARS];

/** 3D の 本（BOOK-1 案 C「まほうの ずかん」）だけの 木・金・紙の 色。本の 外では 使わない */
export const BOOK_HEX = ['#7a4c22', '#e0b545', '#efe2c4', '#fbfaf5', '#fffdf7', '#3a2614', '#a8743f', '#7fe3d4', '#2bb3a0', '#fff3cf'] as const;

/** 使ってよい色（不透明度ちがいは同じ色。白・黒は 文字と 影の色としても入る） */
export const ALLOWED_COLORS: readonly PaletteColor[] = [
  ...Object.entries(PALETTE_HEX).map(([name, h]) => ({ name, rgb: hex(h) })),
  ...RAINBOW_HEX.map((h) => ({ name: 'rainbow', rgb: hex(h) })),
  ...BOOK_HEX.map((h) => ({ name: 'book', rgb: hex(h) })),
];

/** 段階（§3.5 (3)(4)） */
export const FONT_SIZES_PX = [16, 20, 24, 32, 48] as const;
export const SPACING_PX = [0, 4, 8, 12, 16, 24, 32, 48] as const;
export const RADII_PX = [0, 8, 14, 24, 999] as const;

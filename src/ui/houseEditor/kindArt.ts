// HOUSE-2A（#364）しゅるいの ボタン・ばしょの ボタンの 絵（SVG の 文字列。40×40 の 小さな 絵）。
// 仮（HOUSE-2B で かえる）: アートの 3 案（むら・おしろ・こうざん）の 絵が できる まで、形と 色の 組みあわせで 見分けられる 仮の 絵。
//   形の ちがい ＝ むら（なめらか）・おしろ（そりかえる ＋ くろい おび）・こうざん（かいだん ＋ てつの おびと びょう）。
//   「なし」は うすい 点線の わく（✕・赤い 斜線は 使わない。仕様 §2.3）。たいらの やねは 専用の 絵（仕様 §3.4）。
// 色は 見本の 家と 同じ 気分の 仮の 色。UI の 色の きまり（トークン）には SVG の 中身は 入らない。
import type { Part, Style } from '../../house/recipes/kinds';
import { splitKind } from '../../house/recipes/kinds';
import { ICONS } from './icons';

/** 仮の 色（絵 ぜんぶで この 表を つかう） */
const C = {
  line: '#2E2620', wood: '#C8923F', woodL: '#E0B56A', woodD: '#8A5A2B', tile: '#4A5A78', straw: '#D9B84A', gold: '#F2C230',
  white: '#F2EEDC', brick: '#B5523C', stone: '#8A9099', iron: '#5A6068', paper: '#FFFDF2', crystal: '#8FD8F2', crystalD: '#4FA9CC',
  red: '#C23B2E', blue: '#3A5A9A', green: '#4E7A5A', leaf: '#3FA15A', glow: '#7FE3D4', pink: '#F29BB0',
} as const;

let uid = 0;
const svg = (body: string): string => `<svg class="ed-art" viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;
/** 輪郭つきの 図形（くっきりした ふち） */
const shape = (tag: string, attrs: string, fill: string, sw = 2): string => `<${tag} ${attrs} fill="${fill}" stroke="${C.line}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const lines = (d: string, color: string = C.line, op = 0.45, sw = 1.6): string => `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${sw}" stroke-linecap="round"/>`;
/** 中だけに 描く（clipPath の id は 1 つずつ ちがう） */
function clipped(pathD: string): { def: string; open: string; close: string } {
  const id = `ka${uid++}`;
  return { def: `<clipPath id="${id}"><path d="${pathD}"/></clipPath>`, open: `<g clip-path="url(#${id})">`, close: '</g>' };
}
/** 「なし」の 点線の わく（その ばしょの かたちを うすく） */
const dashed = (tag: string, attrs: string): string =>
  `<${tag} ${attrs} fill="none" stroke="currentColor" stroke-width="2.6" stroke-dasharray="4 4" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`;

// ---------------------------------------------------------------- やね

const ROOF_BODY: Readonly<Record<string, string>> = { sankaku: C.wood, kawara: C.tile, wara: C.straw, kin: C.gold };
/** やねの 形（案ごと）。むら ＝ なめらかな さんかく、おしろ ＝ そりかえる、こうざん ＝ かいだん */
const ROOF_PATH: Readonly<Record<Style, string>> = {
  mura: 'M3 31 L20 9 L37 31 Z',
  shiro: 'M1 33 Q15 31 20 9 Q25 31 39 33 Z',
  kozan: 'M4 32 V26 H10 V20 H16 V14 H24 V20 H30 V26 H36 V32 Z',
};
/** 形ごとの もよう（案の 形の 中だけに 描く） */
const ROOF_TEXTURE: Readonly<Record<string, string>> = {
  sankaku: 'M13 12v24M20 8v28M27 12v24',
  kawara: 'M0 17h40M0 23h40M0 29h40M10 17v6M18 23v6M26 17v6M14 29v4',
  wara: 'M8 14l-3 20M14 12l-3 22M20 10l-3 24M26 12l-3 22M32 14l-3 22',
  kin: 'M10 30L24 12M16 32L30 16',
};

/** もようの 色（きんだけ 白い すじで つやを 出す。ほかは くろい すじ） */
const ROOF_INK: Readonly<Record<string, { color: string; op: number }>> = { kin: { color: C.paper, op: 0.7 } };

function roof(kind: string): string {
  if (kind === 'none') return svg(dashed('path', `d="${ROOF_PATH.mura}"`));
  if (kind === 'flat') {
    // たいら: ななめ上から 見た 平らな いた（専用の 絵）
    return svg(
      `${shape('path', 'd="M3 18 L20 10 L37 18 L20 26 Z"', C.woodL)}${shape('path', 'd="M3 18 L20 26 V33 L3 25 Z"', C.wood)}${shape('path', 'd="M37 18 L20 26 V33 L37 25 Z"', C.woodD)}${lines('M9 18 L20 12.5 M14 20.5 L25 15', C.line, 0.3)}`,
    );
  }
  const { form, style } = splitKind(kind);
  const st = style ?? 'mura';
  const d = ROOF_PATH[st];
  const c = clipped(d);
  const fill = ROOF_BODY[form] ?? C.wood;
  const ink = ROOF_INK[form] ?? { color: C.line, op: 0.4 };
  const tex = lines(ROOF_TEXTURE[form] ?? '', ink.color, ink.op);
  // おしろ: むねに おにがわら（きんの まる）。こうざん: 段の ふちに てつの びょう
  const extra = st === 'shiro' ? `<circle cx="20" cy="9" r="3" fill="${C.gold}" stroke="${C.line}" stroke-width="1.6"/>` : st === 'kozan' ? `<circle cx="9" cy="26" r="1.6" fill="${C.iron}"/><circle cx="35" cy="26" r="1.6" fill="${C.iron}"/><circle cx="20" cy="14" r="1.6" fill="${C.iron}"/>` : '';
  return svg(`${c.def}${shape('path', `d="${d}"`, fill)}${c.open}${tex}${c.close}${extra}`);
}

// ---------------------------------------------------------------- かべ

const WALL_BODY: Readonly<Record<string, string>> = { ki: C.wood, shikkui: C.white, renga: C.brick, ishi: C.stone };
const WALL_TEXTURE: Readonly<Record<string, string>> = {
  ki: 'M5 14H35M5 21H35M5 28H35',
  shikkui: 'M9 12l4 3M27 30l4 3',
  renga: 'M5 14H35M5 21H35M5 28H35M13 7v7M27 14v7M13 21v7M27 28v7',
  ishi: 'M5 15H35M5 26H35M16 7v8M28 15v11M12 26v9',
};

function wall(kind: string): string {
  if (kind === 'none') return svg(dashed('rect', 'x="6" y="8" width="28" height="26" rx="3"'));
  const { form, style } = splitKind(kind);
  const body = shape('rect', 'x="5" y="7" width="30" height="28" rx="1.5"', WALL_BODY[form] ?? C.wood);
  const tex = lines(WALL_TEXTURE[form] ?? '', C.line, 0.4);
  // おしろ: くろい おび。こうざん: てつの おびと びょう
  const extra =
    style === 'shiro'
      ? `<rect x="5" y="18" width="30" height="6" fill="${C.line}"/>`
      : style === 'kozan'
        ? `<rect x="5" y="7" width="5" height="28" fill="${C.iron}" stroke="${C.line}" stroke-width="1.4"/><rect x="30" y="7" width="5" height="28" fill="${C.iron}" stroke="${C.line}" stroke-width="1.4"/><circle cx="7.5" cy="12" r="1.2" fill="${C.paper}"/><circle cx="7.5" cy="30" r="1.2" fill="${C.paper}"/><circle cx="32.5" cy="12" r="1.2" fill="${C.paper}"/><circle cx="32.5" cy="30" r="1.2" fill="${C.paper}"/>`
        : '';
  return svg(`${body}${tex}${extra}`);
}

// ---------------------------------------------------------------- まど

const FRAME: Readonly<Record<Style | 'usual', string>> = { usual: C.woodD, mura: C.woodD, shiro: C.line, kozan: C.iron };

function windowArt(kind: string): string {
  if (kind === 'none') return svg(dashed('rect', 'x="8" y="8" width="24" height="24" rx="3"'));
  const { form, style } = splitKind(kind);
  const frame = FRAME[style ?? 'usual'];
  const accent = style === 'shiro' ? `<rect x="6" y="6" width="6" height="6" fill="${C.red}"/><rect x="28" y="6" width="6" height="6" fill="${C.red}"/>` : style === 'kozan' ? `<circle cx="8.5" cy="8.5" r="1.3" fill="${C.paper}"/><circle cx="31.5" cy="8.5" r="1.3" fill="${C.paper}"/><circle cx="8.5" cy="31.5" r="1.3" fill="${C.paper}"/><circle cx="31.5" cy="31.5" r="1.3" fill="${C.paper}"/>` : '';
  if (form === 'suisho') {
    return svg(`${shape('rect', `x="6" y="6" width="28" height="28" rx="2"`, frame)}${shape('path', 'd="M20 9 L29 16 L25 31 H15 L11 16 Z"', C.crystal, 1.6)}${lines('M20 9 L17 31 M20 9 L23 31 M11 16 H29', C.crystalD, 0.9, 1.4)}${accent}`);
  }
  if (form === 'maru') {
    return svg(`${shape('rect', `x="6" y="6" width="28" height="28" rx="2"`, frame)}${shape('circle', 'cx="20" cy="20" r="10.5"', C.paper, 1.8)}${lines('M20 9.5V30.5M9.5 20H30.5', C.woodD, 0.8, 1.6)}${accent}`);
  }
  // しょうじ（いつもの）
  return svg(`${shape('rect', 'x="6" y="5" width="28" height="30" rx="2"', frame)}<rect x="9" y="8" width="22" height="24" fill="${C.paper}"/>${lines('M16.3 8V32M23.7 8V32M9 20H31', C.woodD, 0.8, 1.6)}${accent}`);
}

// ---------------------------------------------------------------- と

function door(kind: string): string {
  const { form, style } = splitKind(kind);
  const body = form === 'tetsu' ? C.iron : '#A8702E';
  const frame = style === 'mura' ? C.woodD : C.line;
  let extra = '';
  if (style === 'shiro') extra = `<rect x="6" y="3" width="28" height="5" fill="${C.red}" stroke="${C.line}" stroke-width="1.6"/>`;
  if (style === 'kozan') extra = `<rect x="9" y="12" width="22" height="3" fill="${C.line}" opacity="0.7"/><rect x="9" y="27" width="22" height="3" fill="${C.line}" opacity="0.7"/><circle cx="12" cy="13.5" r="1.1" fill="${C.paper}"/><circle cx="28" cy="13.5" r="1.1" fill="${C.paper}"/>`;
  const ring = `<circle cx="17" cy="21" r="1.8" fill="${C.gold}" stroke="${C.line}" stroke-width="1"/><circle cx="23" cy="21" r="1.8" fill="${C.gold}" stroke="${C.line}" stroke-width="1"/>`;
  return svg(`${shape('rect', 'x="8" y="5" width="24" height="31" rx="1.5"', body)}<rect x="8" y="5" width="24" height="31" rx="1.5" fill="none" stroke="${frame}" stroke-width="3"/>${lines('M20 6V35', C.line, 0.6, 1.8)}${extra}${ring}`);
}

// ---------------------------------------------------------------- かざり

const TINT: Readonly<Record<Style, string>> = { mura: C.blue, shiro: C.red, kozan: C.green };
const FLOWER: Readonly<Record<Style, readonly [string, string]>> = { mura: [C.red, C.pink], shiro: [C.paper, C.gold], kozan: [C.glow, C.crystal] };

function deco(kind: string): string {
  const { form, style } = splitKind(kind);
  const st = style ?? 'mura';
  if (form === 'entotsu') {
    const cap = st === 'mura' ? C.woodD : st === 'shiro' ? C.line : C.iron;
    const smoke = st === 'kozan' ? '' : `<circle cx="22" cy="6" r="3" fill="${C.paper}" opacity="0.85"/>${st === 'mura' ? `<circle cx="27" cy="3.5" r="2.2" fill="${C.paper}" opacity="0.7"/>` : ''}`;
    return svg(`${smoke}${shape('rect', 'x="14" y="12" width="12" height="23" rx="1"', C.brick)}${lines('M14 18H26M14 24H26M14 30H26', C.line, 0.4)}${shape('rect', 'x="11" y="9" width="18" height="5" rx="1"', cap)}`);
  }
  if (form === 'noren') {
    const strip = (x: number, w: number): string => shape('path', `d="M${x} 10 H${x + w} V30 L${x + w / 2} 27 L${x} 30 Z"`, TINT[st], 1.6);
    return svg(`${shape('rect', 'x="4" y="6" width="32" height="5" rx="1.5"', C.woodD)}${strip(6, 7.5)}${strip(16.25, 7.5)}${strip(26.5, 7.5)}<circle cx="20" cy="17" r="2.2" fill="${C.paper}"/>`);
  }
  if (form === 'hanadan') {
    const [a, b] = FLOWER[st];
    return svg(`${lines('M12 28V20M20 28V15M28 28V21', C.leaf, 1, 2.4)}<circle cx="12" cy="18" r="3.6" fill="${a}" stroke="${C.line}" stroke-width="1.4"/><circle cx="20" cy="13" r="3.6" fill="${b}" stroke="${C.line}" stroke-width="1.4"/><circle cx="28" cy="19" r="3.6" fill="${a}" stroke="${C.line}" stroke-width="1.4"/>${shape('path', 'd="M6 26 H34 L31 36 H9 Z"', C.woodD)}`);
  }
  // しゃちほこ（きん）: さかなが そりかえる
  return svg(`${shape('path', 'd="M13 36 C4 29 6 15 17 9 L21 4 L23 11 C29 17 27 26 21 29 L25 36 Z"', C.gold)}${lines('M12 24 C14 20 18 18 21 18', C.line, 0.5, 1.6)}<circle cx="19" cy="14" r="1.6" fill="${C.line}"/>`);
}

// ---------------------------------------------------------------- あかり（② の ボタン）

const LIGHT_ART: Readonly<Record<string, string>> = {
  /** ちょうちんは 方眼の 天井の 印と 同じ 絵 */
  lantern: ICONS.lantern.replace('class="ed-ico"', 'class="ed-art"'),
  hotaru: svg(`<circle cx="20" cy="22" r="13" fill="${C.glow}" opacity="0.35"/>${shape('rect', 'x="9" y="25" width="22" height="10" rx="2"', C.stone)}${shape('path', 'd="M12 25 L14 14 H26 L28 25 Z"', C.glow)}${lines('M16 25V17M24 25V17', C.paper, 0.8, 1.6)}<circle cx="20" cy="9" r="1.8" fill="${C.glow}"/>`),
  suisho: svg(`${shape('rect', 'x="12" y="31" width="16" height="5" rx="1.5"', C.iron)}${shape('path', 'd="M20 5 L29 14 L25 31 H15 L11 14 Z"', C.crystal)}${lines('M20 5 L17 31 M20 5 L23 31 M11 14 H29', C.crystalD, 0.9, 1.4)}`),
};

// ---------------------------------------------------------------- 入り口

/** しゅるいの ボタンの 絵（part ＝ やね・かべ・まど・と・かざり。kind ＝ しゅるいの id） */
export function kindArt(part: Part, kind: string): string {
  switch (part) {
    case 'roof': return roof(kind);
    case 'wall': return wall(kind);
    case 'window': return windowArt(kind);
    case 'door': return door(kind);
    case 'deco': return deco(kind);
    default: return part satisfies never;
  }
}

/** ばしょの ボタンの 絵（一目で その ばしょと 分かる 絵。字は ボタンの 下に 別に 出す） */
export function placeArt(part: Part): string {
  switch (part) {
    case 'roof': return roof('kawara_mura');
    case 'wall': return wall('renga_mura');
    case 'window': return windowArt('shoji');
    case 'door': return door('ie');
    case 'deco': return deco('hanadan_mura');
    default: return part satisfies never;
  }
}

/** あかりの ボタンの 絵（lantern・hotaru・suisho） */
export function lightArt(kind: string): string {
  return LIGHT_ART[kind] ?? '';
}

/** 「あたらしい！」の 印（動かない 星の 形 ＋「！」。24×24。ボタンの 右上に おさめる） */
export const NEW_MARK = `<svg class="ed-newmark__svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 14.9 8.1 22 8.9 16.7 13.7 18.2 20.8 12 17.2 5.8 20.8 7.3 13.7 2 8.9 9.1 8.1Z" fill="${C.gold}" stroke="${C.line}" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.5v6" stroke="${C.line}" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="15.4" r="1.4" fill="${C.line}"/></svg>`;

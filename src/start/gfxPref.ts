// GFX-1（docs/tickets/GFX-1.md）: おもさ（4 だん）の 表と、くわしく（かげ・がめんの こまかさ・ちかくの こまかさ）の おぼえ方。
// three にも DOM にも 依らない 純粋な 決め方。おもさ自体の 保存は weightPref.ts（rikkun.weight.v1）、かげの 保存は shadowPref.ts（rikkun.shadow.v1）。
import { DEFAULT_MICRO_R, MICRO_RADII } from '../world/render/voxel/tier';

/** おもさ（保存の 値）。とても かるい ＜ かるい ＜ ふつう ＜ きれい */
export type Weight = 'xlight' | 'light' | 'normal' | 'fine';
export const WEIGHTS: readonly Weight[] = ['xlight', 'light', 'normal', 'fine'];
/** 保存が ない・読めない ときの おもさ（?nosave=1 は 'fine'。weightPref.decideWeight） */
export const DEFAULT_WEIGHT: Weight = 'light';

/** がめんの こまかさ（pixelRatio の 上限） */
export type Res = 1 | 1.5 | 2;
export const RES_CHOICES: readonly Res[] = [2, 1.5, 1];
/** 「ちかくの こまかさ」で えらべる 値（0 = 小ブロックなし）。画面の ならびは この 順 */
export const MICRO_CHOICES: readonly number[] = [0, ...MICRO_RADII];

export type RingKind = 'small' | 'full';

export interface WeightSpec {
  /** ちかくの こまかさ（小ブロックの 半径、ブロック。0 = なし） */
  microR: number;
  /** とおくまで 持つ 輪（起動の ときだけ 決まる） */
  ring: RingKind;
  /** かげを 出すか */
  shadow: boolean;
  /** がめんの こまかさの 上限（devicePixelRatio の 上限。1 = 画面の 点 1 つに 1 ドット） */
  res: Res;
}

/** おもさの 表（GFX-1 §1）。数は ここだけに 書く */
export const WEIGHT_SPEC = {
  xlight: { microR: 0, ring: 'small', shadow: false, res: 1 },
  light: { microR: 12, ring: 'small', shadow: false, res: 1.5 },
  normal: { microR: 24, ring: 'full', shadow: true, res: 2 },
  fine: { microR: DEFAULT_MICRO_R, ring: 'full', shadow: true, res: 2 },
} as const satisfies Record<Weight, WeightSpec>;

export const isWeight = (v: unknown): v is Weight => typeof v === 'string' && (WEIGHTS as readonly string[]).includes(v);
const isRes = (v: unknown): v is Res => v === 1 || v === 1.5 || v === 2;
const isMicro = (v: unknown): v is number => typeof v === 'number' && MICRO_CHOICES.includes(v);

export interface GfxStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** くわしくの 保存（がめんの こまかさ・ちかくの こまかさ）。localStorage `rikkun.gfx.v1`（JSON） */
export const GFX_STORAGE_KEY = 'rikkun.gfx.v1';
export interface GfxSaved {
  res?: Res;
  micro?: number;
}

export function readGfxSaved(store: GfxStore | null): GfxSaved {
  try {
    const raw = store?.getItem(GFX_STORAGE_KEY) ?? null;
    if (raw === null) return {};
    const o = JSON.parse(raw) as { res?: unknown; micro?: unknown } | null;
    const out: GfxSaved = {};
    if (o && isRes(o.res)) out.res = o.res;
    if (o && isMicro(o.micro)) out.micro = o.micro;
    return out;
  } catch {
    return {}; // 読めなくても 遊べる
  }
}

/** 1 つだけ 書きかえて 保存する（もう 1 つは そのまま） */
export function saveGfxPart(store: GfxStore | null, patch: GfxSaved): void {
  try {
    store?.setItem(GFX_STORAGE_KEY, JSON.stringify({ ...readGfxSaved(store), ...patch }));
  } catch {
    // 書けなくても 遊べる
  }
}

/** くわしくの 保存を 消す（おもさを 押したとき）。かげの 保存（rikkun.shadow.v1）も 消す */
export function clearGfxDetail(store: GfxStore | null, shadowKey: string): void {
  try {
    store?.removeItem?.(GFX_STORAGE_KEY);
    store?.removeItem?.(shadowKey);
  } catch {
    // 消せなくても 遊べる
  }
}

/** はじめの がめんの こまかさ: URL `?res=1|1.5|2` ＞ くわしくの 保存 ＞ おもさ */
export function decideRes(search: string, saved: GfxSaved, weight: Weight): Res {
  const raw = new URLSearchParams(search).get('res');
  if (raw !== null && raw.trim() !== '') {
    const n = Number(raw);
    if (isRes(n)) return n;
  }
  return saved.res ?? WEIGHT_SPEC[weight].res;
}

/** 輪の お知らせを 出すか: 今の 輪と、この おもさの 輪が ちがう ときだけ */
export const ringNoteNeeded = (current: RingKind, weight: Weight): boolean => WEIGHT_SPEC[weight].ring !== current;

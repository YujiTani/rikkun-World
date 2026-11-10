import { dotTileLook } from './dotTile';
import { gotsugotsuLook } from './gotsugotsu';
import { placeholderLook } from './placeholder';
import { tsumikiLook } from './tsumiki';
import { blockHash } from './common';
import { KATA_UNDER, type KataTable } from './kata';
import { LOOK_VOLUME, type Look } from './types';

export * from './types';

/**
 * 見た目の一覧。案を足すときは、ここに 1 行（import と配列の 1 つ）足すだけ。
 * ボタンは この順に並ぶ。`?look=<id>` で最初の案を選べる。先頭が いまの おすすめ（初期表示）。
 */
export const ALL_LOOKS: readonly Look[] = [placeholderLook, tsumikiLook, gotsugotsuLook, dotTileLook];

/** オーナーが選んだ見た目（2026-10-16、B ごつごつ） */
export const DEFAULT_LOOK_ID = gotsugotsuLook.id;

export function findLook(id: string | null | undefined): Look | undefined {
  return ALL_LOOKS.find((l) => l.id === id);
}

// ---- いま使っている Look（メッシュ作りは ブロック番号で引く。番号 → id は initLooks で教える）
let current: Look = gotsugotsuLook;
let ids: readonly string[] = [];
let specs: (Look['kinds'][string] | undefined)[] = [];
let version = 0;

function rebind(): void {
  specs = ids.map((id) => current.kinds[id]);
  kataK = ids.map((id) => kata[id] ?? 0);
  kataUnder = kata[KATA_UNDER] ?? 0;
  kataCache.clear();
  rebindGrains();
}

// ---- つぶ（B「とびだす つぶ」。MINE-1B #349）
/** つぶの 通し番号（全部の 種類で 数える）の 上限。mesher の 格子の 値と 頂点の 印〔5 ビット〕に 入る 数 */
export const MAX_GRAINS = 30;
/** 格子の 値: 0 = 空、GRAIN_BODY = つぶの ある 種類の 地の 石、GRAIN_FIRST + n = 通し番号 n（0 から）の つぶ */
export const GRAIN_BODY = 2;
export const GRAIN_FIRST = 3;

/** 通しの つぶ 1 色: sRGB 0〜255 と 光る 強さ */
export interface GrainColor {
  r: number;
  g: number;
  b: number;
  glow: number;
}

let grainMaps: (Uint8Array | undefined)[] = [];
let grainColors: GrainColor[] = [];

function rebindGrains(): void {
  grainMaps = [];
  grainColors = [];
  const rgb = current.palette;
  specs.forEach((s, kind) => {
    if (!s?.grains) return;
    // 色番号 → 格子の 値。つぶ では ない 色は ぜんぶ 地の 石
    const m = new Uint8Array(256).fill(GRAIN_BODY);
    m[0] = 0;
    for (const g of s.grains) {
      if (grainColors.length >= MAX_GRAINS) throw new Error(`つぶの 色が 多すぎる（${MAX_GRAINS} まで）`);
      m[g.index] = GRAIN_FIRST + grainColors.length;
      grainColors.push({ r: rgb[g.index * 3]!, g: rgb[g.index * 3 + 1]!, b: rgb[g.index * 3 + 2]!, glow: g.glow ?? 0 });
    }
    grainMaps[kind] = m;
  });
}

/** この種類の「色番号 → 格子の 値」の 表（つぶの ある 種類だけ。ない 種類は undefined） */
export function grainMapOf(kind: number): Uint8Array | undefined {
  return grainMaps[kind];
}

/** 通しの つぶの 色（番号 n の 色は n 番目）。シェーダーの 表に する */
export function grainList(): readonly GrainColor[] {
  return grainColors;
}

// ---- 型（#202）
let kata: KataTable = {};
let kataK: number[] = [];
let kataUnder = 0;
/** (種類 * 64 + 見える面) * 32 + 型の番号 → 729 マス */
const kataCache = new Map<number, Uint8Array>();

/** 型の表を決める（kata.ts の decideKata）。空の表 = 型なし（いままでどおり 毎回計算） */
export function setKataTable(t: KataTable): void {
  kata = t;
  rebind();
}

/** この種類の型の数（0 = 毎回計算） */
export function kataOf(kind: number): number {
  return kataK[kind] ?? 0;
}

/** 数え（テストと計測用）: [毎回計算（水のそば）, 型なしの種類, 型, 地下の型] */
export const kataStats = [0, 0, 0, 0];

/** 作った型の数（メモリの目安） */
export function kataCacheSize(): number {
  return kataCache.size;
}

/** blockTypes の id の並び（番号順）を渡して初期化する（Look が blockTypes に依らないように、外から渡す） */
export function initLooks(blockIds: readonly string[]): void {
  ids = blockIds;
  rebind();
}

export function currentLook(): Look {
  return current;
}

/** 切りかえた回数（キャッシュを作り直す目印） */
export function lookVersion(): number {
  return version;
}

export function setCurrentLook(id: string): Look {
  const l = findLook(id);
  if (!l) throw new Error(`知らない look: ${id}`);
  current = l;
  version++;
  rebind();
  return l;
}

export function hasLook(kind: number): boolean {
  return specs[kind] !== undefined;
}

/** 3D テクスチャで空のマスをうめる色（色番号）。形のない種類は マゼンタ代わりの 1 番 */
export function baseColorOf(kind: number): number {
  return specs[kind]?.base ?? 1;
}

/** この種類のブロックは、となりの面をかくすか（すきまのある はっぱ はかくさない） */
export function occludes(kind: number): boolean {
  const s = specs[kind];
  return s !== undefined && s.occludes !== false;
}

export function lookIdOf(kind: number): string {
  return ids[kind] ?? '?';
}

/** out（長さ LOOK_VOLUME）に色番号を書く。形のない種類は ぜんぶ 0 */
export function fillBlockLook(kind: number, bx: number, by: number, bz: number, exposed: number, out: Uint8Array): void {
  const s = specs[kind];
  if (!s) {
    out.fill(0, 0, LOOK_VOLUME);
    return;
  }
  s.fill(bx, by, bz, exposed, out);
}

/**
 * fillBlockLook の 型つき（#202）。unique = 水のそば など 毎回計算する所。under = 地下・ほらあな（地下用の数の型を使う。
 * 地下の数が 0 のときは unique の指定にしたがう）。
 * 型を使う種類は 場所のハッシュで 型の番号を選び、とっておいた型を写すだけ。
 */
export function fillBlockLookKata(kind: number, bx: number, by: number, bz: number, exposed: number, unique: boolean, out: Uint8Array, under = false): void {
  const own = kataK[kind] ?? 0;
  const useUnder = under && kataUnder > 0;
  const k = useUnder && own > 0 ? kataUnder : own;
  if (useUnder) unique = false;
  const s = specs[kind];
  kataStats[unique ? 0 : k === 0 ? 1 : under ? 3 : 2]++;
  if (unique || k === 0 || !s) {
    fillBlockLook(kind, bx, by, bz, exposed, out);
    return;
  }
  const v = blockHash(9001 + kind, bx, by, bz) % k;
  const key = ((kind << 6) | exposed) * 32 + v;
  let t = kataCache.get(key);
  if (!t) {
    t = new Uint8Array(LOOK_VOLUME);
    // 型 v は ありえない遠くの位置 (-50000 - v, -7, 0) の形（ハッシュだけで決まるので、どの型も ふつうの形の 1 つ）
    s.fill(-50000 - v, -7, 0, exposed, t);
    kataCache.set(key, t);
  }
  out.set(t);
}

/** いまの Look の色番号 → RGB */
export function paletteRgb(): Uint8Array {
  return current.palette;
}

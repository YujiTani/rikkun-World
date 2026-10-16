import { placeholderLook } from './placeholder';
import { LOOK_VOLUME, type Look } from './types';

export * from './types';

/**
 * 見た目の一覧。案を足すときは、ここに 1 行（import と配列の 1 つ）足すだけ。
 * ボタンは この順に並ぶ。`?look=<id>` で最初の案を選べる。先頭が いまの おすすめ（初期表示）。
 */
export const ALL_LOOKS: readonly Look[] = [placeholderLook];

export const DEFAULT_LOOK_ID = ALL_LOOKS[0].id;

export function findLook(id: string | null | undefined): Look | undefined {
  return ALL_LOOKS.find((l) => l.id === id);
}

// ---- いま使っている Look（メッシュ作りは ブロック番号で引く。番号 → id は initLooks で教える）
let current: Look = ALL_LOOKS[0];
let ids: readonly string[] = [];
let specs: (Look['kinds'][string] | undefined)[] = [];
let version = 0;

function rebind(): void {
  specs = ids.map((id) => current.kinds[id]);
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

/** いまの Look の色番号 → RGB */
export function paletteRgb(): Uint8Array {
  return current.palette;
}

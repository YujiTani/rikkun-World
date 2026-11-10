// HOUSE-2A（#364）ユニットテスト用の 道具（テスト専用。本番の コードからは 使わない）。
// 窓口 `house.recipes()`・`learn()`・`found()`・`recipeBand()` と、エディターの 新しい 項目は 型の 上で まだ 無い ので、ここで 形を 約束する
// （約束の 本文は e2e/helpers/house.ts の「2A の 約束」。レシピの 数は どこにも 書かない: 数える ときは recipes().all から）。
import { houseRig } from '../houseRig';

export type Rig = ReturnType<typeof houseRig>;

export interface RecipeHook {
  recipes(): { learned: string[]; fresh: string[]; all: string[] };
  learn(id: string): boolean;
  found(at: { x: number; y: number; z: number }): string | null;
  recipeBand(): { text: string; ticksLeft: number } | null;
}
export const rh = (r: Rig): RecipeHook => r.hook as unknown as RecipeHook;

/** 窓口 editor() の 2A で 足される 部分 */
export interface Ed {
  step: 'soto' | 'naka' | 'namae';
  part: string;
  roof: string;
  wall: string;
  windowKind: string;
  door: string;
  deco: string[];
  light: string;
  marks: string[];
  canUndo: boolean;
  canRedo: boolean;
  windows: number;
  size: { w: number; d: number };
  name: { front: string; back: string };
  confirm: string | null;
  furniture: { kind: string }[];
}
export const ed = (r: Rig): Ed => r.hook.editor() as unknown as Ed;

/** 全レシピの id（表から。テストの 中に 数を 書かない）。窓口が まだ 無い ときは 空（その ときは 最初の 「表が ある」の テストが 赤） */
export function allRecipes(): string[] {
  try {
    return rh(houseRig()).recipes().all;
  } catch {
    return [];
  }
}

/** レシピ 1 まい ごとの えらび方: どの すすみの どの ボタンを 押すと どの 窓口の 値が かわるか（仕様 §4.1。id の 約束は house.ts の 先頭） */
export interface Entry {
  step: 'soto' | 'naka' | 'namae';
  /** ① の ばしょ（① だけ） */
  part?: 'roof' | 'wall' | 'window' | 'door' | 'deco';
  /** editor() の 項目と、edit(op) の op（家具・後ろの 文字は なし） */
  field?: 'roof' | 'wall' | 'windowKind' | 'door' | 'deco' | 'light';
  kind?: string;
  btn: string;
}
export const ENTRY: Readonly<Record<string, Entry>> = {
  roof_kawara: { step: 'soto', part: 'roof', field: 'roof', kind: 'kawara', btn: 'roof-kawara' },
  roof_sankaku: { step: 'soto', part: 'roof', field: 'roof', kind: 'sankaku', btn: 'roof-sankaku' },
  roof_wara: { step: 'soto', part: 'roof', field: 'roof', kind: 'wara', btn: 'roof-wara' },
  roof_kin: { step: 'soto', part: 'roof', field: 'roof', kind: 'kin', btn: 'roof-kin' },
  wall_shikkui: { step: 'soto', part: 'wall', field: 'wall', kind: 'shikkui', btn: 'wall-shikkui' },
  wall_renga: { step: 'soto', part: 'wall', field: 'wall', kind: 'renga', btn: 'wall-renga' },
  wall_ishi: { step: 'soto', part: 'wall', field: 'wall', kind: 'ishi', btn: 'wall-ishi' },
  window_suisho: { step: 'soto', part: 'window', field: 'windowKind', kind: 'suisho', btn: 'windowKind-suisho' },
  window_maru: { step: 'soto', part: 'window', field: 'windowKind', kind: 'maru', btn: 'windowKind-maru' },
  door_tetsu: { step: 'soto', part: 'door', field: 'door', kind: 'tetsu', btn: 'door-tetsu' },
  chimney_renga: { step: 'soto', part: 'deco', field: 'deco', kind: 'entotsu', btn: 'deco-entotsu' },
  deco_noren: { step: 'soto', part: 'deco', field: 'deco', kind: 'noren', btn: 'deco-noren' },
  deco_hanadan: { step: 'soto', part: 'deco', field: 'deco', kind: 'hanadan', btn: 'deco-hanadan' },
  deco_shachi: { step: 'soto', part: 'deco', field: 'deco', kind: 'shachi', btn: 'deco-shachi' },
  light_hotaru: { step: 'naka', field: 'light', kind: 'hotaru', btn: 'light-hotaru' },
  light_suisho: { step: 'naka', field: 'light', kind: 'suisho', btn: 'light-suisho' },
  furniture_maneki: { step: 'naka', btn: 'furniture-maneki' },
  suffix_shiro: { step: 'namae', btn: 'suffix-5' },
  suffix_goten: { step: 'namae', btn: 'suffix-6' },
  suffix_toride: { step: 'namae', btn: 'suffix-7' },
};
export const SUFFIX_NAME: Readonly<Record<string, string>> = { suffix_shiro: 'のしろ', suffix_goten: 'ごてん', suffix_toride: 'のとりで' };

/** 話しかけて エディターを 開く */
export function openEd(r: Rig): void {
  r.talk();
  r.sys.press('editor');
}
export const btnIds = (r: Rig): string[] => r.hook.menu().buttons.map((b) => b.id);
export const btnOn = (r: Rig, id: string): boolean | undefined => r.hook.menu().buttons.find((b) => b.id === id)?.enabled;
/** すすみを 進める／もどす（next・prev を 押す） */
export function goStep(r: Rig, step: 'soto' | 'naka' | 'namae'): void {
  const order = ['soto', 'naka', 'namae'];
  while (ed(r).step !== step) r.sys.press(order.indexOf(ed(r).step) < order.indexOf(step) ? 'next' : 'prev');
}
/** 全部の レシピを おぼえる */
export function learnAll(r: Rig): void {
  for (const id of rh(r).recipes().all) rh(r).learn(id);
}
/** もう 1 けん 建て はじめた 世界（はじめての 家の おまけは もう ない） */
export const notFirst = (r: Rig): void => r.sys.build.builder.load({ v: 1, active: null, pending: [], bonusUsed: true });
/** ひつような もの → { item: need }（はなは 3 いろ あわせて 'flower'。need 0 の 行は 数えない） */
export function needMap(r: Rig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of r.hook.need()) {
    if (row.need <= 0) continue;
    const k = row.item.startsWith('flower') ? 'flower' : row.item;
    out[k] = (out[k] ?? 0) + row.need;
  }
  return out;
}

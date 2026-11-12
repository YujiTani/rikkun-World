/**
 * はっぱと たけの 見た目。はっぱの 既定は いまの まま。たけの 既定は 細い 小ブロックの 形 `voxel`（VOX-I-4a。2026-11-11 オーナー。当たりは 1 ブロックの まま）。
 * URL: `?leaf=shell|cross` `?bamboo=current|voxel|sprite`（`?bamboo=current` で 前の 太い 形）。無い・知らない値は 既定の まま。
 * 計測だけ `setLeafBamboo({ leaf: 'none' })`（はっぱを 描かない）。URL からは 選べない。
 */

export type LeafMode = 'current' | 'shell' | 'cross' | 'none';
export type BambooMode = 'current' | 'voxel' | 'sprite';

let leaf: LeafMode = 'current';
let bamboo: BambooMode = 'voxel';

function searchOf(): string {
  const loc = (globalThis as { location?: { search?: string } }).location;
  return typeof loc?.search === 'string' ? loc.search : '';
}

function readUrl(): void {
  const q = new URLSearchParams(searchOf());
  const l = q.get('leaf');
  const b = q.get('bamboo');
  if (l === 'shell' || l === 'cross') leaf = l;
  if (b === 'current' || b === 'voxel' || b === 'sprite') bamboo = b;
}

readUrl();

export function leafMode(): LeafMode {
  return leaf;
}

export function bambooMode(): BambooMode {
  return bamboo;
}

/** 計測・テスト用。URL のあとに 呼ぶ。かくす判定（OCC）と 型の キャッシュは 呼び側が そろえる */
export function setLeafBamboo(next: { leaf?: LeafMode; bamboo?: BambooMode }): void {
  if (next.leaf !== undefined) leaf = next.leaf;
  if (next.bamboo !== undefined) bamboo = next.bamboo;
}

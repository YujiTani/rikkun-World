/**
 * はっぱと たけの 見た目の 試し（オーナーが 選ぶまで 本番の 既定は 変えない）。
 * URL: `?leaf=moko|shell|cross` `?bamboo=voxel|sprite`。無い・知らない値は いまの まま。
 * 計測だけ `setLeafBamboo({ leaf: 'none' })`（はっぱを 描かない）。URL からは 選べない。
 */

export type LeafMode = 'current' | 'moko' | 'shell' | 'cross' | 'none';
export type BambooMode = 'current' | 'voxel' | 'sprite';

let leaf: LeafMode = 'current';
let bamboo: BambooMode = 'current';

function searchOf(): string {
  const loc = (globalThis as { location?: { search?: string } }).location;
  return typeof loc?.search === 'string' ? loc.search : '';
}

function readUrl(): void {
  const q = new URLSearchParams(searchOf());
  const l = q.get('leaf');
  const b = q.get('bamboo');
  if (l === 'shell' || l === 'cross' || l === 'moko') leaf = l;
  if (b === 'voxel' || b === 'sprite') bamboo = b;
}

readUrl();

export function leafMode(): LeafMode {
  return leaf;
}

/** はっぱを 小ブロックで 描くか（いまの 形・もこもこ）。false = 板や 面で 描く 試し */
export function leafIsVoxel(): boolean {
  return leaf === 'current' || leaf === 'moko';
}

export function bambooMode(): BambooMode {
  return bamboo;
}

/** 計測・テスト用。URL のあとに 呼ぶ。かくす判定（OCC）と 型の キャッシュは 呼び側が そろえる */
export function setLeafBamboo(next: { leaf?: LeafMode; bamboo?: BambooMode }): void {
  if (next.leaf !== undefined) leaf = next.leaf;
  if (next.bamboo !== undefined) bamboo = next.bamboo;
}

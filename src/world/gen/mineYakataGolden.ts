import { readFileSync } from 'node:fs';
import type { PathCell } from './mineShaftKit';
import { pathHashOf } from './mineBokenGolden';

/**
 * MINE-1F の テストの 見本 `src/world/gen/__fixtures__/mine1e-before.json`〔1F を 入れる 前の main = 1E 入りで 作った 形〕を 読む 道具。
 * 作り方は mineYakataSame.test.ts の 頭。見本は 書きかえて 通さない。
 */

export const GOLDEN_E_FILE = new URL('./__fixtures__/mine1e-before.json', import.meta.url);
export const GOLDEN_E_SEEDS: readonly number[] = [20261012, 1000 + 1 * 7919, 1000 + 2 * 7919, 1000 + 3 * 7919];
/** 1D の 部屋を くらべる 範囲〔スタートの まわり 横 ± この マス。計画が 重い ので 先頭の 2 シードだけ〕 */
export const GOLDEN_CAVE_HALF = 768;
export const GOLDEN_CAVE_SEEDS = 2;
/** 数える 範囲〔スタートの まわり 横 ± この マス〕 */
export const GOLDEN_E_HALF = 2048;

interface Pt3 {
  x: number;
  y: number;
  z: number;
}
interface ShaftE {
  id: string;
  depth: string;
  entrance: Pt3;
  box: { x0: number; z0: number; x1: number; z1: number };
  /** `shaftPath` の ハッシュ〔ぜんぶ〕 */
  pathHash: string;
  pathLength: number;
  /** 横穴の 並び〔layer・from・to・end・heyaHit〕 */
  sides: string;
  /** 階の 足の y の 並び */
  floors: string;
}
export interface GoldenE {
  /** シードごと: 1E の 坑道ぜんぶ〔ふかい 坑道は 道の ハッシュも〕 */
  seeds: Record<string, { shafts: ShaftE[]; cavesHash: string }>;
  /** 先頭 `GOLDEN_CAVE_SEEDS` シード いがいの cavesHash は 空 */
}

export const goldenE = (): GoldenE => JSON.parse(readFileSync(GOLDEN_E_FILE, 'utf8')) as GoldenE;

/** `'yakata'` の 足の マスを のぞいた 道の ハッシュ〔1F の あと 比べる〕 */
export const pathHashNoYakata = (path: readonly PathCell[]): string => pathHashOf(path.filter((c) => (c.part as string) !== 'yakata'));
export { pathHashOf };

const fnv = (s: string): string => {
  let v = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) v = Math.imul(v ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return v.toString(16);
};
export const hashOf = fnv;

export const sidesSig = (sides: readonly { layer: string; from: Pt3; to: Pt3; end: string; heyaHit?: boolean }[]): string =>
  JSON.stringify(sides.map((d) => [d.layer, d.from.x, d.from.y, d.from.z, d.to.x, d.to.y, d.to.z, d.end, d.heyaHit === true]));

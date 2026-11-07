import { readFileSync } from 'node:fs';
import type { PathCell, Shaft } from './mineShaftKit';

/**
 * MINE-1E の テストの 見本 `src/save/__fixtures__/mine1d-before.json`〔1E を 入れる 前の main = 1D 入りで 作った 形〕を 読む 道具。
 * 作り方は mineBokenStart.test.ts の 頭。見本は 書きかえて 通さない。
 */

export const GOLDEN_FILE = new URL('../../save/__fixtures__/mine1d-before.json', import.meta.url);

interface Pt3 {
  x: number;
  y: number;
  z: number;
}
export interface SideG {
  layer: string;
  from: Pt3;
  to: Pt3;
  end: string;
  heyaHit: boolean;
}
export interface ShaftG {
  id: string;
  entrance: Pt3;
  pathHash: string;
  pathLength: number;
  box: { x0: number; z0: number; x1: number; z1: number };
  sides: SideG[];
}
export interface Golden1D {
  /** 20 シードの はじまりの 坑道 */
  starts: Record<string, ShaftG>;
  /** 主な シードの スタートに 近い ほかの 坑道〔40 こ〕 */
  near: ShaftG[];
}

const fnv = (s: string): string => {
  let v = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) v = Math.imul(v ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return v.toString(16);
};
export const pathHashOf = (path: readonly { x: number; y: number; z: number; part: string }[]): string => fnv(path.map((c) => `${c.part},${c.x},${c.y},${c.z}`).join(';'));
export const shaftG = (s: Shaft, path: PathCell[]): ShaftG => ({
  id: s.id,
  entrance: { x: s.entrance.x, y: s.entrance.y, z: s.entrance.z },
  pathHash: pathHashOf(path),
  pathLength: path.length,
  box: s.box,
  sides: s.sides.map((d) => ({ layer: d.layer, from: d.from, to: d.to, end: d.end, heyaHit: d.heyaHit === true })),
});
export const golden1D = (): Golden1D => JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as Golden1D;


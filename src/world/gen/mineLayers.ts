import { WORLD_HEIGHT } from '../../contracts';
import { MINE_CONFIG, type MineLayerId } from './mineConfig';

/** 3 つの 層（MINE-1A。docs/design/MINE-1.md §4.1）。高さだけで きまる（場所・国・シードに よらない） */

/** その 高さ（y。マス）の 層。そこいし（y 0）より 下や 世界の 外は null */
export function layerAt(y: number): MineLayerId | null {
  const iy = Math.floor(y);
  for (const l of MINE_CONFIG.layers) if (iy >= l.minY && (l.maxY === null || iy <= l.maxY)) return l.id;
  return null;
}

/** 層の いちばん 下の y と いちばん 上の y（マス。あさい 層の 上は 世界の いちばん 上まで） */
export function layerSpan(id: MineLayerId): { lo: number; hi: number } {
  const l = MINE_CONFIG.layers.find((d) => d.id === id);
  if (!l) throw new Error(`mineLayers: 知らない 層 ${id}`);
  return { lo: l.minY, hi: l.maxY ?? WORLD_HEIGHT - 1 };
}

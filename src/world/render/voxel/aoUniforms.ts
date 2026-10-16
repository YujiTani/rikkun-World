import { Vector2 } from 'three';
import { AO_FADE_BLOCKS } from '../config';

/**
 * 角の暗がり（AO）の、全部の材料で 共有する 値。
 * - on: 1 = AO を かける、0 = 切る（テスト用 render.setAo）
 * - fade: 距離（カメラから水平に）で AO を 1.0 へ消す範囲 (近い端, 遠い端)。小ブロックの半径 r の 8 ブロック手前から r まで
 */
export const aoUniforms = {
  on: { value: 1 },
  fade: { value: new Vector2(24, 32) },
};

export function setAoRadius(r: number): void {
  aoUniforms.fade.value.set(r - AO_FADE_BLOCKS, r);
}

/** シェーダーと同じ smoothstep で、距離 → AO を かける割合（1 = ぜんぶ かける、0 = かけない） */
export function aoFadeFactor(dist: number, r: number): number {
  const a = r - AO_FADE_BLOCKS;
  const t = Math.min(1, Math.max(0, (dist - a) / (r - a)));
  return 1 - t * t * (3 - 2 * t);
}

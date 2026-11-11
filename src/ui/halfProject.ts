/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g) #21）: 世界の 物を 画面に 投げる とき（妖怪の 名札・ひるみの 印・マッチョの「！」）、
 * 画面ぜんたいの はばに 写さず、その 半分の 矩形に 写す 純関数。葉の ファイル（DOM・Three.js なし）。ui/duoHalves.ts も ここから 再びとり出す。
 * 半分が 画面ぜんたい（1 人の とき）なら 今までの 式（(ndc × 0.5 + 0.5) × 画面）と 同じ。
 */
import type { Rect } from '../duo/viewRects';

/** NDC（-1〜1。右 +x・上 +y）→ その 半分の 中の 画面の 位置（CSS px）。out を 渡すと そこに 書く（毎ステップ 新しい 物を 作らない） */
export function ndcToHalf(half: Rect, ndcX: number, ndcY: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = half.x + (ndcX * 0.5 + 0.5) * half.w;
  out.y = half.y + (-ndcY * 0.5 + 0.5) * half.h;
  return out;
}

/**
 * 下はしの まん中が (ax, ay) の 箱（w × h）を 半分の 中に おさめた 点。
 * x ∈ [半分の 左 + w/2 + pad, 半分の 右 − w/2 − pad]、y ∈ [半分の 上 + h + pad, 半分の 下 − bottomPad]。
 * 妖怪の 名札は bottomPad = h + pad、マッチョの「！」・顔は bottomPad = pad（今の 式）。
 */
export function clampToHalf(half: Rect, ax: number, ay: number, w: number, h: number, pad: number, bottomPad: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = Math.min(Math.max(ax, half.x + w / 2 + pad), half.x + half.w - w / 2 - pad);
  out.y = Math.min(Math.max(ay, half.y + h + pad), half.y + half.h - bottomPad);
  return out;
}

/** 画面ぜんたいの 矩形（1 人の とき）。`fullRect()` で 毎回 同じ 入れものに 今の 窓の 大きさを 書く */
const FULL: Rect = { x: 0, y: 0, w: 0, h: 0 };
export function fullRect(w: number, h: number): Rect {
  FULL.w = w;
  FULL.h = h;
  return FULL;
}

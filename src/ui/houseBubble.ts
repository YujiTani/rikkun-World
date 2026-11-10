// COOP-1 5d（AC164）: 建築士さんの ふきだし（メニューの 前の うなずき・あいさつ）を 話した 人の 区画の 中に 置く 計算。DOM・three の 作成なし。
import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';

/** 区画（CSS px。画面の 左上が 0,0）。1P の 全面・2 人の ときの 1P の 半分・2P の 半分 */
export interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** ふきだしの しっぽが 頭に くる ように、ふきだしの 下を 頭の 上 この px に おく */
const TAIL_GAP = 16;
/** 点が 見えない とき ふきだしの 下を 区画の 上から この わりあいに おく */
const HIDDEN_Y = 0.4;

/**
 * ふきだしの 左上を 区画の 中に おさめて 返す（結果は out に 書いて out を 返す。毎ステップ 新しい 物を 作らない）。
 * anchor ＝ 建築士さんの 頭の 上（画面の px。見えなければ null）。null なら 区画の よこの まん中・たては 上から 4 割。
 */
export function placeBubble(anchor: { x: number; y: number } | null, size: { w: number; h: number }, pane: Pane, out: { left: number; top: number }, margin = 16): { left: number; top: number } {
  const x = anchor ? anchor.x : pane.x + pane.w / 2;
  const y = anchor ? anchor.y : pane.y + pane.h * HIDDEN_Y;
  const loL = pane.x + margin;
  const hiL = pane.x + pane.w - size.w - margin;
  const loT = pane.y + margin;
  const hiT = pane.y + pane.h - size.h - margin;
  out.left = Math.max(loL, Math.min(hiL, x - size.w / 2));
  out.top = Math.max(loT, Math.min(hiT, y - size.h - TAIL_GAP));
  return out;
}

const tmp = new Vector3();

/**
 * 世界の 点 p を、その カメラで 見た 区画の 画面の 位置（CSS px。区画の 左上を 起点）に 投影する。呼ぶ 側が camera.updateMatrixWorld() ずみ。
 * カメラの うしろ（z が -1〜1 の 外）なら null。横・たてに 区画の 外でも 位置は 返す（置き場は placeBubble が 区画の 中に おさめる）。結果は 毎回 新しい 物
 */
export function projectUnclipped(p: { x: number; y: number; z: number }, camera: PerspectiveCamera, pane: Pane): { x: number; y: number } | null {
  tmp.set(p.x, p.y, p.z).project(camera);
  if (tmp.z < -1 || tmp.z > 1) return null;
  return { x: pane.x + (tmp.x * 0.5 + 0.5) * pane.w, y: pane.y + (-tmp.y * 0.5 + 0.5) * pane.h };
}

/** projectUnclipped の うち、点が 区画の 外（x・y が -1〜1 の 外）なら null（2P の 半分の ふきだし。AC164） */
export function projectToPane(p: { x: number; y: number; z: number }, camera: PerspectiveCamera, pane: Pane): { x: number; y: number } | null {
  const q = projectUnclipped(p, camera, pane);
  if (!q) return null;
  if (tmp.x < -1 || tmp.x > 1 || tmp.y < -1 || tmp.y > 1) return null;
  return q;
}

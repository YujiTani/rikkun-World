import type { Rect } from '../../duo/viewRects';

/**
 * 紙ふぶきの 位置（COOP-1 5f-2 #19。docs/design/COOP-1.md 1.17）。DOM なし。
 * 紙は `position: fixed` で JS が 動かす ので、css の 層で 半分に 切れない。区画の 矩形から 紙の 位置を 決める:
 * 2 人の とき 1P の 半分の 矩形を わたせば、紙は まん中の 線を こえない。画面ぜんたいの 矩形なら 今までの 式と 同じ。
 */
export interface ConfettiSeed {
  /** 0〜1。横の 場所（区画の はばの 20〜80%） */
  x: number;
  /** ゆれの ずれ（ラジアン） */
  sway: number;
  /** 落ちる 速さの 倍 */
  speed: number;
}

/** ゆれの 大きさ（px）・ゆれの 速さ（ラジアン / t）・落ちる 速さ（区画の 高さに 対する 割合）・はじまりの 高さ（px。画面の 上の 外） */
const SWAY_PX = 24;
const SWAY_RATE = 12;
const FALL_RATIO = 0.8;
const START_Y = -20;
/** 紙の 横の 範囲（区画の はばに 対する 割合。左 20% から 60% ぶん） */
const SPREAD_FROM = 0.2;
const SPREAD_W = 0.6;

/** t（0〜1。ふぶきの 進み）の ときの 紙 1 まいの 位置（CSS px）。out を 渡すと そこに 書く */
export function confettiAt(seed: ConfettiSeed, t: number, view: Rect, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = view.x + view.w * (SPREAD_FROM + SPREAD_W * seed.x) + Math.sin(t * SWAY_RATE * seed.speed + seed.sway) * SWAY_PX;
  out.y = view.y + (START_Y + t * seed.speed * view.h * FALL_RATIO);
  return out;
}

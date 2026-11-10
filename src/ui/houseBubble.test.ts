import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { placeBubble as place, projectToPane, projectUnclipped } from './houseBubble';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)「ふきだし」・AC164）: 建築士さんの ふきだし（メニューの 前の うなずき・あいさつ）を 話した 人の 半分の 中に 置く 計算。
 * 実装の 前に 書いた 赤の テスト。
 *
 * ---- 開発への つなぎ目の 約束（新しい ファイル `src/ui/houseBubble.ts`。HouseUi.placeBubble の 計算を 取り出す。名前は 開発が かえて よい）----
 *   export interface Pane { x: number; y: number; w: number; h: number }          // 区画（CSS px。画面の 左上が 0,0）
 *   export function placeBubble(anchor: { x: number; y: number } | null, size: { w: number; h: number }, pane: Pane, out: { left: number; top: number }, margin = 16): { left: number; top: number }
 *     結果は out に 書いて out を 返す（毎ステップ 新しい 物を 作らない）。
 *     anchor = 建築士さんの 頭の 上（画面の px。見えなければ null）。しっぽが 頭に くる ように ふきだしの 下を anchor の 16px 上に。
 *     ふきだしは pane の 中に おさめる（四方 margin）。anchor が null なら pane の よこの まん中・たての 上から 4 割。
 *   pane に 画面ぜんたいを 渡せば 今の 1P の 式と 同じ（left = max(16, min(vw - w - 16, x - w/2))、top = max(16, min(vh - h - 16, y - h - 16))）。

 *   export function projectToPane(p: Vec3, camera: PerspectiveCamera, pane: Pane): { x: number; y: number } | null
 *     世界の 点 p を その 区画の 画面の 位置〔CSS px。pane の 左上を 起点に pane の 中へ〕に 投影する 純関数。呼ぶ 側が camera.updateMatrixWorld() ずみ。
 *     カメラの 後ろ・区画の 外〔-1〜1 の 外〕なら null。2P の ふきだしと 5f の 投影が 使う。
 *   2P が 話した とき: pane = 2P の 半分、anchor = 2P の カメラで 投影した 点（HouseUi の anchor を 話した 人の カメラに）。
 */

const FULL = { x: 0, y: 0, w: 1280, h: 800 };
const RIGHT = { x: 640, y: 0, w: 640, h: 800 };
const SIZE = { w: 300, h: 120 };
const out = { left: 0, top: 0 };
/** 結果を 取りだして 比べる（out は 使いまわす 入れ物なので 写す） */
const placeBubble = (a: { x: number; y: number } | null, size: { w: number; h: number }, pane: { x: number; y: number; w: number; h: number }) => ({ ...place(a, size, pane, out) });

describe('AC164 ふきだしの 置き場', () => {
  it('画面ぜんたいの 区画: 今の 式と 同じ（頭の 上に 中央ぞろえ）', () => {
    expect(placeBubble({ x: 500, y: 400 }, SIZE, FULL)).toEqual({ left: 500 - 150, top: 400 - 120 - 16 });
  });

  it('画面ぜんたいの 区画: はしに よると 16px の あきで おさまる。見えない（null）なら まん中・上から 4 割', () => {
    expect(placeBubble({ x: 5, y: 5 }, SIZE, FULL)).toEqual({ left: 16, top: 16 });
    expect(placeBubble({ x: 1275, y: 800 }, SIZE, FULL)).toEqual({ left: 1280 - 300 - 16, top: 800 - 120 - 16 });
    expect(placeBubble(null, SIZE, FULL)).toEqual({ left: 640 - 150, top: 800 * 0.4 - 120 - 16 });
  });

  it('2P の 半分: 頭の 上の 点が 半分の 中なら 中央ぞろえ', () => {
    expect(placeBubble({ x: 960, y: 400 }, SIZE, RIGHT)).toEqual({ left: 960 - 150, top: 400 - 120 - 16 });
  });

  it('2P の 半分: 点が 半分の 外（1P の 側）や 右はしに あっても ふきだしは 半分の 中に おさまる', () => {
    for (const x of [100, 639, 645, 1279, 1500]) {
      const p = placeBubble({ x, y: 300 }, SIZE, RIGHT);
      expect(p.left, `x=${x}`).toBeGreaterThanOrEqual(RIGHT.x + 16);
      expect(p.left + SIZE.w, `x=${x}`).toBeLessThanOrEqual(RIGHT.x + RIGHT.w - 16);
      expect(p.top).toBeGreaterThanOrEqual(16);
      expect(p.top + SIZE.h).toBeLessThanOrEqual(RIGHT.h - 16);
    }
  });

  it('2P の 半分: 点が 見えない（null）なら 半分の まん中', () => {
    const p = placeBubble(null, SIZE, RIGHT);
    expect(p.left).toBe(RIGHT.x + RIGHT.w / 2 - SIZE.w / 2);
  });

  it('1P の 半分（左）も 同じ: 半分の 中に おさまる', () => {
    const LEFT = { x: 0, y: 0, w: 640, h: 800 };
    const p = placeBubble({ x: 1000, y: 300 }, SIZE, LEFT);
    expect(p.left + SIZE.w).toBeLessThanOrEqual(LEFT.w - 16);
    expect(p.left).toBeGreaterThanOrEqual(16);
  });
});

describe('projectToPane（2P の カメラで 頭の 上の 点を 半分の 画面へ）', () => {
  function cam(pane: { w: number; h: number }): PerspectiveCamera {
    const c = new PerspectiveCamera(50, pane.w / pane.h, 0.1, 500);
    c.position.set(10, 5, 10);
    c.lookAt(new Vector3(10, 5, 0)); // -z を 向く
    c.updateMatrixWorld();
    return c;
  }
  it('まっすぐ 前の 点は 区画の まん中（区画の 位置を 足す）', () => {
    const c = cam(RIGHT);
    const q = projectToPane({ x: 10, y: 5, z: 0 }, c, RIGHT)!;
    expect(q.x).toBeCloseTo(RIGHT.x + RIGHT.w / 2, 3);
    expect(q.y).toBeCloseTo(RIGHT.y + RIGHT.h / 2, 3);
  });
  it('右の 点は 区画の 右がわ、上の 点は 上がわ。区画の 中に おさまる', () => {
    const c = cam(RIGHT);
    const r = projectToPane({ x: 12, y: 6, z: 0 }, c, RIGHT)!;
    expect(r.x).toBeGreaterThan(RIGHT.x + RIGHT.w / 2);
    expect(r.y).toBeLessThan(RIGHT.y + RIGHT.h / 2);
    expect(r.x).toBeLessThanOrEqual(RIGHT.x + RIGHT.w);
  });
  it('カメラの うしろの 点は null', () => {
    expect(projectToPane({ x: 10, y: 5, z: 20 }, cam(RIGHT), RIGHT)).toBeNull();
  });
  it('区画の 外（よこに 大きく はずれた 点）は null', () => {
    expect(projectToPane({ x: 200, y: 5, z: 0 }, cam(RIGHT), RIGHT)).toBeNull();
  });
});

describe('projectUnclipped（1 人の ふきだし。よこに はみ出しても 位置は 返す）', () => {
  const c = new PerspectiveCamera(50, 1280 / 800, 0.1, 500);
  c.position.set(10, 5, 10);
  c.lookAt(new Vector3(10, 5, 0));
  c.updateMatrixWorld();
  it('区画の 外でも 位置を 返す（置き場は placeBubble が おさめる）。うしろは null', () => {
    expect(projectToPane({ x: 200, y: 5, z: 0 }, c, FULL)).toBeNull();
    expect(projectUnclipped({ x: 200, y: 5, z: 0 }, c, FULL)).not.toBeNull();
    expect(projectUnclipped({ x: 10, y: 5, z: 20 }, c, FULL)).toBeNull();
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DuoViewRenderer } from './viewRender';
import { viewRects, type Rect } from './viewRects';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.16 §3.7 (g) #21、§8 5f-2「区画ごとに 呼ぶ 口」、AC178）のユニットテスト。実装の前に書いた赤のテスト。
 * 妖怪の 名札・ひるみの 印・マッチョの ！は 世界の 物を 画面に 投げる（project）。今は 1P の カメラ（画面ぜんたいの はばの アスペクト）で 1 回 投げて 画面ぜんたいの はばに 写す ので、
 * 2P の 半分では 1P の カメラの 位置に 出て ずれ、1P の 半分でも ずれる。区画ごとに「その 区画の カメラ（区画の アスペクト）」と「その 区画の 矩形」で 投げる ために、
 * 区画を 描く 直前の 呼び出し口 `beforePane` に 区画の 持ち主と 矩形を わたす。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `DuoViewRenderer` の コンストラクターの 4・5 つ目（beforePane・afterPane）の 型を 次に かえる（今の `(cam) => void` に 2 つ 足す。今の 呼び出し側は 引数を 無視して よい）:
 *     (cam: THREE.Camera, who: 1 | 2, pane: Rect) => void
 *     - 各区画の 世界の 描画の 直前（beforePane）・直後（afterPane）に、その 区画で 使う カメラ・持ち主（1P の 区画 = 1・2P の 区画 = 2）・区画の 矩形（CSS px）を わたす。
 *     - beforePane の ときに カメラの aspect は もう その 区画の はば / 高さに なっている（projectionMatrix も 更新ずみ。ここで project すれば 区画に ぴったり 合う）。
 *     - 順番は 1P の 区画 → 2P の 区画（2P の 区画が ない〔null〕ときは 1P だけ）。
 *     - pane は rc.main／rc.second の 矩形と 同じ 値（半分の 矩形）。
 */

function fakeRenderer(w: number, h: number): THREE.WebGLRenderer {
  const info = { autoReset: true, reset: () => {} };
  const r = {
    info,
    getSize: (v: THREE.Vector2) => v.set(w, h),
    setScissorTest: () => {},
    setViewport: () => {},
    setScissor: () => {},
    render: () => {},
  };
  return r as unknown as THREE.WebGLRenderer;
}

describe('beforePane・afterPane は (カメラ, 持ち主, 区画の 矩形) を 区画ごとに 受ける', () => {
  const W = 1280;
  const H = 800;
  const rc = viewRects('split', 'split', 1, W, H);

  function run(rcUse = rc) {
    const scene = new THREE.Scene();
    const main = new THREE.PerspectiveCamera(70, W / H, 0.1, 500);
    const calls: { phase: 'before' | 'after'; cam: THREE.Camera; who: 1 | 2; pane: Rect; aspect: number }[] = [];
    const rec = (phase: 'before' | 'after') => (cam: THREE.Camera, who: 1 | 2, pane: Rect) => {
      calls.push({ phase, cam, who, pane: { ...pane }, aspect: (cam as THREE.PerspectiveCamera).aspect });
    };
    const vr = new DuoViewRenderer(fakeRenderer(W, H), scene, main, rec('before') as never, rec('after') as never);
    vr.render({ rc: rcUse, fogFar: null });
    return { calls, main, cam2: vr.camera2 };
  }

  it('2 人: before 1P → after 1P → before 2P → after 2P の 順', () => {
    const { calls } = run();
    expect(calls.map((c) => `${c.phase}${c.who}`)).toEqual(['before1', 'after1', 'before2', 'after2']);
  });
  it('持ち主ごとに その 区画の カメラ（1P＝ 画面の main・2P＝ camera2）', () => {
    const { calls, main, cam2 } = run();
    for (const c of calls) expect(c.cam).toBe(c.who === 1 ? main : cam2);
  });
  it('区画の 矩形は 左右の 半分（まん中の 線で ぴったり）', () => {
    const { calls } = run();
    const p1 = calls.find((c) => c.phase === 'before' && c.who === 1)!.pane;
    const p2 = calls.find((c) => c.phase === 'before' && c.who === 2)!.pane;
    expect(p1).toEqual(rc.main);
    expect(p2).toEqual(rc.second);
    expect(p1.x + p1.w).toBe(p2.x);
    expect(p2.x + p2.w).toBe(W);
  });
  it('before の ときの aspect は その 区画の はば / 高さ（画面ぜんたいの aspect ではない）', () => {
    const { calls } = run();
    for (const c of calls.filter((x) => x.phase === 'before')) expect(c.aspect).toBeCloseTo(c.pane.w / c.pane.h, 9);
    const b1 = calls.find((c) => c.phase === 'before' && c.who === 1)!;
    expect(b1.aspect).toBeLessThan(W / H);
  });
  it('そのあと 1P の カメラの aspect は 画面ぜんたいに もどる（1 人の ときの 描画に 影響しない）', () => {
    const { main } = run();
    expect(main.aspect).toBeCloseTo(W / H, 9);
  });
  it('2P の 区画が ない（null）ときは 1P だけ', () => {
    const one = viewRects('one', 'one', 1, W, H);
    const { calls } = run(one);
    expect(calls.map((c) => `${c.phase}${c.who}`)).toEqual(['before1', 'after1']);
    expect(calls[0]!.pane).toEqual({ x: 0, y: 0, w: W, h: H });
  });
});

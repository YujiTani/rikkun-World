// LEGEND-FX ユニットテスト用の 道具（本番の コードからは 使わない）。
// 白い 斬撃・風・雷・虹の 4 つの 見た目を 「ゲームに 聞く」かわりに、形（頂点）を 直接 読んで 数える。
import * as THREE from 'three';
import type { BladeTech, BladeTechFrames } from '../contracts';

export const TECHS: BladeTech[] = ['thrust', 'kiriage', 'kesa'];
export const STEP_OF: Record<BladeTech, 1 | 2 | 3> = { thrust: 1, kiriage: 2, kesa: 3 };

/** TextureLoader・CanvasTexture が 使う document を 最小に まねる。読んだ 絵の 名前は srcs に のこる */
export function installFakeDocument(): { srcs: string[] } {
  const srcs: string[] = [];
  (globalThis as unknown as { document: unknown }).document = {
    createElementNS: () => ({
      addEventListener() {},
      removeEventListener() {},
      set src(v: string) {
        srcs.push(v);
      },
    }),
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData() {},
      }),
    }),
  };
  return { srcs };
}

export function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 200);
  cam.position.set(0, 4, 9);
  cam.lookAt(0, 1.2, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

/** 刀の わざの 長さ（W2 の 初期値と 同じ） */
export const LENGTHS = (tech: BladeTech): BladeTechFrames =>
  ({ thrust: { startup: 4, active: 2, recovery: 35 }, kiriage: { startup: 19, active: 3, recovery: 40 }, kesa: { startup: 28, active: 6, recovery: 72 } })[tech];

export const BODY = () => ({ x: 0, y: 0, z: 0 });

export interface Verts {
  /** 描いている 頂点の 数（3 つで 三角形 1 つ） */
  n: number;
  pos: Float32Array;
  col: Float32Array;
}

/** FxBatch の 形（mesh）から 今 描いている 頂点を 読む */
export function readVerts(mesh: THREE.Mesh): Verts {
  const g = mesh.geometry;
  const n = mesh.visible ? g.drawRange.count : 0;
  const pos = g.getAttribute('position').array as Float32Array;
  const col = g.getAttribute('color').array as Float32Array;
  return { n, pos: pos.slice(0, n * 3), col: col.slice(0, n * 4) };
}

/** scene の 中の（FxBatch の）形を 描画の 順（renderOrder）に ならべる。fx を 作る 前の 形は のぞく */
export function newMeshes(scene: THREE.Scene, before: Set<THREE.Object3D>): THREE.Mesh[] {
  return (scene.children.filter((o) => (o as THREE.Mesh).isMesh && !before.has(o)) as THREE.Mesh[]).sort((a, b) => a.renderOrder - b.renderOrder);
}

/** 頂点の 色の 一覧（rgb を 小数 3 けたに そろえた 文字）。alpha は 見ない */
export function colorKeys(v: Verts): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < v.n; i++) s.add([0, 1, 2].map((k) => v.col[i * 4 + k]!.toFixed(3)).join(','));
  return s;
}

export const keyOf = (rgb: readonly number[]): string => rgb.map((x) => x.toFixed(3)).join(',');

export function maxAlpha(v: Verts): number {
  let m = 0;
  for (let i = 0; i < v.n; i++) m = Math.max(m, v.col[i * 4 + 3]!);
  return m;
}

/** 三角形 3 つ 組の 頂点が ぜんぶ 同じ 色か（1 つの 粒が 単色か） */
export function trianglesAreFlat(v: Verts): boolean {
  for (let t = 0; t < v.n / 3; t++) {
    const a = [0, 1, 2].map((k) => v.col[t * 12 + k]!.toFixed(3)).join();
    for (let j = 1; j < 3; j++) if ([0, 1, 2].map((k) => v.col[t * 12 + j * 4 + k]!.toFixed(3)).join() !== a) return false;
  }
  return true;
}

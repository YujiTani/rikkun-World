/**
 * #293 試作: がしゃどくろの 体の 中の 道に 生い茂る こけ・くさ（yuzu 2026-10-24「くさやコケは ブロックタイプではなく、十字の ドット絵みたいな やつで 装飾」）。
 * ゲームの くさ（FLORA-75。src/world/blocks/textures.ts の kusaTile）と おなじ 色・おなじ 作りの「十字の 板」（たての 板を 2 まい ななめに 交差）と、
 * 面に はる 平らな こけの しきもの。ブロックの 種類では ない ので 当たりは なし。描くのは InstancedMesh（種類ごとに 1 回）。
 * 数（密度・大きさ・上限）は gashaBigTuning.ts の core.moss。
 */
import { BufferGeometry, DataTexture, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, NearestFilter, Quaternion, RGBAFormat, SRGBColorSpace, Vector3 } from 'three';

/** 平らな 四角い 面（torso の 座標）に、面の 外むきが up。o + a·s + b·t（s, t = 0〜1）の 上に 生やす */
export interface PlantSurface { o: Vector3; a: Vector3; b: Vector3; up: Vector3; density: number }

export interface PlantOpt {
  /** 体の 座標 → 取りつける 関節の 中の 座標 */
  parent: Matrix4;
  size: readonly [number, number];
  /** こけの しきものを 重ねる 割合（0〜1） */
  carpet: number;
  max: number;
  seed: number;
}

// ---------------------------------------------------------------- 絵（16 × 16 を 3 まい よこに 並べる: くさ・こけの 房・こけの しきもの）
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
let atlas: DataTexture | null = null;
export function plantTexture(): DataTexture {
  if (atlas) return atlas;
  const N = 16, W = N * 3, d = new Uint8Array(W * N * 4);
  // 上から y 行目 → データでは 下から 数える（DataTexture の はじめの 行は 下）
  const put = (tile: number, x: number, y: number, c: [number, number, number]): void => {
    if (x < 0 || x >= N || y < 0 || y >= N) return;
    const i = ((N - 1 - y) * W + tile * N + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  };
  // 0: くさ（kusaTile と おなじ 7 本の は。色も おなじ）
  const blades: [number, number, number][] = [[2, 9, -1], [4, 7, 0], [6, 10, 1], [8, 8, 0], [10, 9, -1], [12, 7, 1], [14, 10, 0]];
  for (const [x, top, lean] of blades) {
    for (let y = top; y < N; y++) {
      const k = (y - top) / (N - top);
      const xx = x + (k < 0.4 ? lean : 0);
      put(0, xx, y, hex(y === top ? '#B7D65A' : y < top + 2 ? '#8CC24A' : '#4E9A36'));
      if (y > 13) put(0, xx + 1, y, hex('#3E8B2F'));
    }
  }
  // 1: こけの 房（みじかく ふさふさ。ひろい はばで 2 〜 3 ぎょう ごとに 明るい 点）
  for (let x = 0; x < N; x++) {
    const top = 8 + ((x * 5 + (x >> 2) * 3) % 5);
    for (let y = top; y < N; y++) {
      const c = y === top ? '#B7D65A' : (x + y) % 5 === 0 ? '#6DBE45' : y < top + 3 ? '#8CC24A' : y > 13 ? '#3E8B2F' : '#4E9A36';
      put(1, x, y, hex(c));
    }
  }
  // 2: こけの しきもの（まるい かたまり。ふちは ぎざぎざ。点々の 明るい 緑）
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x - 7.5) / 7.6, dy = (y - 7.5) / 7.6, r = Math.hypot(dx, dy) + (((x * 7 + y * 13) % 5) - 2) * 0.05;
    if (r > 1) continue;
    const n = (x * 31 + y * 17) % 9;
    put(2, x, y, hex(n === 0 ? '#B7D65A' : n < 3 ? '#6DBE45' : n < 6 ? '#58A83A' : r > 0.8 ? '#3E8B2F' : '#4E9A36'));
  }
  const t = new DataTexture(d, W, N, RGBAFormat);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.colorSpace = SRGBColorSpace; t.generateMipmaps = false; t.needsUpdate = true;
  return (atlas = t);
}

// ---------------------------------------------------------------- 形
/** 十字の 板（たて 2 まいが ななめに 交差。足もとが 原点・高さ 1・はば 1） */
function crossGeo(tile: number): BufferGeometry {
  const u0 = tile / 3, u1 = (tile + 1) / 3;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5, n = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** こけの しきもの（平らな 1 まい。上むき） */
function carpetGeo(tile: number): BufferGeometry {
  const u0 = tile / 3, u1 = (tile + 1) / 3;
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-0.5, 0.03, -0.5, 0.5, 0.03, -0.5, 0.5, 0.03, 0.5, -0.5, 0.03, 0.5], 3));
  g.setAttribute('uv', new Float32BufferAttribute([u0, 0, u1, 0, u1, 1, u0, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export const plantMaterial = (): MeshBasicMaterial => new MeshBasicMaterial({ map: plantTexture(), alphaTest: 0.5, side: DoubleSide, vertexColors: false });

/** 面の 一覧から 生える ところを きめて、InstancedMesh を 3 つ（くさ・こけの 房・こけの しきもの）返す。数が 0 の ものは 返さない */
export function buildPlants(surfaces: readonly PlantSurface[], opt: PlantOpt, material: MeshBasicMaterial): { meshes: InstancedMesh[]; count: number } {
  const r = rnd(opt.seed);
  const lists: Matrix4[][] = [[], [], []];
  const tints: number[][] = [[], [], []];
  // 先に 全体の 数を 数えて、上限を こえたら 間引く
  const want = surfaces.map((s) => Math.max(0, s.a.length() * s.b.length() * s.density));
  const total = want.reduce((a, b) => a + b, 0);
  const keep = total > opt.max ? opt.max / total : 1;
  const q = new Quaternion(), qy = new Quaternion(), UPY = new Vector3(0, 1, 0), pos = new Vector3(), sc = new Vector3(), m = new Matrix4();
  surfaces.forEach((s, si) => {
    const n = Math.floor(want[si]! * keep + r());
    q.setFromUnitVectors(UPY, s.up.clone().normalize());
    for (let i = 0; i < n; i++) {
      pos.copy(s.o).addScaledVector(s.a, r()).addScaledVector(s.b, r()).addScaledVector(s.up, 0.02);
      const size = opt.size[0] + (opt.size[1] - opt.size[0]) * r();
      qy.setFromAxisAngle(UPY, r() * Math.PI * 2);
      const put = (tile: number, k: number, hk: number): void => {
        sc.set(size * k, size * hk, size * k);
        m.compose(pos, q.clone().multiply(qy), sc).premultiply(opt.parent);
        lists[tile]!.push(m.clone());
        tints[tile]!.push(0.82 + r() * 0.28);
      };
      put(r() < 0.5 ? 0 : 1, 1, 0.6 + r() * 0.4);
      if (r() < opt.carpet) put(2, 1.3 + r() * 0.8, 1);
    }
  });
  const meshes: InstancedMesh[] = [];
  let count = 0;
  for (let tile = 0; tile < 3; tile++) {
    const L = lists[tile]!;
    if (!L.length) continue;
    const mesh = new InstancedMesh(tile === 2 ? carpetGeo(tile) : crossGeo(tile), material, L.length);
    const col = new Float32Array(L.length * 3);
    L.forEach((mm, i) => { mesh.setMatrixAt(i, mm); const t = tints[tile]![i]!; col[i * 3] = t; col[i * 3 + 1] = t; col[i * 3 + 2] = t; });
    mesh.instanceColor = new InstancedBufferAttribute(col, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = `plants${tile}`;
    meshes.push(mesh);
    count += L.length;
  }
  return { meshes, count };
}

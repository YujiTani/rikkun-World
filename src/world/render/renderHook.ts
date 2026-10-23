import type { PerspectiveCamera, WebGLRenderer } from 'three';
import { Vector3 } from 'three';
import { BLOCK_TYPES, isOpaqueIndex } from '../blocks/blockTypes';
import { TILE_NAMES, getTilePixels } from '../blocks/textures';
import { hasLook } from '../../proto/voxel/looks';
import { sampleSurface, newSample } from '../micro/microSurface';
import { microTerrain, scanColumn, worldColumnSource, type ColumnInfo } from '../micro/worldColumns';
import type { ArrayVoxelWorld } from '../VoxelWorld';
import { AO_LEVELS, FACE_NAMES, faceShadeTable, type FaceName } from './config';
import { FACES, flatAoFlip, flatAoLevels, flatInterp } from './meshChunk';
import { aoAtCell, occGet } from './voxel/ao';
import { aoFadeFactor, aoUniforms } from './voxel/aoUniforms';
import { pixelInTile, rowCodeOf, terrainKindOf, terrainSideRow, tileIndexOf, tileSlot } from './voxel/projection';
import type { ChunkStats, WorldRenderer } from './WorldRenderer';

/**
 * window.__rikkun.render.*（TEX-A の hook。docs/tickets/TEX-A.md「テストが使う hook」）。
 * texelAt・aoAt は シェーダーと同じ式の TypeScript 写し（projection.ts・ao.ts）で、画面の画素とくらべるために使う。
 */
export interface BlobHookInfo {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  size: number;
  opacity: number;
  renderOrder: number;
  spriteRenderOrder: number;
  transparent: boolean;
}

export interface RenderHookDeps {
  world: ArrayVoxelWorld;
  renderer: WorldRenderer;
  gl: WebGLRenderer;
  camera: PerspectiveCamera;
  /** いま 1 回 描く */
  renderNow(): void;
  blob: { info(): BlobHookInfo; setEnabled(on: boolean): void };
  chunks(): ChunkStats;
  /** #76 かすみ・空の色・人形の明るさ（テストが読む） */
  env(): { fog: { near: number; far: number; colorHex: number } | null; backgroundHex: number | null; dollBrightness: number };
}

const DIR: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const SEC = 144; // 1 セクション = 16 ブロック = 144 小ブロック

export interface Texel {
  tile: string;
  px: number;
  py: number;
  rgb: [number, number, number];
}

export function createRenderHook(d: RenderHookDeps) {
  const { world, renderer } = d;
  const info: ColumnInfo = { ty: -1, kind: 0, reach: 0, rockOk: false };
  const sample = newSample();
  const colSrc = worldColumnSource(world);

  /** 小ブロック (cx, cy, cz)（ワールド全体の座標）が うまっているか。小ブロックの段の面があれば その「うまり」。無ければ undefined */
  function occAt(cx: number, cy: number, cz: number): boolean | undefined {
    const sx = Math.floor(cx / SEC);
    const sy = Math.floor(cy / SEC);
    const sz = Math.floor(cz / SEC);
    let had = false;
    for (const cand of [sy, sy - 1]) {
      if (cand < 0) continue;
      const occ = renderer.occupancyOf(sx, cand, sz);
      if (!occ) continue;
      had = true;
      if (occGet(occ, cx - sx * SEC, cy - cand * SEC, cz - sz * SEC)) return true;
    }
    return had ? false : undefined;
  }

  /** そのセクションの小ブロックの段か（平らな箱の AO は 小ブロックの段だけ） */
  function microAt(bx: number, by: number, bz: number): boolean {
    return renderer.sectionInfo(Math.floor(bx / 16), Math.floor(by / 16), Math.floor(bz / 16)).tier === 'micro';
  }

  function blockSolid(bx: number, by: number, bz: number): boolean {
    const b = world.getIndex(bx, by, bz);
    return b > 0 && isOpaqueIndex(b);
  }

  function solidCell(cx: number, cy: number, cz: number): boolean {
    const o = occAt(cx, cy, cz);
    if (o !== undefined) return o;
    return blockSolid(Math.floor(cx / 9), Math.floor(cy / 9), Math.floor(cz / 9));
  }

  /** 面の平面の上の点 → その面を作っている「見える表面」の小ブロック（へこみの底・地形のでこぼこも）。無ければ null */
  function surfaceCell(x: number, y: number, z: number, f: number): [number, number, number] | null {
    const n = DIR[f];
    const c: [number, number, number] = [
      Math.floor(x * 9 - 0.5 * n[0] + (n[0] === 0 ? 1e-6 : 0)),
      Math.floor(y * 9 - 0.5 * n[1] + (n[1] === 0 ? 1e-6 : 0)),
      Math.floor(z * 9 - 0.5 * n[2] + (n[2] === 0 ? 1e-6 : 0)),
    ];
    if (solidCell(c[0], c[1], c[2])) {
      for (let i = 0; i < 12; i++) {
        if (!solidCell(c[0] + n[0], c[1] + n[1], c[2] + n[2])) break;
        c[0] += n[0];
        c[1] += n[1];
        c[2] += n[2];
      }
      return c;
    }
    for (let i = 0; i < 12; i++) {
      c[0] -= n[0];
      c[1] -= n[1];
      c[2] -= n[2];
      if (solidCell(c[0], c[1], c[2])) return c;
    }
    return null;
  }

  /** 小ブロックの種類・行の符号（小ブロック地形のマスなら）。段が小ブロックでなければ、ブロックの種類 */
  function cellKind(cx: number, cy: number, cz: number): { kind: number; rowCode: number | null } {
    const bx = Math.floor(cx / 9);
    const by = Math.floor(cy / 9);
    const bz = Math.floor(cz / 9);
    if (occAt(cx, cy, cz) !== undefined) {
      scanColumn(world, bx, bz, info);
      if (info.ty >= 0 && cy >= info.ty * 9) {
        sampleSurface(cx, cz, colSrc, sample);
        if (sample.h > cy) {
          const fromTop = sample.h - 1 - cy;
          return { kind: terrainKindOf(info.kind, fromTop, sample.rock && cy >= sample.ground, cx, cz), rowCode: rowCodeOf(fromTop) };
        }
      }
    }
    return { kind: world.getIndex(bx, by, bz), rowCode: null };
  }

  function isFlat(kind: number): boolean {
    return kind > 0 && isOpaqueIndex(kind) && !hasLook(kind);
  }

  function texelAt(x: number, y: number, z: number, face: FaceName): Texel {
    const f = FACE_NAMES.indexOf(face);
    const n = DIR[f];
    const none: Texel = { tile: '', px: 0, py: 0, rgb: [0, 0, 0] };
    // 平らな箱・箱の段・小ブロックの面がないとき: ブロックの面そのもの
    const inside = [Math.floor(x - n[0] * 0.001), Math.floor(y - n[1] * 0.001), Math.floor(z - n[2] * 0.001)];
    const blockKind = world.getIndex(inside[0], inside[1], inside[2]);
    let cell: [number, number, number] | null = isFlat(blockKind) ? null : surfaceCell(x, y, z, f);
    if (!cell) cell = [inside[0] * 9 + 4, inside[1] * 9 + 4, inside[2] * 9 + 4];
    const { kind, rowCode } = isFlat(blockKind) ? { kind: blockKind, rowCode: null } : cellKind(cell[0], cell[1], cell[2]);
    let tile = tileIndexOf(kind, tileSlot(f));
    if (tile < 0) return none;
    const q = [x - n[0] * 0.001, y - n[1] * 0.001, z - n[2] * 0.001];
    const fr = [q[0] - Math.floor(q[0]), q[1] - Math.floor(q[1]), q[2] - Math.floor(q[2])];
    let { px, py } = pixelInTile(f, fr[0], fr[1], fr[2]);
    if (rowCode !== null && f >= 2) {
      const fy = y * 9 - Math.floor(y * 9);
      const r = terrainSideRow(kind, rowCode, fy, tile);
      tile = r.tile;
      py = r.py;
    }
    const p = getTilePixels(TILE_NAMES[tile])[py * 16 + px];
    return { tile: TILE_NAMES[tile], px, py, rgb: [p[0], p[1], p[2]] };
  }

  function aoOn(): boolean {
    return aoUniforms.on.value > 0.5;
  }

  function fadeAt(x: number, z: number): number {
    const v = renderer.viewerNow();
    if (!v) return 1;
    return aoFadeFactor(Math.hypot(x - v.x, z - v.z), renderer.microRadiusNow);
  }

  function aoAt(x: number, y: number, z: number, face: FaceName): number {
    if (!aoOn()) return 1;
    const f = FACE_NAMES.indexOf(face);
    const n = DIR[f];
    // 平らな箱の面
    const bx = Math.floor(x - n[0] * 0.001);
    const by = Math.floor(y - n[1] * 0.001);
    const bz = Math.floor(z - n[2] * 0.001);
    const kind = world.getIndex(bx, by, bz);
    if (isFlat(kind)) {
      if (!microAt(bx, by, bz)) return 1;
      const lv = [0, 0, 0, 0];
      flatAoLevels(world, bx, by, bz, FACES[f], lv);
      const fx = x - Math.floor(x);
      const fy = y - Math.floor(y);
      const fz = z - Math.floor(z);
      const st: [number, number] =
        f === 0 ? [fx, 1 - fz] : f === 1 ? [fx, fz] : f === 2 ? [1 - fz, fy] : f === 3 ? [fz, fy] : f === 4 ? [fx, fy] : [1 - fx, fy];
      const v = lv.map((l) => AO_LEVELS[l]);
      const a = flatInterp(v, flatAoFlip(lv), Math.min(1, Math.max(0, st[0])), Math.min(1, Math.max(0, st[1])));
      return 1 + (a - 1) * fadeAt(x, z);
    }
    const cell = surfaceCell(x, y, z, f);
    if (!cell) return 1;
    // うまりを持っているセクション（その小ブロックが うまっている方）
    const sx = Math.floor(cell[0] / SEC);
    const sz = Math.floor(cell[2] / SEC);
    const sy0 = Math.floor(cell[1] / SEC);
    for (const sy of [sy0, sy0 - 1]) {
      if (sy < 0) continue;
      const occ = renderer.occupancyOf(sx, sy, sz);
      if (!occ) continue;
      const lx = cell[0] - sx * SEC;
      const ly = cell[1] - sy * SEC;
      const lz = cell[2] - sz * SEC;
      if (!occGet(occ, lx, ly, lz)) continue;
      const s = [x * 9 - cell[0], y * 9 - cell[1], z * 9 - cell[2]];
      const clamp = (v: number): number => Math.min(1, Math.max(0, v));
      // 面の中の 2 つの軸（ao.ts の AXES: 上下 = x, z / 東西 = z, y / 南北 = x, y）
      const [fa, fb] = f < 2 ? [s[0], s[2]] : f < 4 ? [s[2], s[1]] : [s[0], s[1]];
      const a = aoAtCell(occ, lx, ly, lz, f, clamp(fa), clamp(fb));
      return 1 + (a - 1) * fadeAt(x, z);
    }
    return 1;
  }

  const tmp = new Vector3();
  function toScreen(x: number, y: number, z: number): { x: number; y: number; onScreen: boolean } {
    const cam = d.camera;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    tmp.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    const inFront = tmp.z < 0;
    tmp.applyMatrix4(cam.projectionMatrix);
    const el = d.gl.domElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const sx = (tmp.x * 0.5 + 0.5) * w;
    const sy = (1 - (tmp.y * 0.5 + 0.5)) * h;
    return { x: sx, y: sy, onScreen: inFront && sx >= 0 && sy >= 0 && sx < w && sy < h };
  }

  const px1 = new Uint8Array(4);
  function pixel(sx: number, sy: number): [number, number, number] {
    d.renderNow();
    const el = d.gl.domElement;
    const k = el.width / el.clientWidth;
    const x = Math.min(el.width - 1, Math.max(0, Math.floor(sx * k)));
    const y = Math.min(el.height - 1, Math.max(0, el.height - 1 - Math.floor(sy * k)));
    const gl = d.gl.getContext();
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
    return [px1[0], px1[1], px1[2]];
  }

  return {
    chunks: () => d.chunks(),
    /** scene.fog・scene.background・人形の明るさ（#76） */
    env: () => d.env(),
    faceShade: () => faceShadeTable(),
    /** 平らな箱で描く id（小ブロックの形を持たない固いブロック） */
    flatBlocks: (): string[] => BLOCK_TYPES.filter((_, i) => isFlat(i)).map((t) => t.id as string),
    texelAt,
    aoAt,
    toScreen,
    pixel,
    blobShadow: () => d.blob.info(),
    aoStats: () => renderer.aoStats(),
    /** PERF-2: 見えているセクションのメッシュ（全部の attribute・index のバイト・うまり）の FNV-1a（セクションの鍵の順） */
    meshDigest: () => renderer.meshDigest(),
    setAo: (on: boolean) => {
      aoUniforms.on.value = on ? 1 : 0;
    },
    setBlobShadow: (on: boolean) => d.blob.setEnabled(on),
    /** テスト用: 小ブロック地形（地面の でこぼこの高さ）の入り切り。切ると 地面も ふつうの形のブロック（へこみは 1〜3 マスだけ）になる */
    setTerrain: (on: boolean) => {
      microTerrain.enabled = on;
      renderer.rebuildAll();
    },
  };
}


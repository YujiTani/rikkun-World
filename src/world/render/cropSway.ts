import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type MeshBasicMaterial } from 'three';
import { pushCross, type MeshData } from './meshChunk';
import type { TileName } from '../blocks/textures';

/**
 * なでた 作物 の ゆれ（M7-2 §3.4）。ゆれている 間 だけ、その マス の 十字の板 を 専用の 1 メッシュ で 描く。
 * チャンク 側 の 板 は `hide` で 隠す（ゆれ の はじまり と おわり に そのチャンク を 1 回ずつ 作り直す）。
 * 同時 に ゆれる のは `SWAY_POOL_MAX` 本 まで（それ以上 は 揺らさず 元の 板 のまま）。描画 +1（ゆれ が 無ければ 0）。
 */

export const SWAY_POOL_MAX = 8;
/** 1 本 = 十字 2 まい × 表裏 = 4 面 */
const QUADS = 4;

export interface SwayItem {
  x: number;
  y: number;
  z: number;
  deg: number;
  tile: TileName;
  sky: number;
  blk: number;
}

const scratch: MeshData = { positions: [], uvs: [], colors: [], lights: [], darks: [], indices: [], faceCount: 0 };

/**
 * 1 本 分 の 頂点（4 面 × 4 角）を out に 書く。足もと（マスの まん中 の 下）を 軸 に、z 軸まわり に deg 度 かたむける。
 * 戻り値 = 書いた 頂点数（16）。
 */
export function writeSwayVertices(
  item: SwayItem,
  pos: Float32Array,
  uv: Float32Array,
  col: Float32Array,
  light: Float32Array,
  vOffset: number,
): number {
  scratch.positions.length = 0;
  scratch.uvs.length = 0;
  scratch.colors.length = 0;
  scratch.lights.length = 0;
  scratch.darks.length = 0;
  scratch.indices.length = 0;
  scratch.faceCount = 0;
  pushCross(scratch, item.x, item.y, item.z, item.tile, item.sky, item.blk);
  const r = (item.deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const ox = item.x + 0.5;
  const oy = item.y;
  const n = scratch.positions.length / 3;
  for (let i = 0; i < n; i++) {
    const dx = scratch.positions[i * 3] - ox;
    const dy = scratch.positions[i * 3 + 1] - oy;
    const v = vOffset + i;
    pos[v * 3] = ox + dx * c - dy * s;
    pos[v * 3 + 1] = oy + dx * s + dy * c;
    pos[v * 3 + 2] = scratch.positions[i * 3 + 2];
    uv[v * 2] = scratch.uvs[i * 2];
    uv[v * 2 + 1] = scratch.uvs[i * 2 + 1];
    col[v * 3] = scratch.colors[i * 3];
    col[v * 3 + 1] = scratch.colors[i * 3 + 1];
    col[v * 3 + 2] = scratch.colors[i * 3 + 2];
    light[v * 2] = scratch.lights[i * 2];
    light[v * 2 + 1] = scratch.lights[i * 2 + 1];
  }
  return n;
}

export class CropSwayMesh {
  readonly mesh: Mesh;
  private readonly pos = new Float32Array(SWAY_POOL_MAX * QUADS * 4 * 3);
  private readonly uv = new Float32Array(SWAY_POOL_MAX * QUADS * 4 * 2);
  private readonly col = new Float32Array(SWAY_POOL_MAX * QUADS * 4 * 3);
  private readonly light = new Float32Array(SWAY_POOL_MAX * QUADS * 4 * 2);
  private readonly attrs: BufferAttribute[];
  private readonly geo = new BufferGeometry();
  /** いま 描いている 本数 */
  count = 0;

  constructor(material: MeshBasicMaterial) {
    this.attrs = [
      new BufferAttribute(this.pos, 3),
      new BufferAttribute(this.uv, 2),
      new BufferAttribute(this.col, 3),
      new BufferAttribute(this.light, 2),
    ];
    for (const a of this.attrs) a.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', this.attrs[0]);
    this.geo.setAttribute('uv', this.attrs[1]);
    this.geo.setAttribute('color', this.attrs[2]);
    this.geo.setAttribute('aLight', this.attrs[3]);
    const idx = new Uint16Array(SWAY_POOL_MAX * QUADS * 6);
    for (let q = 0; q < SWAY_POOL_MAX * QUADS; q++) {
      const b = q * 4;
      idx.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
    }
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** 最初の SWAY_POOL_MAX 本 まで 描く。戻り値 = 描いた 本数 */
  set(items: ReadonlyArray<SwayItem>): number {
    const n = Math.min(items.length, SWAY_POOL_MAX);
    for (let i = 0; i < n; i++) writeSwayVertices(items[i], this.pos, this.uv, this.col, this.light, i * QUADS * 4);
    this.count = n;
    this.mesh.visible = n > 0;
    this.geo.setDrawRange(0, n * QUADS * 6);
    if (n > 0) for (const a of this.attrs) a.needsUpdate = true;
    return n;
  }

  dispose(): void {
    this.geo.dispose();
  }
}

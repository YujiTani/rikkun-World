import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  type Material,
} from 'three';
import { BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { WATER_ALPHA, createAtlasTexture } from '../../world/blocks/textures';
import { generateIsland } from '../../world/gen/generateIsland';
import { CHUNK_DRAW_DISTANCE, RENDER_CONFIG } from '../../world/render/config';
import { meshChunkLod } from '../../world/render/lodMesh';
import { meshChunk, type MeshData } from '../../world/render/meshChunk';
import { chunkNearDistance } from '../../world/render/visibility';
import { ArrayVoxelWorld, CHUNK_SIZE } from '../../world/VoxelWorld';
import { GEN_CONFIG } from '../../world/gen/config';
import type { IslandInfo } from '../../contracts';
import { VoxelChunkMesher, type QuadMesh } from './meshVoxel';
import { createShapeTexture } from './shapeTexture';
import { createVoxelMaterial } from './voxelMaterial';

export type ProtoMode = 'current' | 'naive' | 'greedyColor' | 'greedyShape';
export const PROTO_MODES: readonly ProtoMode[] = ['current', 'naive', 'greedyColor', 'greedyShape'];

interface Built {
  meshes: Mesh[];
  bytes: number;
}

function bytesOf(g: BufferGeometry): number {
  let n = g.index ? g.index.array.byteLength : 0;
  for (const k of Object.keys(g.attributes)) n += (g.attributes[k] as BufferAttribute).array.byteLength;
  return n;
}

function geometryFromMeshData(d: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(d.positions), 3));
  if (d.uvs.length > 0) g.setAttribute('uv', new BufferAttribute(new Float32Array(d.uvs), 2));
  if (d.colors.length > 0) g.setAttribute('color', new BufferAttribute(new Float32Array(d.colors), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(d.indices), 1));
  return g;
}

function geometryFromQuads(q: QuadMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(q.positions, 3));
  g.setAttribute('aData', new BufferAttribute(q.data, 4, false));
  g.setIndex(new BufferAttribute(q.indices, 1));
  return g;
}

/** 島の世界と、方式ごとのチャンクのメッシュ（ゲーム本体とは別。光なし） */
export class ProtoScene {
  readonly scene = new Scene();
  readonly world = new ArrayVoxelWorld();
  readonly island: IslandInfo;
  mode: ProtoMode;
  /** 直近の「足りないチャンクを作った」時間と数 */
  lastBuild = { ms: 0, chunks: 0 };
  lastRebuildMs = 0;

  private readonly root = new Group();
  private readonly near: (Built | null)[];
  private readonly far: (Built | null)[];
  private readonly mesher: VoxelChunkMesher;
  private readonly count: number;
  private viewer = { x: Number.NaN, z: Number.NaN };

  private readonly atlasOpaque: MeshBasicMaterial;
  private readonly atlasWater: MeshBasicMaterial;
  private readonly flatWater: MeshBasicMaterial;
  private readonly lodOpaque: MeshBasicMaterial;
  private readonly lodWater: MeshBasicMaterial;
  private readonly colorMat;
  private readonly shapeMat;

  constructor(mode: ProtoMode, seed: number = GEN_CONFIG.defaultSeed) {
    this.mode = mode;
    this.island = generateIsland(seed, this.world);
    this.mesher = new VoxelChunkMesher(this.world);
    this.count = this.world.chunksX * this.world.chunksZ;
    this.near = new Array<Built | null>(this.count).fill(null);
    this.far = new Array<Built | null>(this.count).fill(null);
    this.scene.add(this.root);
    const atlas = createAtlasTexture();
    this.atlasOpaque = new MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
    this.atlasWater = new MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
    this.flatWater = new MeshBasicMaterial({ color: 0x2f6fe0, transparent: true, opacity: WATER_ALPHA, depthWrite: false, side: DoubleSide });
    this.lodOpaque = new MeshBasicMaterial({ vertexColors: true });
    this.lodWater = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: WATER_ALPHA, depthWrite: false, side: DoubleSide });
    this.colorMat = createVoxelMaterial();
    this.shapeMat = createVoxelMaterial(createShapeTexture(BLOCK_TYPES.length));
  }

  private make(geo: BufferGeometry, mat: Material, order = 0): Mesh {
    geo.computeBoundingSphere();
    const m = new Mesh(geo, mat);
    m.renderOrder = order;
    this.root.add(m);
    return m;
  }

  private buildNear(i: number): Built {
    const cx = i % this.world.chunksX;
    const cz = Math.floor(i / this.world.chunksX);
    const meshes: Mesh[] = [];
    let bytes = 0;
    const add = (geo: BufferGeometry, mat: Material, order = 0): void => {
      bytes += bytesOf(geo);
      meshes.push(this.make(geo, mat, order));
    };
    if (this.mode === 'current') {
      const d = meshChunk(this.world, cx, cz);
      if (d.opaque.faceCount > 0) add(geometryFromMeshData(d.opaque), this.atlasOpaque);
      if (d.water.faceCount > 0) add(geometryFromMeshData(d.water), this.atlasWater, RENDER_CONFIG.waterRenderOrder);
    } else {
      const d = this.mesher.build(cx, cz, this.mode);
      if (d.solid.faces > 0) add(geometryFromQuads(d.solid), this.mode === 'greedyShape' ? this.shapeMat : this.colorMat);
      if (d.cross.faceCount > 0) add(geometryFromMeshData(d.cross), this.atlasOpaque);
      if (d.water.faceCount > 0) add(geometryFromMeshData(d.water), this.flatWater, RENDER_CONFIG.waterRenderOrder);
    }
    return { meshes, bytes };
  }

  private buildFar(i: number): Built {
    const cx = i % this.world.chunksX;
    const cz = Math.floor(i / this.world.chunksX);
    const d = meshChunkLod(this.world, cx, cz);
    const meshes: Mesh[] = [];
    let bytes = 0;
    if (d.opaque.faceCount > 0) {
      const g = geometryFromMeshData(d.opaque);
      bytes += bytesOf(g);
      meshes.push(this.make(g, this.lodOpaque));
    }
    if (d.water.faceCount > 0) {
      const g = geometryFromMeshData(d.water);
      bytes += bytesOf(g);
      meshes.push(this.make(g, this.lodWater, RENDER_CONFIG.waterRenderOrder));
    }
    return { meshes, bytes };
  }

  private drop(b: Built | null): void {
    if (!b) return;
    for (const m of b.meshes) {
      this.root.remove(m);
      m.geometry.dispose();
    }
  }

  private show(b: Built | null, v: boolean): void {
    if (b) for (const m of b.meshes) m.visible = v;
  }

  /** 方式をかえる。近くのメッシュを捨てる（遠くの LOD は どの方式でも同じなので のこす） */
  setMode(mode: ProtoMode): void {
    this.mode = mode;
    for (let i = 0; i < this.count; i++) {
      this.drop(this.near[i]);
      this.near[i] = null;
    }
    this.viewer = { x: Number.NaN, z: Number.NaN };
  }

  clearAll(): void {
    for (let i = 0; i < this.count; i++) {
      this.drop(this.near[i]);
      this.drop(this.far[i]);
      this.near[i] = null;
      this.far[i] = null;
    }
    this.viewer = { x: Number.NaN, z: Number.NaN };
  }

  /** カメラの水平の位置から、どのチャンクをどの形で描くか決め、足りないぶんを作る */
  update(x: number, z: number): void {
    if (this.viewer.x === x && this.viewer.z === z) return;
    this.viewer = { x, z };
    const t0 = performance.now();
    let built = 0;
    for (let i = 0; i < this.count; i++) {
      const cx = i % this.world.chunksX;
      const cz = Math.floor(i / this.world.chunksX);
      const d = chunkNearDistance(cx, cz, x, z, CHUNK_SIZE);
      const inRange = d <= CHUNK_DRAW_DISTANCE;
      const isNear = inRange && d <= RENDER_CONFIG.lodDistance;
      const isFar = inRange && !isNear;
      if (isNear && !this.near[i]) {
        this.near[i] = this.buildNear(i);
        built++;
      }
      if (isFar && !this.far[i]) {
        this.far[i] = this.buildFar(i);
        built++;
      }
      this.show(this.near[i], isNear);
      this.show(this.far[i], isFar);
    }
    if (built > 0) this.lastBuild = { ms: performance.now() - t0, chunks: built };
  }

  /** そのチャンクの近くのメッシュを作り直す。かかったミリ秒を返す */
  rebuildChunk(cx: number, cz: number): number {
    const i = cz * this.world.chunksX + cx;
    const t0 = performance.now();
    const old = this.near[i];
    const next = this.buildNear(i);
    this.drop(old);
    this.near[i] = next;
    const ms = performance.now() - t0;
    this.lastRebuildMs = ms;
    // 今の見え方をたもつ
    const d = chunkNearDistance(cx, cz, this.viewer.x, this.viewer.z, CHUNK_SIZE);
    this.show(next, d <= RENDER_CONFIG.lodDistance);
    return ms;
  }

  /** 見えているメッシュのバッファの合計バイト */
  visibleBytes(): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      for (const b of [this.near[i], this.far[i]]) {
        if (b && b.meshes.length > 0 && b.meshes[0].visible) n += b.bytes;
      }
    }
    return n;
  }

  /** 見えているチャンクの数（近く・遠く） */
  chunkCounts(): { near: number; far: number } {
    let near = 0;
    let far = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.near[i]?.meshes[0]?.visible) near++;
      if (this.far[i]?.meshes[0]?.visible) far++;
    }
    return { near, far };
  }
}

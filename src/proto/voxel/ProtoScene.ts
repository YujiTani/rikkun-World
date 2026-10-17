import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Color,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  type Material,
} from 'three';
import { BLOCK_INDEX, BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { WATER_ALPHA, createAtlasTexture } from '../../world/blocks/textures';
import { populateWorld } from '../../world/gen/populate';
import { CHUNK_DRAW_DISTANCE, RENDER_CONFIG } from '../../world/render/config';
import { meshChunkLod } from '../../world/render/lodMesh';
import { meshChunk, type MeshData } from '../../world/render/meshChunk';
import { chunkNearDistance } from '../../world/render/visibility';
import { ArrayVoxelWorld, CHUNK_SIZE } from '../../world/VoxelWorld';
import { GEN_CONFIG } from '../../world/gen/config';
import type { IslandInfo } from '../../contracts';
import { VoxelChunkMesher, type QuadPiece, type VoxelMode } from './meshVoxel';
import { createShapeTexture } from './shapeTexture';
import { createVoxelMaterial, setVoxelFog } from './voxelMaterial';
import { currentLook, setCurrentLook } from './looks';
import type { Data3DTexture } from 'three';
import { stretchHeight, type HeightFactor } from './terrain/stretchHeight';

export type ProtoMode = 'current' | 'naive' | 'greedyColor' | 'greedyShape' | 'hybrid';
export const PROTO_MODES: readonly ProtoMode[] = ['current', 'naive', 'greedyColor', 'greedyShape', 'hybrid'];
/** 地面の作り方: block = 1 ブロックごとの段々（今まで）/ micro = 表面を小ブロック単位で決める（VOX-2） */
export type TerrainMode = 'block' | 'micro';
export const TERRAIN_MODES: readonly TerrainMode[] = ['micro', 'block'];
export const MICRO_RADII = [16, 24, 32] as const;

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

function geometryFromPiece(q: QuadPiece): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(q.positions, 3));
  g.setAttribute('aData', new BufferAttribute(q.data, 4, false));
  g.setIndex(new BufferAttribute(q.indices, 1));
  return g;
}

type Tier = 'micro' | 'box' | 'lod' | null;

/** 島の世界と、方式ごとのチャンクのメッシュ（ゲーム本体とは別。光なし） */
export class ProtoScene {
  readonly scene = new Scene();
  readonly world: ArrayVoxelWorld;
  readonly island: IslandInfo;
  /** 高さの倍率（VOX-3）。1 = 今のまま */
  readonly height: HeightFactor;
  /** のばす前の島（スポーン地点などを読む） */
  readonly baseWorld = new ArrayVoxelWorld({ x: 0, z: 0 });
  mode: ProtoMode;
  terrain: TerrainMode = 'block';
  /** hybrid: カメラからこの距離（ブロック）以内のチャンクだけ 小ブロックの形 */
  microRadius = 16;
  /** 直近の「足りないチャンクを作った」時間と数 */
  lastBuild = { ms: 0, chunks: 0 };
  lastRebuildMs = 0;

  /** スタート地点（のばした世界の地面の上） */
  spawn(): { x: number; y: number; z: number } {
    const s = this.island.spawn();
    for (let y = this.world.size.y - 1; y >= 0; y--) {
      if (this.world.isSolid(Math.floor(s.x), y, Math.floor(s.z))) return { x: s.x, y: y + 1, z: s.z };
    }
    return s;
  }

  /** (x, z) の地面の上の y（固いブロックのいちばん上 + 1） */
  groundY(x: number, z: number): number {
    for (let y = this.world.size.y - 1; y >= 0; y--) {
      if (this.world.isSolid(Math.floor(x), y, Math.floor(z))) return y + 1;
    }
    return 0;
  }

  /** 世界でいちばん高い地面の列（岩山のてっぺん。木の葉は除く） */
  highestPoint(): { x: number; y: number; z: number } {
    const leaves = BLOCK_INDEX.leaves;
    const log = BLOCK_INDEX.log;
    let best = { x: 0, y: -1, z: 0 };
    for (let z = 0; z < this.world.loadedBounds().z1; z++) {
      for (let x = 0; x < this.world.loadedBounds().x1; x++) {
        for (let y = this.world.size.y - 1; y > best.y; y--) {
          const k = this.world.getIndex(x, y, z);
          if (k > 0 && this.world.isSolid(x, y, z) && k !== leaves && k !== log) {
            best = { x: x + 0.5, y: y + 1, z: z + 0.5 };
            break;
          }
        }
      }
    }
    return best;
  }

  private readonly root = new Group();
  /** 小ブロックの形（current のときは今のメッシュ） */
  private readonly micro: (Built | null)[];
  /** hybrid の中くらい: 形は 1 マスの箱、色だけ 9×9 の模様 */
  private readonly box: (Built | null)[];
  private readonly far: (Built | null)[];
  private readonly mesher: VoxelChunkMesher;
  private readonly count: number;
  private viewer = { x: Number.NaN, z: Number.NaN };
  private pending = false;

  private readonly atlasOpaque: MeshBasicMaterial;
  private readonly atlasWater: MeshBasicMaterial;
  private readonly flatWater: MeshBasicMaterial;
  private readonly lodOpaque: MeshBasicMaterial;
  private readonly lodWater: MeshBasicMaterial;
  private readonly colorMat;
  private readonly shapeMat;
  private shapeTex: Data3DTexture;

  constructor(mode: ProtoMode, seed: number = GEN_CONFIG.defaultSeed, height: HeightFactor = 1) {
    this.mode = mode;
    this.height = height;
    this.island = populateWorld(this.baseWorld, seed);
    this.world = height === 1 ? this.baseWorld : stretchHeight(this.baseWorld, height);
    this.mesher = new VoxelChunkMesher(this.world);
    this.count = this.world.chunksX * this.world.chunksZ;
    this.micro = new Array<Built | null>(this.count).fill(null);
    this.box = new Array<Built | null>(this.count).fill(null);
    this.far = new Array<Built | null>(this.count).fill(null);
    this.scene.add(this.root);
    const atlas = createAtlasTexture();
    this.atlasOpaque = new MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
    this.atlasWater = new MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
    this.flatWater = new MeshBasicMaterial({ color: 0x2f6fe0, transparent: true, opacity: WATER_ALPHA, depthWrite: false, side: DoubleSide });
    this.lodOpaque = new MeshBasicMaterial({ vertexColors: true });
    this.lodWater = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: WATER_ALPHA, depthWrite: false, side: DoubleSide });
    this.colorMat = createVoxelMaterial();
    this.shapeTex = createShapeTexture(BLOCK_TYPES.length);
    this.shapeMat = createVoxelMaterial(this.shapeTex);
    this.applyLookColors();
  }

  /** 空・霧を いまの Look にあわせる */
  private applyLookColors(): void {
    const look = currentLook();
    this.scene.background = new Color(look.sky);
    this.scene.fog = new Fog(look.fog.color, look.fog.near, look.fog.far);
    setVoxelFog(this.shapeMat, look.fog);
    setVoxelFog(this.colorMat, look.fog);
  }

  /** 見た目をかえる: 3D テクスチャと近くのメッシュを作り直す（遠くの LOD は Look に依らないので のこす） */
  setLook(id: string): void {
    setCurrentLook(id);
    this.shapeTex.dispose();
    this.shapeTex = createShapeTexture(BLOCK_TYPES.length);
    this.shapeMat.uniforms.uTex.value = this.shapeTex;
    this.applyLookColors();
    this.setMode(this.mode); // 近くのメッシュを捨てて、次の update で作る
  }

  private make(geo: BufferGeometry, mat: Material, order = 0, chunk?: { cx: number; cz: number }): Mesh {
    geo.computeBoundingSphere();
    const m = new Mesh(geo, mat);
    m.renderOrder = order;
    if (chunk) {
      // 小ブロック座標（Uint16）のメッシュ: 1/9 倍して、チャンクの位置に置く
      m.scale.setScalar(1 / 9);
      m.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
      m.updateMatrixWorld(true);
    }
    this.root.add(m);
    return m;
  }

  private buildVoxel(i: number, mode: VoxelMode): Built {
    const cx = i % this.world.chunksX;
    const cz = Math.floor(i / this.world.chunksX);
    const meshes: Mesh[] = [];
    let bytes = 0;
    const add = (geo: BufferGeometry, mat: Material, order = 0, chunk?: { cx: number; cz: number }): void => {
      bytes += bytesOf(geo);
      meshes.push(this.make(geo, mat, order, chunk));
    };
    const d = this.mesher.build(cx, cz, mode, this.terrain === 'micro');
    const mat = mode === 'greedyShape' || mode === 'box' ? this.shapeMat : this.colorMat;
    for (const piece of d.solid.pieces) add(geometryFromPiece(piece), mat, 0, { cx, cz });
    for (const piece of d.solidColor.pieces) add(geometryFromPiece(piece), this.colorMat, 0, { cx, cz });
    if (d.cross.faceCount > 0) add(geometryFromMeshData(d.cross), this.atlasOpaque);
    if (d.water.faceCount > 0) add(geometryFromMeshData(d.water), this.flatWater, RENDER_CONFIG.waterRenderOrder);
    return { meshes, bytes };
  }

  private buildMicro(i: number): Built {
    if (this.mode === 'current') {
      const cx = i % this.world.chunksX;
      const cz = Math.floor(i / this.world.chunksX);
      const meshes: Mesh[] = [];
      let bytes = 0;
      const d = meshChunk(this.world, cx, cz);
      if (d.opaque.faceCount > 0) {
        const g = geometryFromMeshData(d.opaque);
        bytes += bytesOf(g);
        meshes.push(this.make(g, this.atlasOpaque));
      }
      if (d.water.faceCount > 0) {
        const g = geometryFromMeshData(d.water);
        bytes += bytesOf(g);
        meshes.push(this.make(g, this.atlasWater, RENDER_CONFIG.waterRenderOrder));
      }
      return { meshes, bytes };
    }
    return this.buildVoxel(i, this.mode === 'hybrid' ? 'greedyShape' : this.mode);
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
      this.drop(this.micro[i]);
      this.drop(this.box[i]);
      this.micro[i] = null;
      this.box[i] = null;
    }
    this.viewer = { x: Number.NaN, z: Number.NaN };
  }

  /** 地面の作り方をかえる。近くのメッシュを捨てて、次の update で作り直す */
  setTerrain(t: TerrainMode): void {
    this.terrain = t;
    this.setMode(this.mode);
  }

  /** hybrid の 16 / 24 / 32。メッシュは捨てず、チャンクごとの切りかえだけ変わる */
  setMicroRadius(r: number): void {
    this.microRadius = r;
    this.viewer = { x: Number.NaN, z: Number.NaN };
  }

  clearAll(): void {
    for (let i = 0; i < this.count; i++) {
      this.drop(this.micro[i]);
      this.drop(this.box[i]);
      this.drop(this.far[i]);
      this.micro[i] = null;
      this.box[i] = null;
      this.far[i] = null;
    }
    this.viewer = { x: Number.NaN, z: Number.NaN };
  }

  private tierOf(d: number): Tier {
    if (d > CHUNK_DRAW_DISTANCE) return null;
    if (d > RENDER_CONFIG.lodDistance) return 'lod';
    if (this.mode === 'hybrid' && d > this.microRadius) return 'box';
    return 'micro';
  }

  /**
   * カメラの水平の位置から、どのチャンクをどの形で描くか決め、足りないぶんを作る。
   * maxBuilds: 1 回に作るチャンクの数（遊ぶときは 2。計測は無制限）。足りないぶんは次の呼び出しで作る。
   */
  update(x: number, z: number, maxBuilds = Number.POSITIVE_INFINITY): void {
    if (!this.pending && this.viewer.x === x && this.viewer.z === z) return;
    const t0 = performance.now();
    let built = 0;
    let pending = false;
    // 近いチャンクから先に作る
    const order: { i: number; d: number }[] = [];
    for (let i = 0; i < this.count; i++) {
      const cx = i % this.world.chunksX;
      const cz = Math.floor(i / this.world.chunksX);
      order.push({ i, d: chunkNearDistance(cx, cz, x, z, CHUNK_SIZE) });
    }
    order.sort((a, b) => a.d - b.d);
    for (const { i, d } of order) {
      const tier = this.tierOf(d);
      const want: [Tier, (Built | null)[]][] = [['micro', this.micro], ['box', this.box], ['lod', this.far]];
      let shown = false;
      for (const [name, arr] of want) {
        if (name === tier && !arr[i]) {
          if (built < maxBuilds) {
            arr[i] = name === 'micro' ? this.buildMicro(i) : name === 'box' ? this.buildVoxel(i, 'box') : this.buildFar(i);
            built++;
          } else pending = true;
        }
        const ready = name === tier && arr[i] !== null;
        this.show(arr[i], ready);
        if (ready) shown = true;
      }
      // まだ作っていないあいだは、前の切りかえ先を見せておく（穴をあけない）
      if (!shown && tier !== null) {
        const fallback = [this.micro[i], this.box[i], this.far[i]].find((b) => b !== null) ?? null;
        this.show(fallback, true);
      }
    }
    this.pending = pending;
    if (!pending) this.viewer = { x, z };
    if (built > 0) this.lastBuild = { ms: performance.now() - t0, chunks: built };
  }

  /** そのチャンクの近くのメッシュを作り直す。かかったミリ秒を返す */
  rebuildChunk(cx: number, cz: number): number {
    const i = cz * this.world.chunksX + cx;
    const t0 = performance.now();
    const old = this.micro[i];
    const next = this.buildMicro(i);
    this.drop(old);
    this.micro[i] = next;
    const ms = performance.now() - t0;
    this.lastRebuildMs = ms;
    const d = chunkNearDistance(cx, cz, this.viewer.x, this.viewer.z, CHUNK_SIZE);
    this.show(next, this.tierOf(d) === 'micro');
    return ms;
  }

  private visibleBuilt(): Built[] {
    const out: Built[] = [];
    for (let i = 0; i < this.count; i++) {
      for (const b of [this.micro[i], this.box[i], this.far[i]]) {
        if (b && b.meshes.length > 0 && b.meshes[0].visible) out.push(b);
      }
    }
    return out;
  }

  /** 見えているメッシュのバッファの合計バイト */
  visibleBytes(): number {
    let n = 0;
    for (const b of this.visibleBuilt()) n += b.bytes;
    return n;
  }

  /** 見えているチャンクの数（小ブロックの形・箱・遠くの LOD） */
  chunkCounts(): { micro: number; box: number; far: number } {
    let micro = 0;
    let box = 0;
    let far = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.micro[i]?.meshes[0]?.visible) micro++;
      if (this.box[i]?.meshes[0]?.visible) box++;
      if (this.far[i]?.meshes[0]?.visible) far++;
    }
    return { micro, box, far };
  }
}

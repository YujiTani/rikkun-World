import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Scene,
  type Texture,
} from 'three';
import type { CropStageSource } from '../../contracts';
import { ripeMinBrightness, setRipeMinBrightness } from './cropLight';
import { LIGHT_CONFIG as LC } from '../light/config';
import { skyDarkness } from '../light/skyDarkness';
import { WorldLight } from '../light/WorldLight';
import { createAtlasTexture } from '../blocks/textures';
import { CHUNK_SIZE, type ArrayVoxelWorld } from '../VoxelWorld';
import { CHUNK_DRAW_DISTANCE, RENDER_CONFIG } from './config';
import { chunkNearDistance } from './visibility';
import { crossTileName, meshChunk, RIPE_FLAG, type MeshData } from './meshChunk';
import { CropSwayMesh, SWAY_POOL_MAX, type SwayItem } from './cropSway';
import { BLOCK_TYPES, isCrossIndex, isWildIndex } from '../blocks/blockTypes';
import { cropKindOfBlock } from '../../contracts';
import { meshChunkLod } from './lodMesh';
import { WATER_ALPHA } from '../blocks/textures';

export interface RebuildStats {
  /** いちばん最近の作り直しにかかったミリ秒（描画そのものはふくまない） */
  lastMs: number;
  /** 作り直したチャンクの数（最初の全部の分はふくまない） */
  count: number;
}

/** render.chunks() の答え（M5 AC15） */
export interface ChunkStats {
  /** チャンクの数（8×8 = 64） */
  total: number;
  /** 遠くを かんたんメッシュ（LOD）で描いているチャンクの数 */
  lodDrawn: number;
  /** 距離が 88 以下で、いま描いている（メッシュがあって見える）チャンクの数 */
  drawn: number;
  /** 距離が 88 以下のチャンクの数（空のチャンクもふくむ。ふつうは drawn と同じ） */
  inRange: number;
  /** 描く距離（88） */
  maxDistance: number;
  /** 描いているチャンクの番号（cx + cz * 横の数） */
  drawnIndices: number[];
}

interface ChunkMeshes {
  opaque: Mesh | null;
  water: Mesh | null;
  /** 遠くで使う かんたんメッシュ（LOD） */
  lodOpaque: Mesh | null;
  lodWater: Mesh | null;
}

function toGeometry(data: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(data.positions), 3));
  if (data.uvs.length > 0) g.setAttribute('uv', new BufferAttribute(new Float32Array(data.uvs), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(data.colors), 3));
  g.setAttribute('aLight', new BufferAttribute(new Float32Array(data.lights), 2));
  g.setIndex(new BufferAttribute(new Uint32Array(data.indices), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const LIGHT_MAX_N = 15;
const f = (n: number): string => n.toFixed(4);

/**
 * ブロックの材料に「頂点の光」を入れる。明るさ = max(空の光の曲線, ブロックの光の 3 だんかい)。
 * 時刻は uniform（uDarken）で毎コマかけるだけ。メッシュは作り直さない。
 * 式は world/light/curve.ts と同じ。
 */
function applyLightShader(material: MeshBasicMaterial, cacheKey = 'rikkun-world-light'): void {
  material.userData.noDim = true; // sky/Lighting では暗くしない（ここで明るさを決める）
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDarken = skyDarkness.uniform;
    shader.uniforms.uRipeMin = ripeMinBrightness;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aLight;
uniform float uDarken;
uniform float uRipeMin;
float skyCurve(float lv) {
  float t = clamp(lv, 0.0, 15.0) / 15.0;
  return ${f(LC.minBrightness)} + ${f(1 - LC.minBrightness)} * (t / (4.0 - 3.0 * t));
}
float blockTier(float lv) {
  if (lv <= 0.01) return 0.0;
  float dist = ${f(LC.torchLevel)} - lv;
  // 頂点の平均で値が中間になるので、境目を少しなめらかにする
  float bright = 1.0 - smoothstep(${f(LC.torchBrightRadius)}, ${f(LC.torchBrightRadius + 0.9)}, dist);
  float dim = 1.0 - smoothstep(${f(LC.torchDimRadius)}, ${f(LC.torchDimRadius + 0.9)}, dist);
  return max(bright * ${f(LC.torchBrightBrightness)}, dim * ${f(LC.torchDimBrightness)});
}`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
{
  float ripe = step(1.5, aLight.y);
  float s = max(aLight.x * 15.0 - uDarken, 0.0);
  float bl = (aLight.y - ripe * 2.0) * 15.0;
  float sb = skyCurve(s);
  float bb = blockTier(bl);
  float w = clamp((bb - sb) * 3.0, 0.0, 1.0) * ${f(LC.warmTintStrength)};
  vec3 tint = mix(vec3(1.0), vec3(${f(LC.warmTint[0])}, ${f(LC.warmTint[1])}, ${f(LC.warmTint[2])}), w);
  vColor.rgb *= max(max(sb, bb), ripe * uRipeMin) * tint;
}`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
}

/**
 * 世界をチャンク単位のメッシュで描く。
 * - 見えない面は描かない（meshChunk）。
 * - update() で、変わったチャンクだけ作り直す。
 * - 水は別メッシュで半透明。
 */
export class WorldRenderer {
  readonly group = new Group();
  private readonly chunks: ChunkMeshes[];
  private readonly atlas: Texture;
  private readonly opaqueMaterial: MeshBasicMaterial;
  private readonly waterMaterial: MeshBasicMaterial;
  /** LOD 用: テクスチャなし（頂点の色だけ） */
  private readonly lodOpaqueMaterial: MeshBasicMaterial;
  private readonly lodWaterMaterial: MeshBasicMaterial;
  private attached = false;
  /** 距離で描く／描かない。viewer を渡す前は全部描く */
  private viewer: { x: number; z: number } | null = null;
  private readonly inRange: boolean[];
  /** そのチャンクを いま LOD で描くか（inRange のときだけ意味がある） */
  private readonly lodMode: boolean[];
  /** LOD のメッシュが古い（地形が変わった／まだ作っていない）。LOD で描くときに作る（1 チャンク 0.3ms ほど） */
  private readonly lodStale: boolean[];
  private crops: CropStageSource | undefined;
  /** なでた ゆれ（M7-2）: ゆれ中の 作物 を 専用メッシュ で 描き、チャンク側 の 板 は 隠す */
  private swaySource: ((cb: (x: number, y: number, z: number, deg: number) => void) => void) | undefined;
  private swayMesh: CropSwayMesh | null = null;
  private readonly swayHidden = new Set<number>();
  private readonly swayNext = new Set<number>();
  private readonly swayCells: Array<{ x: number; y: number; z: number; deg: number }> = [];
  private readonly swayItems: SwayItem[] = [];
  private readonly hideFn = (x: number, y: number, z: number): boolean => this.swayHidden.has(this.swayKey(x, y, z));
  private stats: RebuildStats = { lastMs: 0, count: 0 };
  /** 光（置く・こわすと近くだけ計算し直す）。Sky・妖怪の出現・テストが読む */
  readonly light: WorldLight;

  constructor(private readonly world: ArrayVoxelWorld) {
    this.light = new WorldLight(world);
    this.group.name = 'world';
    this.atlas = createAtlasTexture();
    // alphaTest: 作物などの十字の板の すきとおる所を切りぬく
    this.opaqueMaterial = new MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5 });
    this.waterMaterial = new MeshBasicMaterial({
      map: this.atlas,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.lodOpaqueMaterial = new MeshBasicMaterial({ vertexColors: true });
    this.lodWaterMaterial = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: WATER_ALPHA,
      depthWrite: false,
      side: DoubleSide,
    });
    applyLightShader(this.opaqueMaterial);
    applyLightShader(this.waterMaterial);
    applyLightShader(this.lodOpaqueMaterial, 'rikkun-world-light-lod');
    applyLightShader(this.lodWaterMaterial, 'rikkun-world-light-lod');
    this.chunks = Array.from({ length: world.chunksX * world.chunksZ }, () => ({
      opaque: null,
      water: null,
      lodOpaque: null,
      lodWater: null,
    }));
    this.inRange = this.chunks.map(() => true);
    this.lodMode = this.chunks.map(() => false);
    this.lodStale = this.chunks.map(() => true);
  }

  /**
   * カメラの水平の位置を伝える。88 より遠いチャンクは描かない（mesh.visible を切りかえるだけ）。
   * 位置が変わったときだけ計算し直す。毎コマ呼んでよい。
   */
  setViewer(x: number, z: number): void {
    const v = this.viewer;
    if (v && v.x === x && v.z === z) return;
    if (v) {
      v.x = x;
      v.z = z;
    } else {
      this.viewer = { x, z };
    }
    const { chunksX } = this.world;
    for (let i = 0; i < this.chunks.length; i++) {
      const dist = chunkNearDistance(i % chunksX, Math.floor(i / chunksX), x, z, CHUNK_SIZE);
      const on = dist <= CHUNK_DRAW_DISTANCE;
      const lod = on && dist > RENDER_CONFIG.lodDistance;
      if (on === this.inRange[i] && lod === this.lodMode[i]) continue;
      this.inRange[i] = on;
      this.lodMode[i] = lod;
      const c = this.chunks[i];
      if (lod && this.lodStale[i]) this.rebuildLod(i);
      if (c.opaque) c.opaque.visible = on && !lod;
      if (c.water) c.water.visible = on && !lod;
      if (c.lodOpaque) c.lodOpaque.visible = on && lod;
      if (c.lodWater) c.lodWater.visible = on && lod;
    }
  }

  /**
   * 作物の段階を聞く先を決める（A の FarmSystem）。決めたら 全チャンクを作り直す（1 回だけ）。
   * 段階が変わったときは A が `world.touch` するので、そのチャンクだけ作り直される。
   */
  setCropStageSource(src: CropStageSource | undefined): void {
    this.crops = src;
    if (!this.attached) return;
    for (let i = 0; i < this.chunks.length; i++) this.rebuildChunk(i);
  }

  /** みのった作物の明るさの下限（設定 `farmRipeMinBrightness`）。設定を変えたら呼ぶ */
  setRipeMinBrightness(v: number): void {
    setRipeMinBrightness(v);
  }

  /** window.__rikkun.render.chunks() 用 */
  chunkStats(): ChunkStats {
    const drawnIndices: number[] = [];
    let inRange = 0;
    let lodDrawn = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      if (!this.inRange[i]) continue;
      inRange++;
      const [a, b] = this.activeMeshes(i);
      if (a || b) {
        drawnIndices.push(i);
        if (this.lodMode[i]) lodDrawn++;
      }
    }
    return {
      total: this.chunks.length,
      drawn: drawnIndices.length,
      lodDrawn,
      inRange,
      maxDistance: CHUNK_DRAW_DISTANCE,
      drawnIndices,
    };
  }

  /** scene に入れて、全チャンクを作る */
  attach(scene: Scene): void {
    scene.add(this.group);
    if (this.attached) return;
    this.attached = true;
    this.world.takeDirtyChunks();
    for (let i = 0; i < this.chunks.length; i++) this.rebuildChunk(i);
  }

  /** 変わったチャンクだけ作り直す。毎コマ呼んでよい（変化が無ければすぐ終わる） */
  update(viewer?: { x: number; z: number }): void {
    if (viewer) this.setViewer(viewer.x, viewer.z);
    const t0 = performance.now(); // 光の計算し直しもふくめて計る（M5 AC17）
    this.light.update();
    if (!this.attached) return;
    this.syncSway();
    if (this.world.hasDirtyChunks()) {
      const dirty = this.world.takeDirtyChunks();
      for (const i of dirty) this.rebuildChunk(i);
      this.stats = { lastMs: performance.now() - t0, count: this.stats.count + dirty.length };
    }
    this.drawSway();
  }

  /** ゆれている 作物 の 一覧 を 教える 先（`FarmSparkle.forEachSway` が 合う）。 */
  setSwaySource(src: ((cb: (x: number, y: number, z: number, deg: number) => void) => void) | undefined): void {
    this.swaySource = src;
  }

  /** いま 専用メッシュ で ゆらしている 本数（テスト・計測用） */
  swayCount(): number {
    return this.swayMesh?.count ?? 0;
  }

  private swayKey(x: number, y: number, z: number): number {
    return (x * 4096 + z) * 512 + y;
  }

  /** ゆれ 中 の マス の 集まり が 変わったら、そのチャンク だけ 作り直しに 出す（板 を 隠す／出す） */
  private syncSway(): void {
    this.swayCells.length = 0;
    this.swayNext.clear();
    if (this.swaySource) {
      this.swaySource((x, y, z, deg) => {
        if (this.swayCells.length >= SWAY_POOL_MAX) return;
        const b = this.world.getIndex(x, y, z);
        if (b < 0 || !isCrossIndex(b)) return;
        this.swayCells.push({ x, y, z, deg });
        this.swayNext.add(this.swayKey(x, y, z));
      });
    }
    if (this.swayHidden.size === 0 && this.swayNext.size === 0) return;
    let changed = false;
    for (const c of this.swayCells) {
      if (!this.swayHidden.has(this.swayKey(c.x, c.y, c.z))) {
        this.world.touch(c.x, c.y, c.z);
        changed = true;
      }
    }
    if (this.swayHidden.size > 0) {
      for (const k of this.swayHidden) {
        if (this.swayNext.has(k)) continue;
        const y = k % 512;
        const r = (k - y) / 512;
        const z = r % 4096;
        const x = (r - z) / 4096;
        this.world.touch(x, y, z);
        changed = true;
      }
    }
    if (changed) {
      this.swayHidden.clear();
      for (const k of this.swayNext) this.swayHidden.add(k);
    }
  }

  private drawSway(): void {
    if (this.swayCells.length === 0 && !this.swayMesh?.mesh.visible) return;
    if (!this.swayMesh) {
      this.swayMesh = new CropSwayMesh(this.opaqueMaterial);
      this.group.add(this.swayMesh.mesh);
    }
    this.swayItems.length = 0;
    for (const c of this.swayCells) {
      // 板 を 隠せている（作り直し 済み）ものだけ 描く
      if (!this.swayHidden.has(this.swayKey(c.x, c.y, c.z))) continue;
      const b = this.world.getIndex(c.x, c.y, c.z);
      const stage = this.crops?.stageAt(c.x, c.y, c.z) ?? 3;
      const ripe = isWildIndex(b) || (cropKindOfBlock(BLOCK_TYPES[b].id) !== null && stage === 3);
      this.swayItems.push({
        x: c.x, y: c.y, z: c.z, deg: c.deg,
        tile: crossTileName(b, stage),
        sky: this.light.skyAt(c.x, c.y, c.z) / LIGHT_MAX_N,
        blk: this.light.blockAt(c.x, c.y, c.z) / LIGHT_MAX_N + (ripe ? RIPE_FLAG : 0),
      });
    }
    this.swayMesh.set(this.swayItems);
  }

  rebuildStats(): RebuildStats {
    return { ...this.stats };
  }

  /** 今の三角形の数（テスト・計測用） */
  triangleCount(): number {
    let n = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      if (!this.inRange[i]) continue; // 描いていないチャンクはかぞえない
      for (const m of this.activeMeshes(i)) {
        const idx = m?.geometry.getIndex();
        if (idx) n += idx.count / 3;
      }
    }
    return n;
  }

  /** 絵の材料（昼夜の明るさを渡すために登録する用） */
  materials(): MeshBasicMaterial[] {
    return [this.opaqueMaterial, this.waterMaterial, this.lodOpaqueMaterial, this.lodWaterMaterial];
  }

  /** メッシュの数（描画回数の目安） */
  meshCount(): number {
    let n = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      if (!this.inRange[i]) continue;
      const [a, b] = this.activeMeshes(i);
      n += (a ? 1 : 0) + (b ? 1 : 0);
    }
    return n;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const c of this.chunks) {
      c.opaque?.geometry.dispose();
      c.water?.geometry.dispose();
      c.lodOpaque?.geometry.dispose();
      c.lodWater?.geometry.dispose();
    }
    this.swayMesh?.dispose();
    this.opaqueMaterial.dispose();
    this.waterMaterial.dispose();
    this.lodOpaqueMaterial.dispose();
    this.lodWaterMaterial.dispose();
    this.atlas.dispose();
  }

  private rebuildChunk(index: number): void {
    const cx = index % this.world.chunksX;
    const cz = Math.floor(index / this.world.chunksX);
    const data = meshChunk(this.world, cx, cz, this.light, this.crops, this.swayHidden.size > 0 ? this.hideFn : undefined);
    const slot = this.chunks[index];
    const on = this.inRange[index];
    const lod = this.lodMode[index];
    slot.opaque = this.replace(slot.opaque, data.opaque, this.opaqueMaterial, 0, on && !lod);
    slot.water = this.replace(slot.water, data.water, this.waterMaterial, RENDER_CONFIG.waterRenderOrder, on && !lod);
    // かんたんメッシュは古くなったことだけ覚える。遠くで使うとき（いま使っていれば すぐ）作る
    this.lodStale[index] = true;
    if (lod) this.rebuildLod(index);
  }

  private rebuildLod(index: number): void {
    const cx = index % this.world.chunksX;
    const cz = Math.floor(index / this.world.chunksX);
    const slot = this.chunks[index];
    const on = this.inRange[index];
    const lod = this.lodMode[index];
    const lodData = meshChunkLod(this.world, cx, cz, this.light);
    slot.lodOpaque = this.replace(slot.lodOpaque, lodData.opaque, this.lodOpaqueMaterial, 0, on && lod);
    slot.lodWater = this.replace(slot.lodWater, lodData.water, this.lodWaterMaterial, RENDER_CONFIG.waterRenderOrder, on && lod);
    this.lodStale[index] = false;
  }

  /** いま描く側のメッシュ [ふつう, 水] */
  private activeMeshes(i: number): [Mesh | null, Mesh | null] {
    const c = this.chunks[i];
    return this.lodMode[i] ? [c.lodOpaque, c.lodWater] : [c.opaque, c.water];
  }

  private replace(old: Mesh | null, data: MeshData, material: MeshBasicMaterial, order: number, visible: boolean): Mesh | null {
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    if (data.faceCount === 0) return null;
    const mesh = new Mesh(toGeometry(data), material);
    mesh.renderOrder = order;
    mesh.visible = visible;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    return mesh;
  }
}

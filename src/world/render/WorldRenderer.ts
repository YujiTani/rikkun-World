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
import { LIGHT_CONFIG as LC } from '../light/config';
import { skyDarkness } from '../light/skyDarkness';
import { WorldLight } from '../light/WorldLight';
import { createAtlasTexture } from '../blocks/textures';
import type { ArrayVoxelWorld } from '../VoxelWorld';
import { RENDER_CONFIG } from './config';
import { meshChunk, type MeshData } from './meshChunk';

export interface RebuildStats {
  /** いちばん最近の作り直しにかかったミリ秒（描画そのものはふくまない） */
  lastMs: number;
  /** 作り直したチャンクの数（最初の全部の分はふくまない） */
  count: number;
}

interface ChunkMeshes {
  opaque: Mesh | null;
  water: Mesh | null;
}

function toGeometry(data: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(data.positions), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(data.uvs), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(data.colors), 3));
  g.setAttribute('aLight', new BufferAttribute(new Float32Array(data.lights), 2));
  g.setIndex(new BufferAttribute(new Uint32Array(data.indices), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const f = (n: number): string => n.toFixed(4);

/**
 * ブロックの材料に「頂点の光」を入れる。明るさ = max(空の光の曲線, ブロックの光の 3 だんかい)。
 * 時刻は uniform（uDarken）で毎コマかけるだけ。メッシュは作り直さない。
 * 式は world/light/curve.ts と同じ。
 */
function applyLightShader(material: MeshBasicMaterial): void {
  material.userData.noDim = true; // sky/Lighting では暗くしない（ここで明るさを決める）
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDarken = skyDarkness.uniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aLight;
uniform float uDarken;
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
  float s = max(aLight.x * 15.0 - uDarken, 0.0);
  float bl = aLight.y * 15.0;
  float sb = skyCurve(s);
  float bb = blockTier(bl);
  float w = clamp((bb - sb) * 3.0, 0.0, 1.0) * ${f(LC.warmTintStrength)};
  vec3 tint = mix(vec3(1.0), vec3(${f(LC.warmTint[0])}, ${f(LC.warmTint[1])}, ${f(LC.warmTint[2])}), w);
  vColor.rgb *= max(sb, bb) * tint;
}`,
      );
  };
  material.customProgramCacheKey = () => 'rikkun-world-light';
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
  private attached = false;
  private stats: RebuildStats = { lastMs: 0, count: 0 };
  /** 光（置く・こわすと近くだけ計算し直す）。Sky・妖怪の出現・テストが読む */
  readonly light: WorldLight;

  constructor(private readonly world: ArrayVoxelWorld) {
    this.light = new WorldLight(world);
    this.group.name = 'world';
    this.atlas = createAtlasTexture();
    this.opaqueMaterial = new MeshBasicMaterial({ map: this.atlas, vertexColors: true });
    this.waterMaterial = new MeshBasicMaterial({
      map: this.atlas,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    applyLightShader(this.opaqueMaterial);
    applyLightShader(this.waterMaterial);
    this.chunks = Array.from({ length: world.chunksX * world.chunksZ }, () => ({ opaque: null, water: null }));
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
  update(): void {
    this.light.update();
    if (!this.attached || !this.world.hasDirtyChunks()) return;
    const t0 = performance.now();
    const dirty = this.world.takeDirtyChunks();
    for (const i of dirty) this.rebuildChunk(i);
    this.stats = { lastMs: performance.now() - t0, count: this.stats.count + dirty.length };
  }

  rebuildStats(): RebuildStats {
    return { ...this.stats };
  }

  /** 今の三角形の数（テスト・計測用） */
  triangleCount(): number {
    let n = 0;
    for (const c of this.chunks) {
      for (const m of [c.opaque, c.water]) {
        const idx = m?.geometry.getIndex();
        if (idx) n += idx.count / 3;
      }
    }
    return n;
  }

  /** 絵の材料（昼夜の明るさを渡すために登録する用） */
  materials(): MeshBasicMaterial[] {
    return [this.opaqueMaterial, this.waterMaterial];
  }

  /** メッシュの数（描画回数の目安） */
  meshCount(): number {
    let n = 0;
    for (const c of this.chunks) n += (c.opaque ? 1 : 0) + (c.water ? 1 : 0);
    return n;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const c of this.chunks) {
      c.opaque?.geometry.dispose();
      c.water?.geometry.dispose();
    }
    this.opaqueMaterial.dispose();
    this.waterMaterial.dispose();
    this.atlas.dispose();
  }

  private rebuildChunk(index: number): void {
    const cx = index % this.world.chunksX;
    const cz = Math.floor(index / this.world.chunksX);
    const data = meshChunk(this.world, cx, cz, this.light);
    const slot = this.chunks[index];
    slot.opaque = this.replace(slot.opaque, data.opaque, this.opaqueMaterial, 0);
    slot.water = this.replace(slot.water, data.water, this.waterMaterial, RENDER_CONFIG.waterRenderOrder);
  }

  private replace(old: Mesh | null, data: MeshData, material: MeshBasicMaterial, order: number): Mesh | null {
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    if (data.faceCount === 0) return null;
    const mesh = new Mesh(toGeometry(data), material);
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    return mesh;
  }
}

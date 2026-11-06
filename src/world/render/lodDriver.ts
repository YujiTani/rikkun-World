import type { Group } from 'three';
import { lodSortKey } from './drawOrder';
import { CHUNK_DRAW_DISTANCE, RENDER_CONFIG } from './config';
import { meshChunkLod } from './lodMesh';
import type { RenderMaterials } from './rendererMaterials';
import type { SectionMeshStore } from './sectionMeshStore';
import type { ColState } from './sectionState';
import type { WorldLight } from '../light/WorldLight';
import type { ArrayVoxelWorld } from '../VoxelWorld';

/** 列ごとの LOD(遠くの かんたんメッシュ)を 見せる・作る・捨てる。WorldRenderer.ts から 分けた */
export interface LodCtx {
  group: Group;
  store: SectionMeshStore;
  mats: RenderMaterials;
  world: ArrayVoxelWorld;
  light: WorldLight;
  /** 絵が かわった（列の 場所） */
  changed(cx: number, cz: number): void;
  /** いま その列の LOD を 作ってよいか（貼りつけ ずみ・ストリーミングでない・光ずみ） */
  canBuild(col: ColState): boolean;
}

export function dropLodOf(group: Group, col: ColState): void {
  if (col.lodOpaque) group.remove(col.lodOpaque), col.lodOpaque.geometry.dispose();
  if (col.lodWater) group.remove(col.lodWater), col.lodWater.geometry.dispose();
  col.lodOpaque = col.lodWater = null;
}

export function rebuildLodOf(c: LodCtx, col: ColState): void {
  const data = meshChunkLod(c.world, col.cx, col.cz, c.light);
  dropLodOf(c.group, col);
  col.lodOpaque = data.opaque.faceCount > 0 ? c.store.atlasMesh(data.opaque, c.mats.lodOpaqueMaterial, 0, lodSortKey(col.cx, col.cz, false)) : null;
  col.lodWater = data.water.faceCount > 0 ? c.store.atlasMesh(data.water, c.mats.lodWaterMaterial, RENDER_CONFIG.waterRenderOrder, lodSortKey(col.cx, col.cz, true)) : null;
  col.lodStale = false;
  c.changed(col.cx, col.cz);
}

export function updateLodOf(c: LodCtx, col: ColState): void {
  const want = (col.tier === 'lod' && col.dist <= CHUNK_DRAW_DISTANCE) || col.lodHold;
  if (want && col.lodStale && c.canBuild(col)) rebuildLodOf(c, col);
  const on = want && !!col.lodOpaque;
  if (col.lodOpaque && col.lodOpaque.visible !== want) c.changed(col.cx, col.cz);
  if (col.lodOpaque) col.lodOpaque.visible = want;
  if (col.lodWater) col.lodWater.visible = want;
  if (!on && col.lodHold && !col.lodOpaque) col.lodHold = false;
}

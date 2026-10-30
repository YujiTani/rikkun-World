import { DoubleSide, MeshBasicMaterial, type Texture } from 'three';
import { createAtlasTexture, WATER_ALPHA } from '../blocks/textures';
import { applyLightShader } from './lightShader';
import { setAoRadius } from './voxel/aoUniforms';
import { createVoxelMaterial, createVoxelShared, type VoxelShared } from './voxel/voxelMaterial';

/** WorldRenderer が使う絵の材料（WorldRenderer.ts から分けた。4-7） */
export interface RenderMaterials {
  atlas: Texture;
  voxelShared: VoxelShared;
  /** 箱の段の材料（うまりなし） */
  boxMaterial: MeshBasicMaterial;
  opaqueMaterial: MeshBasicMaterial;
  waterMaterial: MeshBasicMaterial;
  /** LOD 用: テクスチャなし（頂点の色だけ） */
  lodOpaqueMaterial: MeshBasicMaterial;
  lodWaterMaterial: MeshBasicMaterial;
}

/** 材料を作る。microR: はじめの小ブロックの半径（角の暗がりの半径にも渡す） */
export function createRenderMaterials(microR: number): RenderMaterials {
  const atlas = createAtlasTexture();
  const voxelShared = createVoxelShared(atlas);
  const boxMaterial = createVoxelMaterial(voxelShared, null);
  setAoRadius(microR);
  // alphaTest: 作物などの十字の板の すきとおる所を切りぬく
  const opaqueMaterial = new MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
  const waterMaterial = new MeshBasicMaterial({
    map: atlas,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  // 箱・小ブロックと同じ場所に LOD が重なる あいだ（切りかえ）は、箱・小ブロックを 手前に見せる
  const lodOpaqueMaterial = new MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const lodWaterMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: WATER_ALPHA,
    depthWrite: false,
    side: DoubleSide,
  });
  applyLightShader(opaqueMaterial);
  applyLightShader(waterMaterial);
  applyLightShader(lodOpaqueMaterial, 'rikkun-world-light-lod');
  applyLightShader(lodWaterMaterial, 'rikkun-world-light-lod');
  return { atlas, voxelShared, boxMaterial, opaqueMaterial, waterMaterial, lodOpaqueMaterial, lodWaterMaterial };
}

export function disposeRenderMaterials(m: RenderMaterials): void {
  m.boxMaterial.dispose();
  m.voxelShared.dummyAo.dispose();
  m.opaqueMaterial.dispose();
  m.waterMaterial.dispose();
  m.lodOpaqueMaterial.dispose();
  m.lodWaterMaterial.dispose();
  m.atlas.dispose();
}

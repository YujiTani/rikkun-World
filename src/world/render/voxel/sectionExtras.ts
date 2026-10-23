import type { CropStageSource } from '../../../contracts';
import { cropKindOfBlock } from '../../../contracts';
import { hasLook, occludes } from '../../../proto/voxel/looks';
import { AIR, BLOCK_TYPES, WATER, isCrossIndex, isOpaqueIndex, isTorchIndex, isWildIndex } from '../../blocks/blockTypes';
import type { TileName } from '../../blocks/textures';
import type { WorldLight } from '../../light/WorldLight';
import type { ArrayVoxelWorld } from '../../VoxelWorld';
import { isKotatsuBlock } from '../../blocks/kotatsu';
import { pushKotatsuCell } from '../kotatsuMesh';
import { FACES, LIGHT_MAX, RIPE_FLAG, TILE_UV, crossTileName, emptyMesh, isCoopLineIndex, pushCoopPanels, pushCross, pushFace, pushTorch, type MeshData } from '../meshChunk';

/**
 * セクション 1 つぶんの「絵（atlas）で描くもの」: たいまつ・十字の板（作物・やせいの やさい・かかし・さく）・
 * 小ブロックの形を持たない固いブロック（平らな箱: かまど・たんす・スプリンクラー・レンガ・かわら・はたけ・ぬれたはたけ）・水。
 * 小ブロックの形（3D テクスチャ）で描く種類は meshVoxel の側（sectionMesher.ts）が描く。
 * 光は今までと同じ（面の角のなめらかな平均）。
 */
export interface SectionExtras {
  /** 不透明（alphaTest あり）の atlas メッシュの材料 */
  opaque: MeshData;
  water: MeshData;
}

export function meshSectionExtras(
  world: ArrayVoxelWorld,
  cx: number,
  sy: number,
  cz: number,
  light: WorldLight | undefined,
  crops?: CropStageSource,
  hide?: (x: number, y: number, z: number) => boolean,
  /** true: 平らな箱の面に 角の暗がり（AO。ブロック単位）を入れる（小ブロックの段。箱の段は入れない） */
  ao = false,
): SectionExtras {
  const opaque = emptyMesh();
  const water = emptyMesh();
  const x0 = cx * 16;
  const y0 = sy * 16;
  const z0 = cz * 16;
  const y1 = Math.min(y0 + 16, world.size.y);
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z0 + 16; z++) {
      for (let x = x0; x < x0 + 16; x++) {
        const b = world.getIndex(x, y, z);
        if (b <= AIR) continue;
        if (isTorchIndex(b)) {
          pushTorch(opaque, x, y, z, BLOCK_TYPES[b].id as TileName, light ? light.skyAt(x, y, z) / LIGHT_MAX : 1);
          continue;
        }
        if (isCoopLineIndex(b)) {
          pushCoopPanels(opaque, world, x, y, z, b, light ? light.skyAt(x, y, z) / LIGHT_MAX : 1, light ? light.blockAt(x, y, z) / LIGHT_MAX : 0);
          continue;
        }
        if (isCrossIndex(b)) {
          if (hide && hide(x, y, z)) continue;
          const stage = crops?.stageAt(x, y, z) ?? 3;
          const ripe = isWildIndex(b) || (cropKindOfBlock(BLOCK_TYPES[b].id) !== null && stage === 3);
          pushCross(
            opaque, x, y, z, crossTileName(b, stage),
            light ? light.skyAt(x, y, z) / LIGHT_MAX : 1,
            (light ? light.blockAt(x, y, z) / LIGHT_MAX : 0) + (ripe ? RIPE_FLAG : 0),
          );
          continue;
        }
        if (isKotatsuBlock(BLOCK_TYPES[b].id) && pushKotatsuCell(opaque, world, light, x, y, z, BLOCK_TYPES[b].id)) continue;
        const isWater = b === WATER;
        if (!isWater && hasLook(b)) continue; // 小ブロックの形で描く
        const uv = TILE_UV[b];
        if (!uv) continue;
        for (const face of FACES) {
          const n = world.getIndex(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
          if (n < 0) continue; // 世界の外へ向く面は見えない
          // となりが 絵のブロックなら 面はかくれる。小ブロックの形のとなりは、横は 地形のへこみから見えることがあるので 描く。
          // 上下は となりの面が ぜんぶ つまっている（箱でふさがれた面は へこまない）ので かくれる
          if (isWater ? n !== AIR : isOpaqueIndex(n) && (!hasLook(n) || (face.dir[1] !== 0 && occludes(n)))) continue;
          pushFace(isWater ? water : opaque, world, light, x, y, z, face, uv[face.kind], ao && !isWater);
        }
      }
    }
  }
  return { opaque, water };
}

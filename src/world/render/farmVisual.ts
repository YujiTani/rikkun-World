import { BLOCK_TYPES } from '../blocks/blockTypes';
import { TILE_NAMES, getTilePixels, type TileName } from '../blocks/textures';
import { cropKindOfBlock, type CropStageSource, type FarmVisual } from '../../contracts';
import { ripeMinBrightness } from './cropLight';
import type { WorldLight } from '../light/WorldLight';
import type { ArrayVoxelWorld } from '../VoxelWorld';
import { crossTileName } from './meshChunk';
import { isWildIndex } from '../blocks/blockTypes';

export interface FarmVisualDeps {
  world: ArrayVoxelWorld;
  light: WorldLight;
  crops: CropStageSource;
  /** `farmRipeMinBrightness` を 読む先。なければ 描画が使っている値 */
  ripeMin?: () => number;
  /** アイテム id の アイコン（D の絵）。なければ null */
  itemIcon?: (name: string) => Array<string | null> | null;
}

const hex2 = (v: number): string => v.toString(16).padStart(2, '0');

/** `farm.texture` / `farm.look` の中身（A はそのまま返す） */
export function createFarmVisual(deps: FarmVisualDeps): FarmVisual {
  return {
    texture(name: string): Array<string | null> {
      if ((TILE_NAMES as readonly string[]).includes(name)) {
        return getTilePixels(name as TileName).map((c) => (c[3] === 0 ? null : `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`));
      }
      const icon = deps.itemIcon?.(name);
      if (icon) return icon;
      throw new Error(`farm.texture: 知らない名前 ${name}`);
    },
    look(x, y, z) {
      const b = deps.world.getIndex(x, y, z);
      if (b < 0) return null;
      const k = cropKindOfBlock(BLOCK_TYPES[b].id);
      if (!k) return null;
      const stage = k.wild ? 3 : (deps.crops.stageAt(x, y, z) ?? 3);
      let brightness = deps.light.brightness(x, y, z);
      if (isWildIndex(b) || stage === 3) brightness = Math.max(brightness, deps.ripeMin ? deps.ripeMin() : ripeMinBrightness.value);
      return { tile: crossTileName(b, stage), brightness };
    },
  };
}

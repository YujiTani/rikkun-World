/**
 * 作物の表と関数。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { CropKind } from '../contracts/farm';
import type { ItemId } from '../contracts/items';
import type { BlockId } from '../contracts/world';

export const CROP_KINDS: readonly CropKind[] = ['onion', 'tomato', 'pumpkin', 'eggplant'];

export const CROP_BLOCK: Readonly<Record<CropKind, BlockId>> = {
  onion: 'crop_onion',
  tomato: 'crop_tomato',
  pumpkin: 'crop_pumpkin',
  eggplant: 'crop_eggplant',
};

export const WILD_BLOCK: Readonly<Record<CropKind, BlockId>> = {
  onion: 'wild_onion',
  tomato: 'wild_tomato',
  pumpkin: 'wild_pumpkin',
  eggplant: 'wild_eggplant',
};

export const SEED_ITEM: Readonly<Record<CropKind, ItemId>> = {
  onion: 'seed_onion',
  tomato: 'seed_tomato',
  pumpkin: 'seed_pumpkin',
  eggplant: 'seed_eggplant',
};

/** やさいの アイテム id は しゅるいの名前そのまま（`onion` ほか） */
export const VEG_ITEM: Readonly<Record<CropKind, ItemId>> = {
  onion: 'onion',
  tomato: 'tomato',
  pumpkin: 'pumpkin',
  eggplant: 'eggplant',
};

/** ブロック id から 作物の しゅるいを引く（作物・やせいの やさい 以外は null） */
export function cropKindOfBlock(id: BlockId | 'outside'): { kind: CropKind; wild: boolean } | null {
  switch (id) {
    case 'crop_onion': return { kind: 'onion', wild: false };
    case 'crop_tomato': return { kind: 'tomato', wild: false };
    case 'crop_pumpkin': return { kind: 'pumpkin', wild: false };
    case 'crop_eggplant': return { kind: 'eggplant', wild: false };
    case 'wild_onion': return { kind: 'onion', wild: true };
    case 'wild_tomato': return { kind: 'tomato', wild: true };
    case 'wild_pumpkin': return { kind: 'pumpkin', wild: true };
    case 'wild_eggplant': return { kind: 'eggplant', wild: true };
    default: return null;
  }
}

/** アイテム id から たね／やさい の しゅるいを引く */
export function seedKindOfItem(id: ItemId): CropKind | null {
  switch (id) {
    case 'seed_onion': return 'onion';
    case 'seed_tomato': return 'tomato';
    case 'seed_pumpkin': return 'pumpkin';
    case 'seed_eggplant': return 'eggplant';
    default: return null;
  }
}

export function vegKindOfItem(id: ItemId): CropKind | null {
  return id === 'onion' || id === 'tomato' || id === 'pumpkin' || id === 'eggplant' ? id : null;
}

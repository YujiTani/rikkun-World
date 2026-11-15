// TOWN-1 1C: よろずやの こうかんの 係を 作る（保存を 読む 前に 作る ので 妖怪の つなぎ〔creatures.ts〕で 呼ぶ。画面・話す 口は shop.ts）。
import type { Inventory, ItemStack, Vec3 } from '../../contracts';
import { ShopService } from '../../town/shop/shop';
import type { ShopGive, ShopItemId } from '../../town/shop/shopTable';

/** 入らない 物を 足もとに 落とす 高さ（足もとから 上へ。マス）と 飛ばし方（宝箱と 同じ。game/wire/mine.ts） */
const DROP_RISE = 0.5;
const DROP_SCATTER = { speedMin: 0.3, speedMax: 0.8, upMin: 3, upMax: 3.5 } as const;

export interface ShopServiceDeps {
  seed: number;
  inventory: Inventory;
  playerPos: () => Vec3;
  /** 2P（参加して いなければ null） */
  mate: () => { position: Vec3; inventory: Inventory } | null;
  scatter: (at: Vec3, stacks: readonly ItemStack[], opts: typeof DROP_SCATTER) => void;
  /** 家の レシピを ぜんぶ おぼえた（まきものの 売り切れ。建築士さんの 係は あとで できる） */
  recipesAllLearned: () => boolean;
  /** わたした（実績・テロップ。画面の つなぎが あとで 入れる） */
  gave: (who: 1 | 2, id: ShopItemId, stacks: readonly ShopGive[]) => void;
}

export function createShopService(d: ShopServiceDeps): ShopService {
  return new ShopService(
    {
      inventory: (who) => (who === 1 ? d.inventory : (d.mate()?.inventory ?? null)),
      dropAtFeet: (who, stacks) => {
        const at = who === 1 ? d.playerPos() : d.mate()?.position;
        if (at) d.scatter({ x: at.x, y: at.y + DROP_RISE, z: at.z }, stacks, DROP_SCATTER);
      },
      recipesLeft: () => !d.recipesAllLearned(),
      gave: (who, id, stacks) => d.gave(who, id, stacks),
    },
    d.seed,
  );
}

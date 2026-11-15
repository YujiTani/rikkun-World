// TOWN-1 1C: よろずやの こうかんの 係を 作る（保存を 読む 前に 作る ので 妖怪の つなぎ〔creatures.ts〕で 呼ぶ。画面・話す 口は shop.ts）。
import type { BlockId, Inventory, ItemStack, Vec3, VoxelWorld } from '../../contracts';
import { overlapsBody } from '../../dig/digCore';
import { ShopService } from '../../town/shop/shop';
import type { ShopBoxPorts } from '../../town/shop/shopBoxes';
import type { ShopGive, ShopItemId } from '../../town/shop/shopTable';
import { currentTown } from '../../town/townState';
import { townRepairsNow } from './townRepair';
import { townCarpenterNow } from './townCarpenter';

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
  /** 1.5: たからばこを 置く 世界 */
  world: Pick<VoxelWorld, 'getBlock' | 'setBlock' | 'isLoaded' | 'isSolid'>;
  /** 妖怪・動物の 体が その マスに かかるか（人は ここで 見る） */
  creatureAt: (x: number, y: number, z: number) => boolean;
  /** 箱が 出た・きえた ときの 見た目と 音（画面の つなぎが あとで 入れる） */
  boxFx: () => Pick<ShopBoxPorts, 'popped' | 'vanished'>;
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
      boxes: {
        spots: () => currentTown()?.shopSpots() ?? [],
        world: {
          getBlock: (x, y, z) => d.world.getBlock(x, y, z),
          setBlock: (x, y, z, id) => void d.world.setBlock(x, y, z, id as BlockId),
          isLoaded: (x, z) => d.world.isLoaded(x, z),
          isSolid: (x, y, z) => d.world.isSolid(x, y, z),
        },
        recorded: (x, y, z) => townRepairsNow()?.isRecorded(x, y, z) ?? false,
        bodyAt: (x, y, z) => {
          if (overlapsBody(d.playerPos(), x, y, z)) return true;
          const m = d.mate();
          if (m !== null && overlapsBody(m.position, x, y, z)) return true;
          const c = townCarpenterNow()?.carpenter; // 街の だいくさん（§4.3b「街の 人」）。こやに いる 間は 遠い ので 当たらない
          if (c && c.out && overlapsBody(c, x, y, z)) return true;
          return d.creatureAt(x, y, z);
        },
        popped: (s, r) => d.boxFx().popped?.(s, r),
        vanished: (s, r) => d.boxFx().vanished?.(s, r),
      },
    },
    d.seed,
  );
}

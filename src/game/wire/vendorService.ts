// TOWN-1 1E: かじやさん・かいとりの やたい・食事・かえりの おふだの 係を 作る（やたいの きょうの 数を 保存する ので 保存を 読む 前。
// 妖怪の つなぎ〔creatures.ts〕で 呼ぶ。画面・話す 口・見た目は vendors.ts）。
import type { ArmorSlot, Durability, Inventory, ItemId, Vec3, VoxelWorld } from '../../contracts';
import type { WalletPort } from '../../dama/walletPort';
import { overlapsBody } from '../../dig/digCore';
import { FoodService, type FoodPorts, type FoodVitals } from '../../town/vendor/food';
import { KaitoriService } from '../../town/vendor/kaitori';
import { OfudaService, type OfudaPorts } from '../../town/vendor/ofuda';
import { SmithService } from '../../town/vendor/smith';
import { currentTown } from '../../town/townState';
import { isWater } from '../../world/blocks/water';

type Who = 1 | 2;
type DuraInventory = Inventory & { setDurability?(slot: number, left: number): void };
type DuraArmor = { equipped(slot: ArmorSlot): ItemId | null; durability(slot: ArmorSlot): Durability | null; setDurability?(slot: ArmorSlot, left: number): void };

export interface VendorServiceDeps {
  /** さいふ（ようかいダマ。1.6〔1F〕） */
  wallet: WalletPort;
  inventory: DuraInventory;
  armor: DuraArmor;
  playerPos: () => Vec3;
  /** 1P を うつす（足もと。速さ 0） */
  movePlayer: (to: Vec3) => void;
  vitals1: FoodVitals;
  /** 2P（参加して いなければ null） */
  mate: () => { position: Vec3; inventory: Inventory; moveTo?(p: Vec3): void } | null;
  armor2: () => DuraArmor | null;
  vitals2: () => FoodVitals | null;
  alive: (who: Who) => boolean;
  day: () => number;
  world: Pick<VoxelWorld, 'getBlock' | 'isSolid'>;
  /** 妖怪・動物の 体が その マスに かかるか */
  creatureAt: (x: number, y: number, z: number) => boolean;
  /** おふだの 見た目・音・ふきだし（画面の つなぎが あとで 入れる） */
  ofudaFx: () => Pick<OfudaPorts, 'started' | 'arrived' | 'refused'>;
  /** 食事の 音（画面の つなぎが あとで 入れる） */
  foodFx: () => Pick<FoodPorts, 'munch' | 'popped'>;
}

export interface VendorServices {
  smith: SmithService;
  kaitori: KaitoriService;
  food: FoodService;
  ofuda: OfudaService;
}

export function createVendorServices(d: VendorServiceDeps): VendorServices {
  const inv = (who: Who): DuraInventory | null => (who === 1 ? d.inventory : ((d.mate()?.inventory as DuraInventory | undefined) ?? null));
  const pos = (who: Who): Vec3 | null => (who === 1 ? d.playerPos() : (d.mate()?.position ?? null));
  const smith = new SmithService({ wallet: d.wallet, inventory: inv, armor: (who) => (who === 1 ? d.armor : d.mate() ? d.armor2() : null) });
  const kaitori = new KaitoriService({
    inventory: inv,
    wallet: d.wallet,
    day: d.day,
  });
  const food = new FoodService({ inventory: inv, wallet: d.wallet, vitals: (who) => (who === 1 ? d.vitals1 : d.mate() ? d.vitals2() : null),
    munch: (who, kind) => d.foodFx().munch?.(who, kind),
    popped: (who) => d.foodFx().popped?.(who),
  });
  const ofuda = new OfudaService({
    inventory: inv,
    pos,
    alive: d.alive,
    inSafe: (x, z) => currentTown()?.inSafe(x, z) ?? false,
    plaza: () => currentTown()?.info().plaza ?? null,
    open: (x, y, z) => !d.world.isSolid(x, y, z) && !isWater(d.world.getBlock(x, y, z)), // 体が 入れる（水の 中には うつさない）
    ground: (x, y, z) => d.world.isSolid(x, y, z),
    bodyAt: (who, x, y, z) => {
      const other = pos(who === 1 ? 2 : 1);
      if (other && (overlapsBody(other, x, y, z) || overlapsBody(other, x, y + 1, z))) return true;
      return d.creatureAt(x, y, z) || d.creatureAt(x, y + 1, z);
    },
    move: (who, to) => {
      if (who === 1) d.movePlayer(to);
      else d.mate()?.moveTo?.(to);
    },
    started: (who) => d.ofudaFx().started?.(who),
    arrived: (who, at) => d.ofudaFx().arrived?.(who, at),
    refused: (who) => d.ofudaFx().refused?.(who),
  });
  return { smith, kaitori, food, ofuda };
}

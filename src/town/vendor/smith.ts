import type { ArmorSlot, Durability, Inventory, ItemId } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { ARMOR_SLOTS } from '../../craft/config';
import { rarityTier } from '../../drops/rarityTable';
import { SMITH_PRICE } from './vendorTable';

/**
 * かじやさんの なおす 係（TOWN-1 1E。docs/design/TOWN-1-shop.md §2.11・§4.8・AC34）。画面・three なし。
 * その 人の もちもの と 着て いる そうびの うち、たいきゅうが へって いる 物を ようかいダマで まんたんに する。
 * ねだんは めずらしさの ★ だけで 決まる（どれだけ へって いても 同じ）。たいきゅうの ない 物（ブロック・食べ物）は 出ない。
 */

type Who = 1 | 2;
const ORB: ItemId = 'yokai_orb';

/** カードの 場所: もちものの マス（0 はじまり）か 着て いる そうびの 部位（'armor:head' など） */
export type SmithSlot = number | `armor:${ArmorSlot}`;

/** なおせる 物 1 つ（窓口 `smith.state(p).items` と 同じ 形） */
export interface SmithItem {
  slot: SmithSlot;
  item: ItemId;
  /** 今の のこりの たいきゅう */
  durability: number;
  max: number;
  /** ねだん（ようかいダマ 何こ） */
  price: number;
  canFix: boolean;
}

export type SmithFixResult = 'ok' | 'short' | 'full';

export interface SmithPorts {
  /** その 人の もちもの（2P が いなければ null）。setDurability は 準備用と 同じ 口（left を max に する） */
  inventory(who: Who): (Pick<Inventory, 'size' | 'slots' | 'durability' | 'count' | 'remove'> & { setDurability?(slot: number, left: number): void }) | null;
  /** その 人の そうび（2P が いなければ null） */
  armor(who: Who): { equipped(slot: ArmorSlot): ItemId | null; durability(slot: ArmorSlot): Durability | null; setDurability?(slot: ArmorSlot, left: number): void } | null;
}

/** その 物の なおす ねだん（めずらしさの ★ の 数から） */
function smithPrice(item: ItemId): number {
  const def = ITEM_DEFS[item as keyof typeof ITEM_DEFS];
  const stars = def ? rarityTier(def.rarity).stars : 1;
  return SMITH_PRICE[stars as keyof typeof SMITH_PRICE];
}

const armorOf = (slot: SmithSlot): ArmorSlot | null => (typeof slot === 'string' ? (slot.slice('armor:'.length) as ArmorSlot) : null);

export class SmithService {
  constructor(private readonly ports: SmithPorts) {}

  /** もって いる ようかいダマ */
  dama(who: Who): number {
    return this.ports.inventory(who)?.count(ORB) ?? 0;
  }

  /** たいきゅうが へって いる 物（もちものの マスの 順 → そうびの 部位の 順） */
  items(who: Who): SmithItem[] {
    const out: SmithItem[] = [];
    const inv = this.ports.inventory(who);
    if (!inv) return out;
    const d = inv.count(ORB);
    const slots = inv.slots();
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const du = s ? inv.durability(i) : null;
      if (s && du && du.left < du.max) out.push(this.row(i, s.item, du, d));
    }
    const ar = this.ports.armor(who);
    if (ar) {
      for (const p of ARMOR_SLOTS) {
        const it = ar.equipped(p);
        const du = it ? ar.durability(p) : null;
        if (it && du && du.left < du.max) out.push(this.row(`armor:${p}`, it, du, d));
      }
    }
    return out;
  }

  /** その 場所の 物 1 つ（へって いなければ null） */
  itemAt(who: Who, slot: SmithSlot): SmithItem | null {
    return this.items(who).find((i) => i.slot === slot) ?? null;
  }

  /** ようかいダマが あと 何こ たりないか（たりて いる・物が ない ときは 0） */
  short(who: Who, slot: SmithSlot): number {
    const it = this.itemAt(who, slot);
    return it ? Math.max(0, it.price - this.dama(who)) : 0;
  }

  /** なおす（full ＝ もう まんたん・たいきゅうの ない 物・ない）。ようかいダマが たりなければ 何も かわらない */
  fix(who: Who, slot: SmithSlot): SmithFixResult {
    const it = this.itemAt(who, slot);
    const inv = this.ports.inventory(who);
    if (!it || !inv) return 'full';
    if (inv.count(ORB) < it.price) return 'short';
    inv.remove(ORB, it.price);
    const a = armorOf(slot);
    if (a === null) inv.setDurability?.(slot as number, it.max);
    else this.ports.armor(who)?.setDurability?.(a, it.max);
    return 'ok';
  }

  private row(slot: SmithSlot, item: ItemId, du: Durability, dama: number): SmithItem {
    const price = smithPrice(item);
    return { slot, item, durability: du.left, max: du.max, price, canFix: dama >= price };
  }
}

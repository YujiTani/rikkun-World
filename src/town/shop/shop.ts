import type { Inventory, ItemId } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { RARITY_ORDER, rarityTier } from '../../drops/rarityTable';
import { chestTableOf } from '../../world/gen/mineChestTable';
import { rollChest } from '../../world/gen/mineChest';
import { hashInts, subSeed } from '../../world/gen/random';
import { SHOP_BOXES, SHOP_GOODS, SHOP_ORDER, SHOP_TUNING, isShopBox, shopGood, type ShopBoxId, type ShopGive, type ShopItemId } from './shopTable';

/**
 * よろずやの こうかんの 係（TOWN-1 区切り 1C。TOWN-1-shop.md §2.6・§2.7・§4.2・§4.3・TOWN-1.md §4.6・§5）。画面・three なし。
 * ようかいダマを はらって 品を わたす。入らない 分は その 人の 足もとへ（こうかん・箱は 止めない）。1P と 2P は who だけが ちがう。
 * たからばこの くじの たね ＝ 世界の シード・その 人（1P／2P）・その 人が その 箱を あけた 回数（`boxSeed`）。
 */

type Who = 1 | 2;
const ORB: ItemId = 'yokai_orb';

export type ShopBuyResult = 'ok' | 'short' | 'soldOut';

/** たからばこの 中身 1 つ（rarity ＝ めずらしさの ★ の 数 1〜7） */
export interface ShopResultItem {
  item: ItemId;
  count: number;
  rarity: number;
}

export interface ShopBoxResult {
  box: ShopBoxId;
  items: ShopResultItem[];
}

/** カード 1 まい の 中身（窓口 `shop.state(p).items` と 同じ 形） */
export interface ShopRow {
  id: ShopItemId;
  price: number;
  canBuy: boolean;
  soldOut: boolean;
}

export interface ShopPorts {
  /** その 人の もちもの（2P が 参加して いなければ null） */
  inventory(who: Who): Pick<Inventory, 'add' | 'count' | 'remove'> | null;
  /** 入らなかった 物を その 人の 足もとに 落とす（ふつうに ひろえる） */
  dropAtFeet(who: Who, stacks: readonly ShopGive[]): void;
  /** まだ おぼえて いない 家の レシピが ある（レシピの 記録は 世界に 1 つ。なければ まきものは 売り切れ） */
  recipesLeft(): boolean;
  /** わたした（入らなかった 分も ふくむ ぜんぶ。実績の「てにいれた」・まきものの 使い方の 合図）。なくても よい */
  gave?(who: Who, id: ShopItemId, stacks: readonly ShopGive[]): void;
}

/** その 人の 箱を あけた 回数・まきものを 買った 回数（保存する。くじの たね） */
export interface ShopOpens {
  kobako: number;
  obako: number;
  scroll: number;
}

const VERSION = 1;
interface Saved {
  v: number;
  /** [1P, 2P] */
  opens: [ShopOpens, ShopOpens];
}

const zero = (): ShopOpens => ({ kobako: 0, obako: 0, scroll: 0 });
const BOX_TAG: Record<ShopBoxId, number> = { kobako: 1, obako: 2 };

/** 箱の くじの たね（世界の シード・人・箱・その 人が その 箱を あけた 回数 n。n 回目 ＝ 0 から） */
export function boxSeed(seed: number, who: Who, box: ShopBoxId, n: number): number {
  return hashInts(subSeed(seed, SHOP_TUNING.seedSalt), who, BOX_TAG[box], n);
}

/** その たねの 箱の 中身（宝箱と 同じ くじ `rollChest`。表は SHOP_BOXES の table） */
export function rollBox(box: ShopBoxId, seed: number): ShopResultItem[] {
  return rollChest(SHOP_BOXES[box].table, seed).items.map((s) => ({ item: s.item, count: s.count, rarity: rarityTier(ITEM_DEFS[s.item as keyof typeof ITEM_DEFS].rarity).stars }));
}

export class ShopService {
  private opens_: [ShopOpens, ShopOpens] = [zero(), zero()];

  constructor(
    private readonly ports: ShopPorts,
    private readonly seed: number,
  ) {}

  /** その 人の 回数（写し） */
  opens(who: Who): ShopOpens {
    return { ...this.opens_[who - 1]! };
  }

  /** もって いる ようかいダマ（2P が いなければ 0） */
  dama(who: Who): number {
    return this.ports.inventory(who)?.count(ORB) ?? 0;
  }

  /** 売り切れ（まきもので まだの レシピが ない） */
  soldOut(id: ShopItemId): boolean {
    if (isShopBox(id)) return false;
    const g = shopGood(id)!;
    switch (g.kind) {
      case 'set':
        return false;
      case 'scroll':
        return !this.ports.recipesLeft();
      default: {
        const never: never = g;
        throw new Error(`品の しゅるい ${String(never)}`);
      }
    }
  }

  /** カードの 一覧（§4.2 の 順） */
  rows(who: Who): ShopRow[] {
    const d = this.dama(who);
    return SHOP_ORDER.map((id) => {
      const price = priceOf(id);
      const soldOut = this.soldOut(id);
      return { id, price, soldOut, canBuy: !soldOut && d >= price };
    });
  }

  /** こうかん（えらんで「こうかん」を 押した のと 同じ）。箱は 'ok' の とき 中身を 返す */
  buy(who: Who, id: ShopItemId): { status: ShopBuyResult; result: ShopBoxResult | null } {
    const inv = this.ports.inventory(who);
    if (!inv || !SHOP_ORDER.includes(id)) return { status: 'short', result: null };
    if (this.soldOut(id)) return { status: 'soldOut', result: null };
    const price = priceOf(id);
    if (inv.count(ORB) < price) return { status: 'short', result: null };
    inv.remove(ORB, price);
    const o = this.opens_[who - 1]!;
    if (isShopBox(id)) {
      const items = rollBox(id, boxSeed(this.seed, who, id, o[id]));
      o[id]++;
      this.give(who, id, items);
      return { status: 'ok', result: { box: id, items } };
    }
    const g = shopGood(id)!;
    if (g.kind === 'scroll') o.scroll++;
    this.give(who, id, g.give);
    return { status: 'ok', result: null };
  }

  /** ようかいダマが あと 何こ たりないか（たりて いれば 0） */
  short(who: Who, id: ShopItemId): number {
    return Math.max(0, priceOf(id) - this.dama(who));
  }

  serialize(): Saved {
    return { v: VERSION, opens: [{ ...this.opens_[0] }, { ...this.opens_[1] }] };
  }

  /** 読む。形が ちがう・古い セーブは 2 人とも 0 回 */
  deserialize(data: unknown): void {
    this.opens_ = [zero(), zero()];
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<Saved>;
    if (d.v !== VERSION || !Array.isArray(d.opens)) return;
    for (const i of [0, 1] as const) {
      const src = d.opens[i] as Partial<ShopOpens> | undefined;
      const cnt = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
      this.opens_[i] = { kobako: cnt(src?.kobako), obako: cnt(src?.obako), scroll: cnt(src?.scroll) };
    }
  }

  private give(who: Who, id: ShopItemId, stacks: readonly ShopGive[]): void {
    const inv = this.ports.inventory(who);
    if (!inv) return;
    const left: ShopGive[] = [];
    for (const s of stacks) {
      const n = inv.add(s.item, s.count);
      if (n > 0) left.push({ item: s.item, count: n });
    }
    if (left.length > 0) this.ports.dropAtFeet(who, left);
    this.ports.gave?.(who, id, stacks);
  }
}

/** 品・箱の ねだん（表から） */
function priceOf(id: ShopItemId): number {
  return isShopBox(id) ? SHOP_BOXES[id].price : shopGood(id)!.price;
}

/** 売り物に 出る アイテム ぜんぶ（AC15 の しらべ。箱の 中身は のぞく） */
export function shopGivenItems(): ItemId[] {
  return SHOP_GOODS.flatMap((g) => g.give.map((s) => s.item));
}

/** 「こんな ものが でるかも」の ★の ならび（その 箱の 表で 出る めずらしさ。わりあいの 数は 見せない。§2.7 の 5） */
export function boxSample(box: ShopBoxId): number[] {
  const T = chestTableOf(SHOP_BOXES[box].table);
  const on = new Set<number>();
  for (const t of T.tiers) {
    if (t.chance <= 0) continue;
    for (const [r, w] of Object.entries(t.rarity)) if ((w ?? 0) > 0) on.add(RARITY_ORDER.indexOf(r as (typeof RARITY_ORDER)[number]));
    if (t.sure) on.add(RARITY_ORDER.indexOf(t.sure));
  }
  if (T.legendary >= SHOP_TUNING.sampleLegendMin) on.add(RARITY_ORDER.indexOf('legendary'));
  return [...on].sort((a, b) => a - b).map((i) => i + 1);
}

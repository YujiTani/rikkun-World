// HOUSE-2C（#364・仕様 3.4 版 docs/design/HOUSE-2.md §2.6）「つくる」の 案の ボタンの えらび。DOM・three なし。
// むら・おしろ・こうざん の ある 形（やね・かべ・まど・と・えんとつ・のれん・はなだん）は 「つくる」の カード 1 まい（id ＝ むらの 作り方）。
// 右の せつめいの 上に 案の ボタン 3 つが 出て、えらんだ 案の アイテムが できる。えらびは パネルごとに 1 つ（1P・2P は べつ）・保存しない（開きなおすと むら）。
import type { ItemId } from '../contracts';
import { PARTS, PART_FORMS, isStyleless, kindItem, kindsOfForm } from '../house/recipes/kinds';

/** 案の ある 形ごとの アイテム（むら → おしろ → こうざん）。キー ＝ カードの id（むらの アイテム） */
const ITEMS_OF_CARD: ReadonlyMap<string, readonly ItemId[]> = new Map(
  PARTS.flatMap((part) =>
    PART_FORMS[part].filter((f) => !isStyleless(f)).map((f) => {
      const items = kindsOfForm(f).map((k) => kindItem(part, k)!);
      return [items[0]!, items] as const;
    }),
  ),
);
/** アイテム → カードの id */
const CARD_OF_ITEM: ReadonlyMap<string, string> = new Map([...ITEMS_OF_CARD].flatMap(([card, items]) => items.map((i) => [i, card] as const)));

/** 案の ある 形の 3 つの 作り方（id ＝ アイテムの id）→ むらの 作り方の id。ほかは そのまま */
export function houseCardOf(recipeId: string): string {
  return CARD_OF_ITEM.get(recipeId) ?? recipeId;
}

/** むら以外の 案（おしろ・こうざん）の 作り方か（その カードは むらの カードに まとまる） */
export const isAltLook = (recipeId: string): boolean => CARD_OF_ITEM.has(recipeId) && !ITEMS_OF_CARD.has(recipeId);

/** 案の ボタンの えらび */
export class CraftLooks {
  private readonly chosen = new Map<string, ItemId>();

  /** 案の ある カードの 案の ボタン（むら → おしろ → こうざん）と えらんで いる 案。案の ない カードは null */
  view(card: string): { items: ItemId[]; selected: ItemId } | null {
    const items = ITEMS_OF_CARD.get(card);
    return items ? { items: [...items], selected: this.chosen.get(card) ?? items[0]! } : null;
  }

  /** えらぶ（作らない）。card の 案の 1 つ で なければ false */
  pick(card: string, item: ItemId): boolean {
    if (!ITEMS_OF_CARD.get(card)?.includes(item)) return false;
    this.chosen.set(card, item);
    return true;
  }

  /** えらんで いる 案の 作り方の id（案の ない カードは card） */
  recipeOf(card: string): string {
    return this.view(card)?.selected ?? card;
  }
}

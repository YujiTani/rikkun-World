import { describe, expect, it } from 'vitest';
import { createDefaultItemInfo } from '../../craft/info/build';
import { ITEM_INFO } from '../../craft/info/table';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { LIGHT_KINDS, LIGHT_NAME, PARTS, kindName, splitKind } from '../../house/recipes/kinds';
import { allKindsOf, kindItem, type LookPart } from '../../house/recipes/lookKit';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { itemIconPixels } from '../../ui/itemIcon';
import { findUnrubiedKanji } from '../../ui/text';
import { getTilePixels } from '../../world/blocks/textures';
import { itemDef } from './registry';
import type { ItemId } from '../../contracts';

/**
 * HOUSE-2B（#364・仕様 3.3 版 §4.2。src/content/CLAUDE.md の「たしかめ」）: 家の 新しい ブロック（やね・かべ・まど・と・かざり・あかり）を ほると 手に 入る アイテム。
 * アイテムの id は 書かず kindItem（lookKit。2B の 約束）に 聞く。名前は しゅるいの 名前（例: おしろの かわらの やね）。件数は 表から 数える（#311）。
 * 値の 写し `content/__snapshots__/content.json` は 実装で `npx vitest run -u src/content` して 差分を 読む（家の しゅるい 1 つに つき アイテム 1 件の 差分だけ であること）。
 * ほる 側（dugItemOf）は src/house/lookShape.test.ts。
 */

const norm = (s: string): string => s.replace(/\s+/g, '');
const nameOf = (i: ItemId): string => itemType(i)?.name ?? i;
const parts: readonly LookPart[] = [...PARTS, 'light'];
/** いつもの 物（家の 5 つの ブロック・ちょうちん）は 2B より 前から ある アイテム。2B の 新しい アイテムは それ いがい */
const USUAL_ITEMS = new Set<string>(['house_roof', 'house_wall', 'shoji', 'house_door', 'lantern']);

/** 2B の 新しい しゅるい（いつもの 物と なし を のぞく）と その アイテム */
function newItems(): Array<{ part: LookPart; kind: string; item: ItemId; name: string }> {
  const out: Array<{ part: LookPart; kind: string; item: ItemId; name: string }> = [];
  for (const part of parts) {
    for (const kind of allKindsOf(part)) {
      if (kind === 'none') continue; // かべの なし（柱）の アイテムは ある か どうか 決めて いない
      const item = kindItem(part, kind);
      if (item === null || USUAL_ITEMS.has(item)) continue;
      out.push({ part, kind, item, name: part === 'light' ? LIGHT_NAME[kind as (typeof LIGHT_KINDS)[number]] : kindName(kind) });
    }
  }
  return out;
}

describe('家の しゅるいの アイテム（2B）: 登録', () => {
  it('しゅるいを 足した ぶんだけ アイテムが ある（表から 数える）。登録表・持ち物の 種類表に 1 回ずつ・名前は しゅるいの 名前', () => {
    const list = newItems();
    const styled = parts.flatMap((p) => allKindsOf(p).filter((k) => k !== 'none' && (splitKind(k).style !== null || k === 'shachi' || (p === 'light' && k !== 'lantern'))));
    expect(list.length, '案つきの しゅるい ＋ しゃちほこ ＋ あかり 2 つ ＝ 新しい アイテム').toBe(styled.length);
    for (const { part, kind, item, name } of list) {
      expect(itemDef(item), `${part}-${kind}: 登録表`).toBeDefined();
      expect(ITEM_TYPES.filter((x) => x.id === item), `${part}-${kind}: 持ち物の 種類表に 1 回`).toHaveLength(1);
      expect(norm(itemType(item)!.name), `${part}-${kind}: 名前`).toBe(norm(name));
    }
  });

  it('めずらしさ・色分け・2D の 絵（石の 絵に 落ちない）・説明の 行・図鑑の 文（ルビ）', () => {
    const stone = JSON.stringify(getTilePixels('stone'));
    for (const { part, kind, item } of newItems()) {
      const tag = `${part}-${kind} (${item})`;
      expect(itemRarity(item), `${tag}: めずらしさ`).toBeTypeOf('string');
      expect(CATEGORY_ITEMS[itemCategory(item)].filter((x) => x === item), `${tag}: 色分け 1 回`).toHaveLength(1);
      const px = itemIconPixels(item);
      expect(px.length, `${tag}: 絵`).toBeGreaterThan(0);
      expect(JSON.stringify(px) === stone, `${tag}: 石の 絵に 落ちて いる`).toBe(false);
      expect(ITEM_INFO[item], `${tag}: 説明の 行`).toBeDefined();
      const z = itemDef(item)!.zukan;
      expect(z.trim().length, `${tag}: 図鑑の 文`).toBeGreaterThan(0);
      const i = createDefaultItemInfo(nameOf).info(item);
      expect(findUnrubiedKanji(`${i.name}${i.use}${i.how}${i.source}${z}`), `${tag}: ルビなしの 漢字`).toEqual([]);
    }
  });

  it('しゅるいごとに 別の アイテム（同じ アイテムに ならない）', () => {
    const ids = newItems().map((x) => x.item);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

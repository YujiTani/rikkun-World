import { describe, expect, it, vi } from 'vitest';

// 絵の 作りは document が いるので、アイテム id を そのまま 返す 目印に する
vi.mock('./itemIcon', () => ({ itemIconUrl: (i: string) => `icon:${i}`, extraIconUrl: (i: string) => `extra:${i}` }));
import type { ItemId, Recipe } from '../contracts';
import { PARTS, PART_FORMS, isStyleless, kindItem, kindsOfForm } from '../house/recipes/kinds';
import { materialViews, buildTiles, type CardView } from './craftModel';
import { paintTile, type TileEls } from './craftPanel.tiles';
import { FLOWER_IDS, FLOWER_ROW } from '../house/recipes/mats';
import { itemIconUrl } from './itemIcon';

/** HOUSE-2C レビュー: 案を えらぶと カードの 絵（img の src）が かわる。はなの 材料の 点は 3 いろの 合計 */

const fakeTile = (item: string): TileEls =>
  ({
    root: { dataset: {} } as unknown as HTMLDivElement,
    art: { src: itemIconUrl(item as ItemId) } as HTMLImageElement,
    count: { textContent: '' } as HTMLSpanElement,
    queue: { textContent: '' } as HTMLSpanElement,
    barFill: { root: { hidden: true } } as never,
    recipe: {} as Recipe,
    item,
  }) as TileEls;

const card = (item: string): CardView =>
  ({ id: 'c', output: { item, count: 1 }, glowing: true, dim: false, later: false, materials: [], redItems: [], queued: 0 }) as unknown as CardView;

describe('カードの 絵は 案を えらぶと かわる', () => {
  it('paintTile: item が かわったら art.src を 入れかえ、かわらなければ さわらない', () => {
    const part = PARTS.find((p) => PART_FORMS[p].some((f) => !isStyleless(f)))!;
    const form = PART_FORMS[part].find((f) => !isStyleless(f))!;
    const [mura, shiro] = kindsOfForm(form).map((k) => kindItem(part, k)!);
    const e = fakeTile(mura!);
    const before = e.art.src;
    paintTile(e, buildTiles([card(mura!)], null, () => false)[0]!, null);
    expect(e.art.src, '同じ 案').toBe(before);
    paintTile(e, buildTiles([card(shiro!)], null, () => false)[0]!, null);
    expect(e.art.src, '案を えらんだ').toBe(itemIconUrl(shiro as ItemId));
    expect(e.art.src).not.toBe(before);
  });
});

describe('はなの 材料の 点は 3 いろの 合計', () => {
  it('オレンジ だけ 持って いても 赤く ならない（足りる）', () => {
    const own: Record<string, number> = { flower_o: 4 };
    const rows = materialViews([{ item: FLOWER_ROW, count: 3 }], (i) => own[i] ?? 0);
    expect(FLOWER_IDS).toContain('flower_o');
    expect(rows[0]).toMatchObject({ red: false, have: 4 });
    expect(rows[0]!.dots).toEqual([true, true, true]);
  });
  it('3 いろ あわせても 足りなければ 赤', () => {
    const own: Record<string, number> = { flower_o: 1, flower_p: 1 };
    const rows = materialViews([{ item: FLOWER_ROW, count: 3 }], (i) => own[i] ?? 0);
    expect(rows[0]).toMatchObject({ red: true, have: 2 });
  });
});

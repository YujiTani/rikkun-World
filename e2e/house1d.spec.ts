import { expect, test } from '@playwright/test';
import { openHouse } from './helpers/house';
import { bookAfter, putBlock, seatNow, stepAndPosition, standFacingBlock, tapMove, useBlock } from './helpers/houseFurn';

/**
 * HOUSE-1D（#341 家具の はたらき。docs/design/HOUSE-1.md §2.12・AC28・AC54、docs/tickets/HOUSE-1D.md）の E2E。
 * E2E に 書くのは 画面・入力が いる 確認と 遊びの 流れの 代表だけ（#311）。ほんだな 1 本（AC28: ほんだなを 右クリック → 本が ① もくじ）。
 * いす・まるいすの 座る／おふろの 回復／あんどんの 明かり／右の 案内の ことばは ユニット
 *   （src/house/seat.test.ts・src/dig/houseFurnUse.test.ts・src/world/light/andonLight.test.ts）。
 * 約束（フック・本の 窓口）は e2e/helpers/house.ts の 先頭の「1D の 約束」、関数は e2e/helpers/houseFurn.ts。進めるのは step の 数で、時間では 合否を 決めない（#255）。
 */

test.describe('HOUSE-1D 家具の はたらき', () => {
  test('AC28・AC54: ほんだなを 右クリック → 本が ① もくじで 開く（テーブルでは 開かない）', async ({ page }) => {
    test.setTimeout(120_000);
    await openHouse(page);

    // ---- はたらきの ない 家具（テーブル）: 右クリックしても 本は 開かない・座らない
    const { stand, block } = await standFacingBlock(page, 'table');
    const t = await useBlock(page, stand, block);
    expect(t.aimed?.id, 'テーブルを ねらえる').toBe('table');
    expect(t.hint, 'テーブルでは 右の 案内が 出ない（AC54）').toBeNull();
    const closed = await bookAfter(page);
    expect(closed.bookOpen, 'テーブルでは 本は 開かない').toBe(false);
    expect(await seatNow(page), 'テーブルには 座れない').toBeNull();

    // ---- いす: 右クリックで 座る（つなぎ）→ 60 ステップ たっても 同じ 場所 → 移動キー 1 ステップで 立つ（step.ts の 順番）
    await putBlock(page, block, 'chair');
    const c = await useBlock(page, stand, block);
    expect(c.aimed?.id, 'いすを ねらえる').toBe('chair');
    const sat = await seatNow(page);
    expect(sat?.kind, '右クリックで 座る').toBe('sit');
    expect(sat?.block, '座った マス').toEqual(block);
    const still = await stepAndPosition(page, 60);
    expect(still.player, '60 ステップ たっても プレイヤーは 同じ 場所').toEqual(sat!.position);
    expect((await seatNow(page))?.position, '座って いる まま').toEqual(sat!.position);
    await tapMove(page, 'moveForward');
    expect(await seatNow(page), '移動キーを 1 ステップ 押すと 立つ').toBeNull();

    // ---- ほんだな: 同じ 場所・同じ ねらいで ほんだなに おきかえる
    await putBlock(page, block, 'shelf');
    const s = await useBlock(page, stand, block);
    expect(s.aimed?.id, 'ほんだなを ねらえる').toBe('shelf');
    expect(s.hint?.word, '右の 案内が 出る（ことばは ユニット）').toBeTruthy();
    const open = await bookAfter(page);
    expect(open.bookOpen, '右クリックで 本が 開く').toBe(true);
    expect(open.bookView, '① もくじ').toBe('toc');
    expect(await seatNow(page), 'ほんだなは 座る 家具では ない').toBeNull();
  });
});

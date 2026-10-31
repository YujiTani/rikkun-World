import { expect, test, type Page } from '@playwright/test';
import { countOf, openHouse, stepUi } from './helpers/house';
import {
  MSG,
  blueprints,
  btnState,
  cellAt,
  clickBtn,
  clickCell,
  ed,
  editor,
  expectBubble,
  firstArchitect,
  openEditor,
  readButtons,
  reopenHouse,
} from './helpers/houseEditor';

/**
 * HOUSE-1E（#374 使いやすく。docs/design/HOUSE-1.md 2.5 版、docs/tickets/HOUSE-1E.md）の E2E。
 * 約束（フック・testid・数）は e2e/helpers/house.ts の 先頭「1E の 約束」。関数は e2e/helpers/houseEditor.ts。時間では 待たず step の 数で 進める（#255）。
 *
 * 【今は 「内装の 仮置き」の 1 本だけ】 材料の 通し 1 本（AC9b・AC18・AC20b。くら＋もちもの＋近くの たんす）は、yuzu と くらの 形を 決めなおして いる ので
 * 決まって から 足す（PO 2026-10-31）。ここには まだ 書かない。
 *
 * 内装の 仮置き 1 本（#311。E2E は 画面・入力・描画が いる 確認と 遊びの 流れの 代表だけ。数・状態だけの 基準は ユニット）:
 *   5×5 の 中で、いすと テーブルが 重なる（両方 赤）→ 重なった マスを 押すと あとから 置いた 方を えらぶ → ↻ で 両方 ふつうの 色 →
 *   右下の すみに ふとん（はみ出す・赤）→ 置く 前の 形（白／赤・家具の ある マスの 上では 出ない）→ 帯の 上の はみ出しを 押しても えらべる →
 *   つぎへ・できた！は 進まない（「あかい かぐを なおしてね」・赤い 家具が 光る）→ ↻ で ふつうの 色（見本に 出る）→ ↺ で 赤に もどる＝もどす 1 回 →
 *   つぎへ で ③ へ → 赤い まま ① で とじて 開くと ② で 開く → セーブして 開きなおしても 赤い 家具が のこる。
 * AC13（押した マス ＝ もとの マス）・AC13c（もとの マスを 中心に まわす）・AC13d（赤い わけ・重なり・えらぶ）・AC13f（すすめない）・AC13g（見本・保存）・AC44（⓪）・AC57（そばの ボタン）。
 * 音（赤く 置いた・まわした 音は ふつうと 同じ。止まった ときの 返し）と 赤い 家具の 絵・見本に 出さない 見せ方は オーナー確認（AC37b）。
 * 実装の 前は 家具に origin・bad が 無く、方眼の 外の すみに 置く ふとんは そもそも 置けない ので 赤。
 */

// ---------------------------------------------------------------- この spec だけの 関数

/** 方眼の マス (x, z) の 画面の 長方形（CSS px）。マスは 方眼の 中の div で、家具の 下でも 位置は かわらない */
async function cellBox(page: Page, x: number, z: number): Promise<{ x: number; y: number; w: number; h: number }> {
  const b = await cellAt(page, x, z).boundingBox();
  expect(b, `方眼の マス (${x}, ${z}) が 画面に 見える`).not.toBeNull();
  return { x: b!.x, y: b!.y, w: b!.width, h: b!.height };
}

/** マスの まん中を 本物の マウスで 押す（家具の 下の マスは locator.click だと 家具が 受ける ので 押せない。座標で 押す）。2 ステップ 進める */
async function mouseClickCell(page: Page, x: number, z: number): Promise<void> {
  const b = await cellBox(page, x, z);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await stepUi(page);
}

/** マスの まん中へ マウスを 動かす（置く 前の 形が 出る・消える）。2 ステップ 進める */
async function hoverCell(page: Page, x: number, z: number): Promise<void> {
  const b = await cellBox(page, x, z);
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
  await stepUi(page);
}

/** 置く 前の 形（editor-ghost）の ようす: 見えて いるか、赤い わけ（data-bad。白は null） */
async function ghostOf(page: Page): Promise<{ exists: boolean; shown: boolean; bad: string | null }> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="editor-ghost"]') as HTMLElement | null;
    if (!el) return { exists: false, shown: false, bad: null };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const shown = !el.hidden && r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
    return { exists: true, shown, bad: el.getAttribute('data-bad') };
  });
}

/** 置いた 家具の 画面（editor-furniture）の data-bad を furniture の 番号の 順に（赤く ない 家具は null） */
function domBads(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="editor-furniture"]'))
      .sort((a, b) => Number((a as HTMLElement).dataset.i) - Number((b as HTMLElement).dataset.i))
      .map((el) => el.getAttribute('data-bad')),
  );
}

/** 家具の そばの ボタン 3 つが 方眼の はこ（editor-grid。かべの 帯 こみ）から はみ出さない（AC57） */
async function expectClusterInGrid(page: Page, why: string): Promise<void> {
  const grid = await page.getByTestId('editor-grid').boundingBox();
  expect(grid, `${why}: 方眼の はこ`).not.toBeNull();
  const beside = (await readButtons(page)).filter((b) => ['take', 'turnRight', 'turnLeft'].includes(b.id));
  expect(beside.map((b) => b.id).sort(), `${why}: そばの ボタン 3 つ`).toEqual(['take', 'turnLeft', 'turnRight']);
  for (const b of beside) {
    const { x, y, w, h } = b.rect;
    const inside = x >= grid!.x - 0.5 && y >= grid!.y - 0.5 && x + w <= grid!.x + grid!.width + 0.5 && y + h <= grid!.y + grid!.height + 0.5;
    expect(inside, `${why}: ${b.id} は 方眼の はこから はみ出さない`).toBe(true);
  }
}

// ---------------------------------------------------------------- 内装の 仮置き 1 本

test.describe('HOUSE-1E 内装の 仮置き', () => {
  test('AC13・AC13c・AC13d・AC13f・AC13g・AC44・AC57: 重なると 両方 赤・すみの ふとんは 赤 → ↻ で ふつう → つぎへ で 進める', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await openHouse(page, '?seed=7'); // ?nosave=1 を つけない（保存する 世界。最後に セーブ → 開きなおす）
    const first = await firstArchitect(page);
    await openEditor(page, first.id);
    await clickBtn(page, 'next'); // ① そと → ② なか（5×5 の まま）
    let e = await ed(page);
    expect(e, '② なか。家具は まだ ない').toMatchObject({ step: 'naka', size: { w: 5, d: 5 }, furniture: [], selected: null, flash: null });
    expect(e.preview, '② の 見本に 家具は まだ ない').toMatchObject({ mode: 'inside', furniture: 0 });

    // ---- 重なる: いす（1, 1）の あと テーブル 2×1 を (0, 1) に 押す → (0, 1)(1, 1)。押した マスは 空いて いる ので 置ける。両方 赤（overlap）
    await clickBtn(page, 'furniture-chair');
    await clickCell(page, 1, 1);
    expect((await ed(page)).furniture[0], 'いすは ふつうの 色').toMatchObject({ kind: 'chair', x: 1, z: 1, rot: 0, origin: { x: 1, z: 1 }, bad: null });
    await clickBtn(page, 'furniture-table');
    await clickCell(page, 0, 1);
    e = await ed(page);
    expect(e.furniture, '重なっても 置ける（置いた 順に ならぶ）。重なった 両方が 赤').toEqual([
      { kind: 'chair', x: 1, z: 1, rot: 0, origin: { x: 1, z: 1 }, bad: 'overlap' },
      { kind: 'table', x: 0, z: 1, rot: 0, origin: { x: 0, z: 1 }, bad: 'overlap' },
    ]);
    expect(await domBads(page), '画面の 家具にも 赤い わけが つく').toEqual(['overlap', 'overlap']);
    expect(e.preview?.furniture, '赤い 家具は 見本に 出さない（どちらも 赤）').toBe(0);

    // ---- 重なった マス（1, 1）を 押すと あとから 置いた 方（テーブル）を えらぶ。そばの ボタンは 方眼の はこの 中
    await mouseClickCell(page, 1, 1);
    e = await ed(page);
    expect(e.selected, '重なった マスを 押すと あとから 置いた テーブル').toEqual({ i: 1, x: 0, z: 1 });
    await expectClusterInGrid(page, '重なった テーブルを えらんだ');

    // ---- ↻: テーブルは もとの マス（0, 1）を 中心に まわって 1×2（(0, 1)(0, 2)）。いすと 重ならなく なるので 両方 ふつうの 色。見本に 2 つ 出る
    await stepUi(page, 120); // ② に なった ときの 光りなどが おわる まで（見本の 作りなおしの 数を 前後で くらべる ため）
    const builds0 = (await ed(page)).preview!.builds;
    await clickBtn(page, 'turnRight');
    e = await ed(page);
    expect(e.furniture, 'テーブルを ↻ で 両方 ふつうの 色').toEqual([
      { kind: 'chair', x: 1, z: 1, rot: 0, origin: { x: 1, z: 1 }, bad: null },
      { kind: 'table', x: 0, z: 1, rot: 1, origin: { x: 0, z: 1 }, bad: null },
    ]);
    expect(e.selected, 'まわしても えらびは そのまま（もとの マスも 同じ）').toEqual({ i: 1, x: 0, z: 1 });
    expect(await domBads(page), '画面の 赤い 印も きえる').toEqual([null, null]);
    expect(e.preview?.furniture, 'ふつうの 色に なった 2 つが 見本に 出る').toBe(2);
    expect(e.preview?.builds, '見本は 形が かわった 1 回だけ 作りなおす').toBe(builds0 + 1);

    // ---- すみの ふとん: 置く 前の 形（白／赤）。押した マス ＝ もとの マス（右下 (4, 4)）。家具の ある マスの 上では 出ない
    await clickBtn(page, 'furniture-futon');
    await hoverCell(page, 2, 2);
    expect(await ghostOf(page), 'ふとん (2, 2)(2, 3) は 入る ので 白い 形').toEqual({ exists: true, shown: true, bad: null });
    await hoverCell(page, 4, 4);
    expect(await ghostOf(page), '右下の すみ: 足が 方眼の 外 → 赤い 形（out）。赤でも 押せる').toEqual({ exists: true, shown: true, bad: 'out' });
    await hoverCell(page, 1, 0);
    expect(await ghostOf(page), '(1, 0)(1, 1) は いすと 重なる → 赤い 形（overlap）').toEqual({ exists: true, shown: true, bad: 'overlap' });
    await hoverCell(page, 1, 1);
    expect((await ghostOf(page)).shown, '家具の ある マスの 上では 置く 前の 形を 出さない（押すと えらぶ ため）').toBe(false);
    await hoverCell(page, 4, 0);
    expect((await ghostOf(page)).shown, '空いた マスに 動かすと また 出る').toBe(true);

    // ---- 右下の すみ (4, 4) に ふとんを 押す → 置ける（赤）。置いた すぐ あとは 形を かくす
    await clickCell(page, 4, 4);
    e = await ed(page);
    expect(e.furniture[2], '右下の すみの ふとん（足が 方眼の 外）').toEqual({ kind: 'futon', x: 4, z: 4, rot: 0, origin: { x: 4, z: 4 }, bad: 'out' });
    expect(e.furniture.map((f) => f.bad), 'ほかの 2 つは ふつうの まま').toEqual([null, null, 'out']);
    expect(await domBads(page), '画面でも ふとんだけ 赤い').toEqual([null, null, 'out']);
    expect((await ghostOf(page)).shown, '置いた すぐ あとは 置く 前の 形を かくす').toBe(false);
    expect(e.preview?.furniture, '赤い ふとんは 見本に 出ない（ふつうの 2 つだけ）').toBe(2);
    await testInfo.attach('② すみの ふとん（赤）', { body: await page.screenshot(), contentType: 'image/png' });

    // ---- 帯の 上に 見えて いる はみ出し（足の マス）を 押しても その ふとんを えらぶ【PO 案】。そばの ボタンは 方眼の はこの 中（AC57）
    const foot = await cellBox(page, 4, 4);
    await page.mouse.click(foot.x + foot.w / 2, foot.y + foot.h + 6); // (4, 4) の すぐ 下 ＝ 下の かべの 帯（高さ 16）に はみ出した 足
    await stepUi(page);
    e = await ed(page);
    expect(e.selected, '帯の 上の はみ出しを 押しても ふとんを えらぶ').toEqual({ i: 2, x: 4, z: 4 });
    expect((await btnState(page, 'furniture-futon'))?.pressed, '置いた 家具を えらぶと 右の 家具の えらびは はずれる').toBe(false);
    await expectClusterInGrid(page, '右下の すみの 赤い ふとんを えらんだ');

    // ---- すすめない（AC13f・AC44 ⓪）: ボタンは うすく ならない。② の つぎへ・できた！は 進まない。ふきだし・赤い 家具が 1 回 光る。形・もどす・せっけいずは かわらない
    expect((await btnState(page, 'next'))?.enabled, '赤い 家具が あっても「つぎへ」は うすく ならない').toBe(true);
    expect((await btnState(page, 'done'))?.enabled, '赤い 家具が あっても「できた！」は うすく ならない').toBe(true);
    const before = await ed(page);
    expect(before.flash, 'まだ 光らせて いない').toBeNull();
    await clickBtn(page, 'next');
    e = await ed(page);
    expect(e.step, '赤い 家具が ある 間は ② の つぎへで ③ へ 進まない').toBe('naka');
    await expectBubble(page, MSG.fixRed, '赤い 家具で つぎへ');
    expect(e.flash, '赤い 家具 ぜんぶ（ふとん 1 つ）が 1 回 光る').toEqual({ items: [2], seq: 1 });
    expect(e.furniture, '形は かわらない').toEqual(before.furniture);
    expect(e.canUndo, 'もどす の 記録に 入らない').toBe(before.canUndo);
    await clickBtn(page, 'done');
    e = await ed(page);
    expect(e.step, '赤い 家具が ある 間は できた！でも 進まない').toBe('naka');
    await expectBubble(page, MSG.fixRed, '赤い 家具で できた！（名前 0 字でも ⓪ が いちばん 先）');
    expect(e.flash, 'もう 1 回 光る（seq が ふえる）').toEqual({ items: [2], seq: 2 });
    expect(e.canUndo, 'もどす の 記録に 入らない').toBe(before.canUndo);
    expect(await countOf(page, 'sekkeizu'), 'せっけいずは できない').toBe(0);
    expect(await blueprints(page), 'blueprints() も ふえない').toEqual([]);
    // ① からの できた！も ② なか へ 切りかわる（光る のが 見える ように）。① の つぎへ・② の まえへ は 赤くても 進む
    await clickBtn(page, 'prev');
    expect((await ed(page)).step, '② の まえへ は 赤くても 進む').toBe('soto');
    await clickBtn(page, 'done');
    e = await ed(page);
    expect(e.step, '① で できた！が 止まったら ② なか へ 切りかえる').toBe('naka');
    await expectBubble(page, MSG.fixRed, '① からの できた！');
    expect(e.flash, '3 回目の 光り').toEqual({ items: [2], seq: 3 });
    await clickBtn(page, 'prev');
    await clickBtn(page, 'next');
    expect((await ed(page)).step, '① の つぎへ は 赤くても 進む').toBe('naka');

    // ---- ↻: ふとんは もとの マス（4, 4）を 中心に まわって 2×1（左上 (3, 4)）。部屋に おさまり ふつうの 色。見本に 出る
    await stepUi(page, 120); // ① へ もどって ② に なった 光りが おわる まで
    await mouseClickCell(page, 4, 4); // えらびが はずれて いても えらびなおす（ふとんの 上の マスを 押すと えらぶ）
    expect((await ed(page)).selected, 'ふとんを えらんだ').toEqual({ i: 2, x: 4, z: 4 });
    const b1 = (await ed(page)).preview!.builds;
    await clickBtn(page, 'turnRight');
    e = await ed(page);
    expect(e.furniture[2], '↻ 1 回で 部屋に おさまる（足が 方眼の 中。まくらの マスは (4, 4) の まま）').toEqual({
      kind: 'futon',
      x: 3,
      z: 4,
      rot: 1,
      origin: { x: 4, z: 4 },
      bad: null,
    });
    expect(e.selected, 'まわしても えらびは そのまま').toEqual({ i: 2, x: 4, z: 4 });
    expect(await domBads(page), '赤い 印が きえる').toEqual([null, null, null]);
    expect(e.preview?.furniture, 'ふつうの 色に なった ふとんも 見本に 出る（3 つ）').toBe(3);
    expect(e.preview?.builds, '見本は 形が かわった 1 回だけ 作りなおす').toBe(b1 + 1);
    await testInfo.attach('② ↻ で ふつうの 色', { body: await page.screenshot(), contentType: 'image/png' });

    // ---- ↺: 赤く なる 向き（rot 0）にも まわる。それも もどす の 1 回で 1 つ 前の 向きに もどる
    await clickBtn(page, 'turnLeft');
    e = await ed(page);
    expect(e.furniture[2], '↺ で 赤く なる 向き（rot 0）にも まわる').toEqual({ kind: 'futon', x: 4, z: 4, rot: 0, origin: { x: 4, z: 4 }, bad: 'out' });
    await clickBtn(page, 'undo');
    e = await ed(page);
    expect(e.furniture[2], 'もどす 1 回で 1 つ 前の 向き（rot 1）').toEqual({ kind: 'futon', x: 3, z: 4, rot: 1, origin: { x: 4, z: 4 }, bad: null });

    // ---- 赤が なければ つぎへ で ③ へ
    await clickBtn(page, 'next');
    expect((await ed(page)).step, '赤い 家具が なければ ③ へ 進める').toBe('namae');

    // ---- 赤い まま ① で とじて 開くと ② で 開く。赤い 家具は のこる（AC13g）
    await clickBtn(page, 'prev');
    await mouseClickCell(page, 4, 4);
    await clickBtn(page, 'turnLeft'); // また 赤く する
    const red = await ed(page);
    expect(red.furniture[2]?.bad, 'また 赤い').toBe('out');
    await clickBtn(page, 'prev'); // ② → ①（赤くても 進む）
    expect((await ed(page)).step).toBe('soto');
    await clickBtn(page, 'close'); // ✕
    expect(await editor(page), 'とじると editor() は null').toBeNull();
    await openEditor(page, first.id);
    e = await ed(page);
    expect(e.step, '赤い 家具が ある 作りかけは ① で とじても ② なか で 開く').toBe('naka');
    expect(e.furniture, 'とじて 開いても 赤い 家具は のこる（x・z・rot・origin・bad が 同じ）').toEqual(red.furniture);
    expect(e.selected, 'えらびは のこらない').toBeNull();

    // ---- セーブして 開きなおしても 赤い 家具が のこる（オートセーブ）
    await page.evaluate(() => (window as any).__rikkun.save.now());
    await reopenHouse(page);
    await openEditor(page, (await firstArchitect(page)).id);
    e = await ed(page);
    expect(e.step, '開きなおしても ② なか で 開く').toBe('naka');
    expect(e.furniture, '開きなおしても 赤い 家具が 同じ').toEqual(red.furniture);
  });
});

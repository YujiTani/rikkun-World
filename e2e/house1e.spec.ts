import { expect, test, type Page } from '@playwright/test';
import { countOf, legacyKura, menuState, openHouse, press, putTansu, setBag, setTansu, stepUi, talkTo, tansuHas } from './helpers/house';
import {
  MSG,
  blueprints,
  btnState,
  cellAt,
  clickBtn,
  clickCell,
  clickDisabled,
  ed,
  editor,
  expectBubble,
  firstArchitect,
  needOf,
  openEditor,
  openEditorFast,
  plainText,
  readButtons,
  reopenHouse,
  setForm,
  squash,
} from './helpers/houseEditor';
import { settleWorld } from './helpers/houseBuilt';
import { MSG_SITE, afterBuild, buildingOf, cursorOf, firstBonusOf, layYard, pressKey, setBuildTicks, stockNow } from './helpers/houseSite';

/**
 * HOUSE-1E（#374 使いやすく。docs/design/HOUSE-1.md 2.5 版、docs/tickets/HOUSE-1E.md）の E2E。
 * 約束（フック・testid・数）は e2e/helpers/house.ts の 先頭「1E の 約束」。関数は e2e/helpers/houseEditor.ts。時間では 待たず step の 数で 進める（#255）。
 *
 * 2 本（#311。E2E は 画面・入力・描画が いる 確認と 遊びの 流れの 代表だけ。数・状態だけの 基準は ユニット）:
 *   ・材料の 通し（AC9b・AC18・AC20b・AC15・AC51・AC43。くらは ない。材料は もちもの＋近くの たんす）
 *   ・内装の 仮置き（AC13 ほか）
 *
 * 材料の 通し 1 本: 新しい 世界の はじめての 家（5×5・窓 0・ふとん 1。ぬの・いとは おまけ）の せっけいず → き 24・いし 25 が いる。
 *   近くの たんす〔き 10・いし 5〕だけ・もちもの〔き 16・いし 22〕だけ では 一覧で 押せず（押すと ひつような もの。列の 見出しは「ひつよう」「ある」「たりない」）、
 *   50 マスの たんすは 数えない、2 つ 合わせると 押せる（ある ＝ 26・27）→ 場所を 用意して 建てると き は たんす 0・もちもの 2、いし は たんす 0・もちもの 2。
 *   メニューに くらの ボタンが ない・`legacyKura()` は null。数・順番・かみ・ふでの 細かい 基準は ユニット（src/house/materials.test.ts・editor/sheet.test.ts・legacyKura.test.ts）。
 *
 * 内装の 仮置き 1 本:
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
  // ボタンの はこは CSS の ふわっと（ed-fade、とうめい → 見える）で 出る。これは step で なく 時計で 進む ので、
  // おそい CI だと 押した すぐ あとは まだ とうめいで readButtons に 見えない。ふわっとが おわるのを 待ってから 読む
  await page.getByTestId('editor-cluster').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
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

// ---------------------------------------------------------------- 材料の 通し 1 本

/** はじめての 家（5×5・窓 0・ふとん 1）の せっけいずを 作る。ふとん だけ なので 確かめの まどで ［このまま つくる］。番号を 返す */
async function makeFutonPlan(page: Page): Promise<number> {
  const first = await firstArchitect(page);
  await openEditorFast(page, first.id);
  await setForm(page, { windows: 0, furniture: [{ kind: 'futon', x: 0, z: 0, rot: 0 }], front: 'もも', back: 'のいえ' });
  await setBag(page, { paper: 2, fude: 1 });
  await press(page, 'done');
  expect((await ed(page)).confirm, 'ふとん だけ → 確かめの まど').toBe('futonOnly');
  await press(page, 'yes');
  const bps = await blueprints(page);
  expect(bps, 'せっけいずが 1 まい できた').toHaveLength(1);
  await press(page, 'close');
  return bps[0]!.number;
}

/** もちものの その 物の 数を n に する（ほかの 物は そのまま） */
function setBagCount(page: Page, item: string, n: number): Promise<void> {
  return page.evaluate(
    ({ item, n }) => {
      const h = (window as any).__rikkun;
      const cur = h.inventory.count(item) as number;
      if (n > cur) h.inventory.add(item, n - cur);
      else if (n < cur) h.inventory.remove(item, cur - n);
      h.step(1);
    },
    { item, n },
  );
}

test.describe('HOUSE-1E 材料の 通し', () => {
  test('AC9b・AC18・AC20b・AC51・AC43: き 24 ＝ たんす 10 ＋ もちもの 16、いし 25 ＝ たんす 5 ＋ もちもの 22 → 合わせて そろえば 一覧で 押せる → 建てると たんす → もちもの の 順に へる', async ({ page }) => {
    test.setTimeout(300_000);
    await openHouse(page); // 新しい 世界（保存しない）。はじめての 家
    const first = await firstArchitect(page);
    // 世界に もとから ある たんすの 中身は 材料に まぜない
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      for (const p of h.storage.list()) for (let i = 0; i < 54; i++) h.storage.set(p.x, p.y, p.z, i, null);
    });
    const number = await makeFutonPlan(page);
    const slot = (await blueprints(page)).find((b) => b.number === number)!.slot;
    expect(await firstBonusOf(page), 'まだ 1 けんも 建て はじめて いない').toBe(true);

    // ---- 建築士さんの そばに 立って（まわり 9×9 が 平らに なる）から たんすを 置く
    await talkTo(page, first.id, 'hook');
    const top = await menuState(page);
    expect(top.buttons.map((b) => b.id), 'AC43 メニューに くらの ボタンは ない').not.toContain('kura');
    expect((await plainText(page, 'house-menu')) ?? '', 'メニューに「くら」の 字は 出ない').not.toContain('くら');
    expect(await legacyKura(page), 'この 世界に 前の セーブの くらの 物は ない').toBeNull();
    await press(page, 'close');
    const near = await putTansu(page, -12, 4, {}); // 近くの たんす（足もとの 西 12 マス・南 4 マス。建築士さんの 平らに する 9×9 の 外）
    const far = await putTansu(page, 0, 50, { log: 64, stone: 64 }); // 遠い たんす（南 50 マス。範囲 40 の 外）
    expect(await tansuHas(page, far, 'log'), '遠い たんすは ちゃんと 置けた').toBe(64);

    const rows0 = await needOf(page, slot);
    const rowOf = async (item: string) => (await needOf(page, slot)).find((r) => r.item === item);
    expect(rows0.find((r) => r.item === 'log'), 'き 24').toMatchObject({ need: 24, bonus: 0 });
    expect(rows0.find((r) => r.item === 'stone'), 'いし 25').toMatchObject({ need: 25, bonus: 0 });
    expect(rows0.find((r) => r.item === 'cloth'), 'ふとんの ぬの ＝ おまけ').toMatchObject({ need: 0, bonus: 3 });
    expect(rows0.find((r) => r.item === 'string'), 'ふとんの いと ＝ おまけ').toMatchObject({ need: 0, bonus: 1 });

    /** たんす〔近い 方〕・もちものに 入れる き・いし を きめて、一覧の カードが 押せるか と ある の 数を 返す（開いて しらべ、とじる） */
    const arrange = async (tansu: { log: number; stone: number }, bag: { log: number; stone: number }) => {
      await setTansu(page, near, tansu);
      await setBagCount(page, 'log', bag.log);
      await setBagCount(page, 'stone', bag.stone);
      await talkTo(page, first.id, 'hook');
      const pick = await press(page, 'build');
      expect(pick.page, 'けんちくを はじめる の 一覧').toBe('pick');
      const enabled = pick.buttons.find((b) => b.id === `pick-${slot}`)?.enabled;
      return { enabled, log: await rowOf('log'), stone: await rowOf('stone') };
    };

    // ---- 何も ない
    let r = await arrange({ log: 0, stone: 0 }, { log: 0, stone: 0 });
    expect(r.enabled, 'もちものにも たんすにも ない → 押せない').toBe(false);
    expect([r.log?.have, r.stone?.have], '遠い たんすは 数えない').toEqual([0, 0]);
    await press(page, 'close');

    // ---- たんす だけ（き 10・いし 5）→ たりない。押すと ひつような もの（見出しは「ひつよう」「ある」「たりない」）
    r = await arrange({ log: 10, stone: 5 }, { log: 0, stone: 0 });
    expect(r.enabled, 'たんす だけでは たりない').toBe(false);
    expect(r.log, 'き: たんす 10').toMatchObject({ have: 10, short: 14 });
    expect(r.stone, 'いし: たんす 5').toMatchObject({ have: 5, short: 20 });
    await clickDisabled(page, `pick-${slot}`); // うすい カードを 本物の マウスで 1 回
    const need = await menuState(page);
    expect(need.page, '押すと ひつような もの').toBe('need');
    expect(squash(need.bubble), 'ふきだし').toBe(squash(MSG_SITE.short));
    // エディターの ひつような もの（かくれて いる）も 同じ testid なので、見えて いる 方を 見る
    await expect(page.getByTestId('house-need').filter({ visible: true })).toBeVisible();
    expect(squash((await plainText(page, 'need-head')) ?? ''), '列の 見出し').toBe('ひつようあるたりない');
    expect((await plainText(page, 'house-need')) ?? '', 'ひつような ものに「くら」は 出ない').not.toContain('くら');
    const shown = await page.getByTestId('need-row').evaluateAll((els) =>
      els.map((el) => ({ item: el.getAttribute('data-item'), have: Number(el.getAttribute('data-have')), short: Number(el.getAttribute('data-short')) })),
    );
    expect(shown.find((x) => x.item === 'log'), '画面の 行: き').toMatchObject({ have: 10, short: 14 });
    expect(shown.find((x) => x.item === 'stone'), '画面の 行: いし').toMatchObject({ have: 5, short: 20 });
    await press(page, 'close');

    // ---- もちもの だけ（き 16・いし 22）→ たりない
    r = await arrange({ log: 0, stone: 0 }, { log: 16, stone: 22 });
    expect(r.enabled, 'もちもの だけでは たりない').toBe(false);
    expect(r.log, 'き: もちもの 16').toMatchObject({ have: 16, short: 8 });
    expect(r.stone, 'いし: もちもの 22').toMatchObject({ have: 22, short: 3 });
    await press(page, 'close');

    // ---- 合わせると そろう（ある ＝ 26・27）→ 押せる
    r = await arrange({ log: 10, stone: 5 }, { log: 16, stone: 22 });
    expect(r.enabled, 'たんす ＋ もちもの で そろえば 押せる').toBe(true);
    expect(r.log, 'き: 10 ＋ 16').toMatchObject({ have: 26, short: 0 });
    expect(r.stone, 'いし: 5 ＋ 22').toMatchObject({ have: 27, short: 0 });
    expect(await tansuHas(page, far, 'log'), '遠い たんすは そのまま').toBe(64);
    await press(page, 'close');

    // ---- 場所を 用意して 建てる（AC20b）。へる 前の 数を おぼえる
    await layYard(page, first, 7, 7);
    await settleWorld(page);
    const items = ['log', 'stone', 'cloth', 'string'];
    const before = await stockNow(page, near, items);
    expect({ tansu: [before.tansu.log, before.tansu.stone], bag: [before.bag.log, before.bag.stone] }, '建てる 前の 数').toEqual({ tansu: [10, 5], bag: [16, 22] });
    await talkTo(page, first.id, 'hook');
    await press(page, 'build');
    const sky = await press(page, 'pick', slot);
    expect(sky.page, '上空の 視点').toBe('sky');
    expect(await stockNow(page, near, items), '確かめの 前は へらない').toEqual(before);
    await setBuildTicks(page, 1800);
    await pressKey(page, 'Enter');
    expect((await cursorOf(page))?.confirm, 'Enter で 確かめの まど').toBe(true);
    await pressKey(page, 'Enter'); // ［ここに たてる］
    expect(await buildingOf(page), '建築が 始まった').not.toBeNull();

    const after = await stockNow(page, near, items);
    expect(after, 'たんす → もちもの の 順に 必要な 分だけ へった').toEqual(afterBuild(before, rows0));
    expect({ tansu: [after.tansu.log, after.tansu.stone], bag: [after.bag.log, after.bag.stone] }, 'き: たんす 0・もちもの 2 ／ いし: たんす 0・もちもの 2').toEqual({ tansu: [0, 0], bag: [2, 2] });
    expect([after.bag.cloth, after.tansu.cloth, after.bag.string, after.tansu.string], 'ぬの・いとは おまけ（どこからも へらない）').toEqual([0, 0, 0, 0]);
    expect(await tansuHas(page, far, 'log'), '遠い たんすは へらない').toBe(64);
    expect(await tansuHas(page, far, 'stone')).toBe(64);
    expect(await firstBonusOf(page), 'はじめての 家の おまけを 使った').toBe(false);
    expect((await blueprints(page)).map((b) => b.number), 'せっけいずは のこる').toContain(number);
    expect(await legacyKura(page), 'くらの 物は ずっと ない').toBeNull();
  });
});

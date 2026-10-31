import { expect, test, type Page } from '@playwright/test';
import { TID, clockOf, countOf, findOtherArchitect, fudeLeft, kura, menuState, openHouse, press, setBag, stepUi, talkTo } from './helpers/house';
import {
  FURNITURE,
  FURNITURE_ROWS,
  MSG,
  SUFFIXES,
  bandMarkIssues,
  blueprints,
  btnState,
  clickBtn,
  clickCell,
  clickDisabled,
  clearFurniture,
  clickFurniture,
  drawStats,
  ed,
  edit,
  editor,
  editorBtnIds,
  editorMismatch,
  expectBubble,
  expectHeadings,
  expectResumesAfter600,
  firstArchitect,
  formOf,
  furnitureAt,
  furnitureButtonRows,
  fillFurniture,
  gameKeysIgnored,
  handMarkIssues,
  handMarks,
  mouseDragPreview,
  needOf,
  norm360,
  openEditor,
  openEditorFast,
  plainText,
  previewDrag,
  pressEsc,
  readButtons,
  reopenHouse,
  setForm,
  shapeOf,
  squash,
  tooltipNameOf,
} from './helpers/houseEditor';

/**
 * HOUSE-1B（#339 エディター・せっけいず。docs/design/HOUSE-1.md §2.5〜2.7・§4.9・§6、docs/tickets/HOUSE-1B.md の「PR-1」「PR-2」の 行）の E2E の 通し。
 * PR-2（見本の ドラッグ・また 回り出す・手の 印・② の 帯の 印）の 通しの 分は「PR-2」と 書いた 所。PR-2 の 細かい 確かめ（wheel・wait・光り・hover・よくない ことば・端の 数）は e2e/house1b-pr2.spec.ts。
 * E2E に 書くのは 画面・入力・描画が いる 確認と 遊びの 流れの 代表だけ（#311）。数・状態だけの 基準は ユニット（developer）:
 *   AC8b・AC9〜AC13b（計算・置ける 場所・まわす・あかり）・AC11・AC12・AC44・AC44b・AC45・AC46・AC48・AC55 の 細かい 組み合わせ・AC32b の 古い セーブ。
 * ここは ゲーム本体・画面への つなぎ漏れを 見る:
 *   1. エディターの 通し 1 本（AC43 の PR-1 の 分）: 話す → せっけいずを つくる → ① 大きさ・まどの かず → ② 家具を 置く・そばの ボタンで ↻・とる → Esc の 順（AC55）→
 *      とじて べつの 建築士さんで 開く（AC47）→ ひつような もの → ③ 名前（AC14）→ できた！の しらべ（AC44・AC44b）→ せっけいず（AC15・AC45）→ あたらしい せっけいず（AC47）。
 *      AC41（時刻が 止まる）・AC57（そばの ボタン）・AC13b（あかり）も この 中。
 *      PR-2: ① で 見本を 本物の マウスで ドラッグ（押した まま 700 コマ 回らない → はなして 600 コマで 回り出す・手の 印〔AC50〕）と ② の かべの 帯の 印（窓の 数・場所と 戸。AC56・AC43）。
 *   2. 見本（AC34 ③・AC50 の 自動で 回る 所・AC41）: いちばん 大きい 形でも 描画回数 24 以下・回るだけでは 作りなおさない・1 コマ 0.3°・ゲームの 時間は 止まって いる。
 *   3. 動きを へらす 設定（AC50）: 見本は 回らず angle 28 の まま。
 *   4. 保存（AC32b・AC47）: セーブして 読みこみなおしても 作りかけ・せっけいず・ふでの 記録・次の 番号が 同じ。PR-2: 見本の 向き〔まわした〕は のこらない（touched: false）。
 * AC35（UI 検査）は e2e/ui-gate.spec.ts の house-editor-*・house-confirm-*・house-need・house-bubble-*・house-sekkeizu-name。AC3 の 1B の 分（ふで）は e2e/house1a.spec.ts。
 *
 * 窓口は 仕様 §6.1 の `window.__rikkun.house`。ボタンの id・画面の data-testid・仕様に 書いて ない 形は e2e/helpers/house.ts の 先頭（「1B の 約束」）。
 * 実装の 前は `window.__rikkun.house.architects` も 1B の 窓口も 無いので 赤。
 */

/** 持ち物を ぜんぶ 36 マス うめる（0 に かみ 2、1 に ふで、のこりは 石）。空きが 1 つも ない 状態 */
async function fillBagFull(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.inventory.clear();
    h.inventory.setSlot(0, { item: 'paper', count: 2 });
    h.inventory.setSlot(1, { item: 'fude', count: 1 });
    for (let i = 2; i < 36; i++) h.inventory.setSlot(i, { item: 'stone', count: 64 });
    h.step(1);
  });
}

test.describe('HOUSE-1B エディター・せっけいず（PR-1 ＋ PR-2 の 通し）', () => {
  test('AC43・AC47・AC14・AC15・AC55・AC57: エディターの 通し — ① そと → ② なか → ③ なまえ → できた！ → せっけいず', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await openHouse(page);
    const first = await firstArchitect(page);

    // ---- 話す → メニュー「せっけいずを つくる」を マウスで 押す → エディター（AC43）
    await openEditor(page, first.id);
    expect(await countOf(page, 'fude'), 'はじめて 話すと ふでも もらう（AC3・AC46）').toBe(1);
    expect((await menuState(page)).bubble.trim(), '開いた ときは エディターの ふきだしは 出ない').toBe('');

    // ---- ① そと: はじめから よこ 5・たて 5 が えらんで ある（新 20）。すぐ「つぎへ」が 押せる
    const e0 = await ed(page);
    expect(e0, '作りかけが ない とき').toMatchObject({
      step: 'soto',
      size: { w: 5, d: 5 },
      windows: 0,
      windowKind: 'shoji',
      roof: 'flat',
      light: 'lantern',
      furniture: [],
      selected: null,
      name: { front: '', back: SUFFIXES[0] },
      canUndo: false,
      canRedo: false,
      confirm: null,
    });
    expect(e0.preview, '① では 見本が 出る').not.toBeNull();
    await expectHeadings(page, 'soto');
    await expect(page.getByTestId('editor-step-soto'), 'いま いる すすみの 印').toHaveAttribute('aria-current', 'step');
    for (const s of ['soto', 'naka', 'namae']) {
      const mark = page.getByTestId(`editor-step-${s}`);
      expect(await mark.evaluate((el) => el.tagName.toLowerCase() === 'button' || el.getAttribute('role') === 'button' || (el.getAttribute('data-testid') ?? '').startsWith('house-btn-')), `すすみの 印 ${s} は 押せない`).toBe(false);
    }
    const ids1 = await editorBtnIds(page);
    for (const id of ['undo', 'redo', 'close', 'new', 'need', 'done', 'next', 'width-5', 'width-7', 'width-9', 'depth-5', 'depth-7', 'depth-9', 'windowsDown', 'windowsUp', 'windowKind-shoji', 'roof-flat']) {
      expect(ids1, `① には ${TID.btn(id)} が ある`).toContain(id);
    }
    for (const id of ['prev', 'take', 'turnRight', 'turnLeft', 'furniture-futon', 'light', 'char-あ']) expect(ids1, `① には ${TID.btn(id)} は 出ない`).not.toContain(id);
    expect((await btnState(page, 'next'))?.enabled, 'はじめから「つぎへ」が 押せる（新 20）').toBe(true);
    for (const id of ['undo', 'redo', 'windowsDown']) expect((await btnState(page, id))?.enabled, `${id} は まだ 押せない`).toBe(false);
    expect((await btnState(page, 'width-5'))?.pressed, 'よこ 5 を えらんで ある').toBe(true);
    expect((await btnState(page, 'depth-5'))?.pressed, 'たて 5 を えらんで ある').toBe(true);
    expect((await btnState(page, 'width-7'))?.pressed, 'よこ 7 は えらんで いない').toBe(false);
    expect((await btnState(page, 'windowKind-shoji'))?.pressed, 'しょうじ ✓').toBe(true);
    expect((await btnState(page, 'roof-flat'))?.pressed, 'たいら ✓').toBe(true);
    expect(await editorMismatch(page), '画面と menu() の ちがい（①）').toEqual([]);
    // AC41: エディターが 開いて いる 間は 時刻が 止まる（step(600) の 前後で 同じ）
    const clock0 = await clockOf(page);
    await stepUi(page, 600);
    expect(await clockOf(page), 'エディターが 開いて いる 間は 時刻が 止まる').toEqual(clock0);
    // AC14: どの すすみでも ゲームの キーは 効かない
    await gameKeysIgnored(page, '① そと');
    await testInfo.attach('① そと', { body: await page.screenshot(), contentType: 'image/png' });

    // ---- ① の 操作（マウス）: 大きさ・まどの かず・もどす／すすむ・今は 1 つだけの しゅるい
    await clickBtn(page, 'width-7');
    let e = await ed(page);
    expect(e.size, 'よこ 7・たて 5').toEqual({ w: 7, d: 5 });
    expect(e.canUndo, '大きさを かえると もどせる').toBe(true);
    expect((await btnState(page, 'width-7'))?.pressed).toBe(true);
    expect((await btnState(page, 'width-5'))?.pressed).toBe(false);
    expect(e.windowMax, 'まどの かずの 上限 ＝ うしろ (よこ＋1)÷2 ＋ ひだり・みぎ 2 × (たて＋1)÷2（§4.2）').toBe((7 + 1) / 2 + 2 * ((5 + 1) / 2));
    await clickBtn(page, 'windowsUp');
    await clickBtn(page, 'windowsUp');
    e = await ed(page);
    expect(e.windows, 'まどの かず 2').toBe(2);
    expect(e.windowCells, '窓の 場所は まどの かずと 同じ 数').toHaveLength(2);
    expect((await btnState(page, 'windowsDown'))?.enabled, 'まどの かずが 1 以上 なら − が 押せる').toBe(true);
    // しょうじ・たいら は 今は 1 つだけ。押しても 形は かわらず、もどす にも 入らない（AC11）
    const beforeKinds = await ed(page);
    await clickBtn(page, 'windowKind-shoji');
    await clickBtn(page, 'roof-flat');
    const afterKinds = await ed(page);
    expect({ shape: shapeOf(afterKinds), canUndo: afterKinds.canUndo, canRedo: afterKinds.canRedo }, 'しょうじ・たいらを 押しても 形・もどす は かわらない').toEqual({
      shape: shapeOf(beforeKinds),
      canUndo: beforeKinds.canUndo,
      canRedo: beforeKinds.canRedo,
    });
    // ↶ もどす ・ ↷ すすむ（上の 帯。マウスで）
    await clickBtn(page, 'undo');
    e = await ed(page);
    expect(e.windows, 'もどす で まどの かず 1').toBe(1);
    expect(e.canRedo, 'もどすと すすむが 押せる').toBe(true);
    await clickBtn(page, 'redo');
    e = await ed(page);
    expect(e.windows, 'すすむ で まどの かず 2').toBe(2);
    expect(e.canRedo, 'すすむを つかい きった').toBe(false);

    // ---- PR-2 見本を 本物の マウスで ドラッグ（AC50・AC43 の 通し）: さわる 前は 手の 印が 1 こ。押すと すぐ 止まり、押した まま 700 コマ すすめても 回らない。
    //      はなして 600 コマで その 向き・見おろす 角度の まま また 回り出す（手の 印は 出ない）。もどす／すすむ の 記録には 入らない
    await stepUi(page, 100); // まどの かずを かえた 光り（窓を 見せに 回る 30 コマ・光る 90 コマ）が おわって から さわる
    expect(await handMarks(page), '① さわる 前は 見本の すみに 手の 印が 1 こ').toBe(1);
    expect(await handMarkIssues(page), '手の 印（見本の 右下・「くるっ」）').toEqual([]);
    const undoBefore = await ed(page);
    const drag = await mouseDragPreview(page, 100, 40, {
      hold: 700,
      whileHeld: async () => expect(await handMarks(page), '押した まま（さわった）: 手の 印は 消えて いる').toBe(0),
    });
    expect(drag.before, '押す 前').toMatchObject({ mode: 'outside', touched: false, wait: null });
    expect(drag.held, '押した まま 700 コマ すすめても').toMatchObject({ touched: true, wait: 600 });
    expect(drag.held.angle, '右へ 100 px で angle が 50 へり（0 を こえたら 360 から）、押した まま 700 コマ たっても かわらない').toBeCloseTo(norm360(drag.before.angle - 50), 1);
    expect(drag.held.pitch, '下へ 40 px で pitch が 20 ふえる').toBeCloseTo(drag.before.pitch + 20, 1);
    expect(drag.after, 'はなした 直後も touched: true・wait: 600').toMatchObject({ touched: true, wait: 600 });
    expect(drag.after.angle, 'はなした だけでは angle は かわらない').toBeCloseTo(drag.held.angle, 3);
    e = await ed(page);
    expect({ canUndo: e.canUndo, canRedo: e.canRedo }, '見本を まわしても もどす／すすむ の 記録は かわらない').toEqual({ canUndo: undoBefore.canUndo, canRedo: undoBefore.canRedo });
    expect(shapeOf(e), '見本を まわしても 形は かわらない').toEqual(shapeOf(undoBefore));
    await expectResumesAfter600(page, drag.after, '① 本物の マウスで はなして');
    expect(await handMarks(page), '回り出しても 手の 印は 出ない（まわせると もう 分かって いる）').toBe(0);
    await testInfo.attach('① そと（見本を まわした あと）', { body: await page.screenshot(), contentType: 'image/png' });

    // ---- ② なか: 家具を 置く（AC43）
    await clickBtn(page, 'next');
    e = await ed(page);
    expect(e.step, '「つぎへ」で ② なか').toBe('naka');
    expect(e.preview, '② の 見本は ① と べつ（① を まわしても さわって いない）').toMatchObject({ mode: 'inside', touched: false, wait: null });
    expect(await handMarks(page), '② さわる 前は 手の 印が 1 こ').toBe(1);
    expect(await bandMarkIssues(page), '② の かべの 帯: 窓の 印 ＝ まどの かず（2 こ）の 場所・戸の 印 1 こ（まえの まん中）').toEqual([]);
    await expectHeadings(page, 'naka');
    await expect(page.getByTestId('editor-step-naka')).toHaveAttribute('aria-current', 'step');
    const ids2 = await editorBtnIds(page);
    for (const id of ['prev', 'next', 'light', 'undo', 'redo', 'close', 'new', 'need', 'done', ...Object.keys(FURNITURE).map((k) => `furniture-${k}`)]) {
      expect(ids2, `② には ${TID.btn(id)} が ある`).toContain(id);
    }
    expect(ids2.filter((id) => id.startsWith('furniture-')).sort(), '② の 家具の ボタンは 13 しゅるい ちょうど（2.4）').toEqual(Object.keys(FURNITURE).map((k) => `furniture-${k}`).sort());
    // ならび（§4.3）: 1 行 7 こ。上 7（かまど・たんす・こたつ・ふとん・テーブル・ながい テーブル・まるい テーブル）・下 6（いす・まるいす・あんどん・ほんだな・おふろ・はにわ）
    expect(furnitureButtonRows(await readButtons(page)), '家具の ボタンの ならび（上 7・下 6。左から 右）').toEqual(FURNITURE_ROWS);
    for (const id of ['take', 'turnRight', 'turnLeft', 'width-5', 'char-あ']) expect(ids2, `② では ${TID.btn(id)} は 出ない（家具を えらぶまで そばの ボタンは かくれる）`).not.toContain(id);
    await expect(page.getByTestId('editor-grid'), '方眼').toBeVisible();
    await expect(page.getByTestId('editor-cell'), '方眼の マス ＝ よこ × たて').toHaveCount(e.size.w * e.size.d);
    expect(await editorMismatch(page), '画面と menu() の ちがい（②）').toEqual([]);
    await gameKeysIgnored(page, '② なか');
    // ふとん（1×2）を 左上の ほうに、テーブル（2×1）を みぎうえに、いす（1×1）を みぎの ほうに
    await clickBtn(page, 'furniture-futon');
    expect((await btnState(page, 'furniture-futon'))?.pressed, '置く 家具の えらび').toBe(true);
    await clickCell(page, 1, 1);
    await clickBtn(page, 'furniture-table');
    await clickCell(page, 4, 0);
    // 戸の 前の マス（まえの かべの まん中の 内がわ）には 置けない
    const doorFront = { x: (e.size.w - 1) / 2, z: e.size.d - 1 };
    await clickBtn(page, 'furniture-chair');
    await clickCell(page, doorFront.x, doorFront.z);
    e = await ed(page);
    expect(e.furniture, '戸の 前には 置けない（ふとん・テーブルの ままで いすは 増えない）').toEqual([
      { kind: 'futon', x: 1, z: 1, rot: 0 },
      { kind: 'table', x: 4, z: 0, rot: 0 },
    ]);
    await clickCell(page, 5, 3);
    e = await ed(page);
    expect(e.furniture, '3 つ 置いた（置いた ときは 向き 0）').toEqual([
      { kind: 'futon', x: 1, z: 1, rot: 0 },
      { kind: 'table', x: 4, z: 0, rot: 0 },
      { kind: 'chair', x: 5, z: 3, rot: 0 },
    ]);
    await testInfo.attach('② なか（家具を 置いた）', { body: await page.screenshot(), contentType: 'image/png' });

    // ---- AC57: 置いた 家具を 押すと えらべて、そばに［とる］［↻］［↺］が 出る
    // 右の 家具の えらび（いす）が 押された 状態から はじめる（置いた あとも 残るかは 決めて いない ので、はずれて いれば 押して 確かめる）
    if (!(await btnState(page, 'furniture-chair'))?.pressed) await clickBtn(page, 'furniture-chair');
    expect((await btnState(page, 'furniture-chair'))?.pressed, '置く 家具（いす）を えらんだ 状態').toBe(true);
    await clickFurniture(page, 1, 1);
    e = await ed(page);
    expect(e.selected, 'ふとんを えらんだ').toEqual({ x: 1, z: 1 });
    expect((await btnState(page, 'furniture-chair'))?.pressed, '置いた 家具を えらぶと 右の 家具の えらびは はずれる').toBe(false);
    const beside = (await readButtons(page)).filter((b) => ['take', 'turnRight', 'turnLeft'].includes(b.id));
    expect(beside.map((b) => b.id).sort(), 'そばの ボタン 3 つ').toEqual(['take', 'turnLeft', 'turnRight']);
    expect(Object.fromEntries(beside.map((b) => [b.id, b.label])), '読み上げ用の 名前').toEqual({ take: 'とる', turnRight: 'みぎに まわす', turnLeft: 'ひだりに まわす' });
    for (const id of ['turnRight', 'turnLeft']) expect(beside.find((b) => b.id === id)!.text, `${id} に 字は ない`).not.toMatch(/[ぁ-んァ-ヶ一-龥]/);
    expect(beside.find((b) => b.id === 'take')!.text, 'とる は 字').toBe('とる');
    const grid = await page.getByTestId('editor-grid').boundingBox();
    const futon = await furnitureAt(page, 1, 1).boundingBox();
    expect(grid, '方眼の はこ').not.toBeNull();
    for (const b of beside) {
      const { x, y, w, h } = b.rect;
      expect(x >= grid!.x - 0.5 && y >= grid!.y - 0.5 && x + w <= grid!.x + grid!.width + 0.5 && y + h <= grid!.y + grid!.height + 0.5, `${b.id} は 方眼の はこから はみ出さない`).toBe(true);
      const overlap = x < futon!.x + futon!.width - 0.5 && x + w > futon!.x + 0.5 && y < futon!.y + futon!.height - 0.5 && y + h > futon!.y + 0.5;
      expect(overlap, `${b.id} は えらんだ ふとんに かさならない`).toBe(false);
    }
    expect(await editorMismatch(page), '画面と menu() の ちがい（家具を えらんだ）').toEqual([]);
    // ↻（みぎに まわす）→ 2×1・rot 1・左上は 同じ。↺ ・ ↺ → rot 0 → 3。もう 1 回 ↻ で rot 0
    await clickBtn(page, 'turnRight');
    e = await ed(page);
    expect(e.furniture[0], '↻ で rot 1（左上の マスは 同じ）').toEqual({ kind: 'futon', x: 1, z: 1, rot: 1 });
    expect(e.selected, 'まわしても えらびは そのまま').toEqual({ x: 1, z: 1 });
    await clickBtn(page, 'turnLeft');
    expect((await ed(page)).furniture[0]!.rot, '↺ で rot 0').toBe(0);
    await clickBtn(page, 'turnLeft');
    expect((await ed(page)).furniture[0]!.rot, '↺ で rot 3').toBe(3);
    await clickBtn(page, 'turnRight');
    expect((await ed(page)).furniture[0]!.rot, '↻ で rot 0').toBe(0);
    // Esc → えらびが はずれる だけ（エディターは 開いたまま。AC55）
    await pressEsc(page);
    e = await ed(page);
    expect(e.selected, 'Esc で えらびが はずれる').toBeNull();
    expect((await menuState(page)).page, 'エディターは とじない').toBe('editor');
    expect((await readButtons(page)).filter((b) => ['take', 'turnRight', 'turnLeft'].includes(b.id)), 'えらびが はずれると そばの ボタンは かくれる').toEqual([]);
    expect(e.furniture, 'Esc では 形は かわらない').toHaveLength(3);
    // いすを えらんで［とる］→ なくなる・えらびも はずれる。もう 1 度 置く
    await clickFurniture(page, 5, 3);
    await clickBtn(page, 'take');
    e = await ed(page);
    expect(e.furniture.map((f) => f.kind), '［とる］で いすが なくなる').toEqual(['futon', 'table']);
    expect(e.selected, '［とる］の あとは えらびが はずれる').toBeNull();
    await clickBtn(page, 'furniture-chair');
    await clickCell(page, 5, 3);
    expect((await ed(page)).furniture, 'いすを もう 1 度 置いた').toHaveLength(3);
    // テーブルを えらぶ → 空いた マスを 押すと えらびが はずれる だけ（家具は 置かない）
    await clickFurniture(page, 4, 0);
    expect((await ed(page)).selected, 'テーブルを えらんだ').toEqual({ x: 4, z: 0 });
    await clickCell(page, 6, 4);
    e = await ed(page);
    expect(e.selected, '空いた マスで えらびが はずれる').toBeNull();
    expect(e.furniture, '置く 家具の えらびも はずれて いるので 何も 置かない').toHaveLength(3);

    // ---- AC13b: あかりの わくの ちょうちんは はずせない（ふきだし「あかりは ひとつ ひつようだよ」。何も かわらない）
    const beforeLight = await ed(page);
    await clickBtn(page, 'light');
    const afterLight = await ed(page);
    expect({ shape: shapeOf(afterLight), canUndo: afterLight.canUndo }, 'あかりの わくを 押しても 形・もどす は かわらない').toEqual({ shape: shapeOf(beforeLight), canUndo: beforeLight.canUndo });
    expect(afterLight.light).toBe('lantern');
    await expectBubble(page, MSG.light, 'あかりを はずそうと した');
    // ふきだしの 長さ ＝ 180 コマ ＋ 字 1 つ 12 コマ（§4.9。字は 空白を のぞく）。前後 10 コマは ゆるす
    const lightFrames = 180 + 12 * squash(MSG.light).length;
    await stepUi(page, lightFrames - 10 - 2);
    expect(squash((await menuState(page)).bubble), 'まだ 出て いる').not.toBe('');
    await stepUi(page, 20);
    expect((await menuState(page)).bubble, '長さが 来たら 消える').toBe('');
    // つぎに どこかを 押したら すぐ 消える（方眼の マス）
    await clickBtn(page, 'light');
    await expectBubble(page, MSG.light, 'もう 1 度');
    await clickCell(page, 6, 4);
    expect((await menuState(page)).bubble, 'どこかを 押すと すぐ 消える').toBe('');

    // ---- AC47: とじて べつの 建築士さんで 開くと 同じ（名前 3 字も 入れて、② なかで Esc）
    for (const ch of Array.from('ひみつ')) expect(await edit(page, { op: 'char', ch }), `字 ${ch}`).toBe(true);
    const saved = await ed(page);
    expect(saved.name.front).toBe('ひみつ');
    expect(saved.step, '② に いる').toBe('naka');
    await pressEsc(page);
    expect(await menuState(page), 'Esc で エディターも メニューも とじる').toMatchObject({ open: false });
    expect(await editor(page), 'とじると editor() は null').toBeNull();
    const other = await findOtherArchitect(page);
    expect(other.id, 'べつの 建築士さん').not.toBe(first.id);
    await openEditor(page, other.id);
    e = await ed(page);
    expect(formOf(e), 'Esc で とじても べつの 建築士さんで 開くと 同じ（step も）').toEqual(formOf(saved));
    expect(e.selected, 'えらびは のこらない').toBeNull();
    expect(e.canUndo, 'もどす の 記録は エディターを とじても のこる').toBe(true);
    await clickBtn(page, 'close'); // ✕
    expect(await menuState(page), '✕ で とじる').toMatchObject({ open: false });
    await openEditor(page, other.id);
    expect(formOf(await ed(page)), '✕ で とじても 同じ').toEqual(formOf(saved));

    // ---- ひつような もの（ポップアップ）: need() と 同じ・Esc は ポップアップだけ とじる（AC55）・時刻は 止まる（AC41）
    await clickBtn(page, 'need');
    expect(await menuState(page), 'ひつような もの').toMatchObject({ open: true, page: 'need' });
    await expect(page.getByTestId('house-need')).toBeVisible();
    const need = await needOf(page);
    const rows = await page.getByTestId('need-row').evaluateAll((els) =>
      els.map((el) => ({ item: el.getAttribute('data-item'), need: Number(el.getAttribute('data-need')), have: Number(el.getAttribute('data-have')), short: Number(el.getAttribute('data-short')) })),
    );
    expect(rows, '画面の 行が need() と 同じ').toEqual(need.map((n) => ({ item: n.item, need: n.need, have: n.have, short: n.short })));
    const needOne = (item: string) => need.find((n) => n.item === item);
    // よこ 7・たて 5・窓 2・ふとん・テーブル・いす → いし 7×5、き 2×(7+5)+4 ＋ テーブル 4 ＋ いす 2、かみ ＝ 窓 2（§4.1・§4.3）
    expect(needOne('stone')?.need, 'いし ＝ よこ×たて').toBe(7 * 5);
    expect(needOne('log')?.need, 'き ＝ 2×(よこ＋たて)＋4 ＋ テーブル 4 ＋ いす 2').toBe(2 * (7 + 5) + 4 + 4 + 2);
    expect(needOne('paper')?.need, 'かみ ＝ 窓 × 1').toBe(2);
    for (const n of need) expect(n.short, `${n.item}: たりない ＝ ひつよう − くら`).toBe(Math.max(0, n.need - n.have));
    expect(await editorMismatch(page), '画面と menu() の ちがい（ひつような もの）').toEqual([]);
    const clockN = await clockOf(page);
    await stepUi(page, 600);
    expect(await clockOf(page), 'ひつような ものが 出て いる 間も 時刻は 止まる').toEqual(clockN);
    await pressEsc(page);
    expect(await menuState(page), 'Esc は ポップアップだけ とじる').toMatchObject({ open: true, page: 'editor' });
    expect(await editor(page), 'エディターは 開いた まま').not.toBeNull();
    await clickBtn(page, 'need');
    await clickBtn(page, 'needClose');
    expect((await menuState(page)).page, 'とじる ボタンで エディターに もどる').toBe('editor');

    // ---- ③ なまえ（AC14）: 50 音の ボタン・゛・カタカナ・1 もじ けす・後ろの 文字
    await clickBtn(page, 'next');
    e = await ed(page);
    expect(e.step, '「つぎへ」で ③ なまえ').toBe('namae');
    expect(e.preview, '③ では 見本を 出さない').toBeNull();
    await expectHeadings(page, 'namae');
    await expect(page.getByTestId('editor-step-namae')).toHaveAttribute('aria-current', 'step');
    const ids3 = await editorBtnIds(page);
    expect(ids3, '③ では「つぎへ」は 出ない').not.toContain('next');
    for (const id of ['prev', 'done', 'undo', 'redo', 'need', 'new', 'close', 'char-あ', 'char-ん', 'char-ー', 'char-っ', 'dakuten', 'handakuten', 'katakana', 'erase', ...SUFFIXES.map((_, i) => `suffix-${i}`)]) {
      expect(ids3, `③ には ${TID.btn(id)} が ある`).toContain(id);
    }
    expect((await btnState(page, 'suffix-0'))?.pressed, '後ろの 文字は はじめ「のいえ」').toBe(true);
    expect(await plainText(page, 'editor-name'), '今の 名前（前 ＋ 後ろ）').toBe(`ひみつ${SUFFIXES[0]}`);
    expect(await editorMismatch(page), '画面と menu() の ちがい（③）').toEqual([]);
    await gameKeysIgnored(page, '③ なまえ');
    await testInfo.attach('③ なまえ', { body: await page.screenshot(), contentType: 'image/png' });
    const front = async () => (await ed(page)).name.front;
    await clickBtn(page, 'char-き');
    expect(await front(), '字を 1 つ 入れる').toBe('ひみつき');
    expect((await btnState(page, 'dakuten'))?.enabled, 'き の あとは ゛ が つけられる').toBe(true);
    await clickBtn(page, 'dakuten');
    expect(await front(), '゛ で き → ぎ').toBe('ひみつぎ');
    await clickBtn(page, 'char-あ');
    expect((await btnState(page, 'dakuten'))?.enabled, 'あ の あとは ゛ が つけられない（押せない）').toBe(false);
    expect((await btnState(page, 'handakuten'))?.enabled, 'あ の あとは ゜ も つけられない').toBe(false);
    await clickBtn(page, 'char-い');
    await clickBtn(page, 'char-う');
    await clickBtn(page, 'char-か');
    expect(await front(), '8 字').toBe('ひみつぎあいうか');
    expect((await btnState(page, 'dakuten'))?.enabled, '8 字目にも ゛ は つけられる').toBe(true);
    await clickBtn(page, 'dakuten');
    expect(await front(), '8 字の まま か → が').toBe('ひみつぎあいうが');
    expect((await btnState(page, 'char-お'))?.enabled, '8 字に なると 字の ボタンは うすく なる（押せない）').toBe(false);
    await clickDisabled(page, 'char-お');
    expect(await front(), '9 字目は 入らない').toBe('ひみつぎあいうが');
    for (let i = 0; i < 4; i++) await clickBtn(page, 'erase');
    expect(await front(), '1 もじ けす × 4').toBe('ひみつぎ');
    expect((await btnState(page, 'char-お'))?.enabled, '字が へると また 押せる').toBe(true);
    await clickBtn(page, 'katakana');
    expect((await btnState(page, 'katakana'))?.pressed, 'カタカナに きりかえた').toBe(true);
    await clickBtn(page, 'char-た');
    expect(await front(), 'カタカナ きりかえの あとに 入れた 字だけ カタカナ').toBe('ひみつぎタ');
    await clickBtn(page, 'katakana');
    expect((await btnState(page, 'katakana'))?.pressed, 'カタカナ きりかえを もどした').toBe(false);
    await clickBtn(page, 'suffix-3');
    e = await ed(page);
    expect(e.name, '後ろの 文字を えらぶ').toEqual({ front: 'ひみつぎタ', back: SUFFIXES[3] });
    expect((await btnState(page, 'suffix-3'))?.pressed).toBe(true);
    expect((await btnState(page, 'suffix-0'))?.pressed).toBe(false);
    expect(await plainText(page, 'editor-name'), '名前の 行').toBe(`ひみつぎタ${SUFFIXES[3]}`);

    // ---- できた！の しらべ（AC44・AC44b）と せっけいずが できる（AC15・AC45）。くらは まだ 空
    const form1 = await ed(page);
    expect(Object.values(await kura(page)).reduce((a, b) => a + b, 0), 'くらは 空').toBe(0);
    const noChange = async (why: string) => {
      expect(await countOf(page, 'sekkeizu'), `${why}: せっけいずは ふえない`).toBe(0);
      expect(await blueprints(page), `${why}: blueprints() も ふえない`).toHaveLength(0);
    };
    // ④ かみが 持ち物にも くらにも ない（かみと ふでが 両方 ない ときは ④ だけ）
    await setBag(page, {});
    expect(await countOf(page, 'paper'), 'かみ なし').toBe(0);
    expect(await countOf(page, 'fude'), 'ふで なし').toBe(0);
    await clickBtn(page, 'done');
    await expectBubble(page, MSG.noPaper, 'かみと ふでが 両方 ない');
    expect((await ed(page)).step, '④ では すすみを うつさない').toBe('namae');
    await noChange('④');
    // ④ ふでは あるが かみが ない
    await page.evaluate(() => (window as any).__rikkun.inventory.add('fude', 1));
    await clickBtn(page, 'done');
    await expectBubble(page, MSG.noPaper, 'ふでは あるが かみが ない');
    const fudeMax = (await fudeLeft(page))[0]!.max;
    expect((await fudeLeft(page))[0]!.left, 'ふでは へらない').toBe(fudeMax);
    await noChange('④ ふでは ある');
    // ⑤ かみは あるが ふでが ない
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.remove('fude', 1);
      h.inventory.add('paper', 2);
      h.step(1);
    });
    await clickBtn(page, 'done');
    await expectBubble(page, MSG.noFude, 'かみは あるが ふでが ない');
    expect(await countOf(page, 'paper'), 'かみは へらない').toBe(2);
    await noChange('⑤');
    // ⑥ かみ・ふでを 使った あとで 持ち物に 空きが ない（かみ 2 まい・ふで たいきゅう 5 → 使っても マスは あかない）
    await fillBagFull(page);
    await clickBtn(page, 'done');
    await expectBubble(page, MSG.full, '持ち物が いっぱい');
    expect(await countOf(page, 'paper'), '⑥: かみは へらない').toBe(2);
    expect((await fudeLeft(page))[0]!.left, '⑥: ふでは へらない').toBe(fudeMax);
    await noChange('⑥');
    // ③ 名前 0 字 → なまえの 画面に とどまる ／ ② ふとん 0 → ② なか へ（番号の 小さい ほう）
    await setBag(page, { paper: 2 });
    await page.evaluate(() => (window as any).__rikkun.inventory.add('fude', 1));
    const nameLen = (await ed(page)).name.front.length;
    for (let i = 0; i < nameLen; i++) await edit(page, { op: 'erase' });
    await clickBtn(page, 'done');
    await expectBubble(page, MSG.noName, '名前 0 字');
    expect((await ed(page)).step, '名前 0 字 → ③ なまえ').toBe('namae');
    await noChange('③');
    await edit(page, { op: 'remove', x: 1, z: 1 });
    await clickBtn(page, 'done');
    await expectBubble(page, MSG.noFuton, 'ふとん 0（名前も 0 字 → 番号の 小さい ② が 先）');
    expect((await ed(page)).step, 'ふとん 0 → ② なか').toBe('naka');
    await noChange('②');
    expect(await countOf(page, 'paper'), '止まった ときは かみ・持ち物は かわらない').toBe(2);
    // もどす で ふとんと 名前を もどす（もどした 操作の すすみに うつる）
    for (let i = 0; i < nameLen + 1; i++) expect(await edit(page, { op: 'undo' }), `もどす ${i + 1}`).toBe(true);
    e = await ed(page);
    expect(shapeOf(e), 'ふとんと 名前が もどった').toEqual(shapeOf(form1));
    expect(e.step, 'もどした 操作が ③ の 物なら ③ に うつる').toBe('namae');

    // ---- せっけいずが できる（AC15）: かみは 持ち物から（くらは へらない）・ふでの たいきゅう −1・くらの 材料は へらない
    //      持ち物に かみ 2・くらに かみ 3 と き 20
    await setBag(page, { paper: 5, log: 20 });
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.house.deposit('paper', 3);
      h.house.deposit('log', 20);
      h.inventory.add('fude', 1);
      h.step(1);
    });
    expect(await countOf(page, 'paper'), 'かみは 持ち物に 2').toBe(2);
    expect(await kura(page), 'くらに かみ 3・き 20').toMatchObject({ paper: 3, log: 20 });
    const bagBefore = await kura(page);
    const formBefore = await ed(page);
    await clickBtn(page, 'done');
    expect(await menuState(page), 'できた！ で メニューの いちばん 上の ページに もどる').toMatchObject({ open: true, page: 'top' });
    await expectBubble(page, MSG.done, 'できた');
    expect(await countOf(page, 'sekkeizu'), 'せっけいずが 1 こ').toBe(1);
    expect(await countOf(page, 'paper'), 'かみは 持ち物から 1 まい').toBe(1);
    expect((await fudeLeft(page))[0]!.left, 'ふでの たいきゅうが 1 へる').toBe(fudeMax - 1);
    expect(await kura(page), 'くらの 材料は へらない（たりなくても 作れる）').toEqual(bagBefore);
    let bps = await blueprints(page);
    expect(bps, 'blueprints()').toHaveLength(1);
    expect(bps[0], 'せっけいずの 中身').toMatchObject({
      number: 1,
      name: formBefore.name,
      w: formBefore.size.w,
      d: formBefore.size.d,
      windows: formBefore.windows,
      windowKind: 'shoji',
      roof: 'flat',
      light: 'lantern',
    });
    expect(bps[0]!.furniture, 'せっけいずの 家具').toEqual(formBefore.furniture);
    // AC47: できた！の あとも 同じ 形が のこる
    await clickBtn(page, 'editor');
    expect(shapeOf(await ed(page)), 'できた！の あとも 作りかけは のこる').toEqual(shapeOf(formBefore));

    // ---- 家具が ふとん だけ → 確かめの まど（AC44b ⑦）。Esc は まどだけ（AC55）。［かぐを おく］は ② へ。［このまま つくる］で 2 まい目（かみは くらから・番号 2）
    for (const f of formBefore.furniture.filter((f) => f.kind !== 'futon')) expect(await edit(page, { op: 'remove', x: f.x, z: f.z }), `${f.kind} を とる`).toBe(true);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.remove('paper', 1);
      h.step(1);
    });
    expect(await countOf(page, 'paper'), '持ち物の かみ なし（くらに 3）').toBe(0);
    await clickBtn(page, 'done');
    e = await ed(page);
    expect(e.confirm, 'ふとん だけ → 確かめの まど').toBe('futonOnly');
    await expect(page.getByTestId('house-confirm')).toHaveAttribute('data-kind', 'futonOnly');
    expect(await plainText(page, 'house-confirm'), '確かめの まどの 字').toContain(squash(MSG.futonOnly));
    expect((await btnState(page, 'yes'))?.text, '［このまま つくる］').toBe('このままつくる');
    expect((await btnState(page, 'no'))?.text, '［かぐを おく］').toBe('かぐをおく');
    expect(await editorMismatch(page), '画面と menu() の ちがい（確かめの まど）').toEqual([]);
    const clockC = await clockOf(page);
    await stepUi(page, 600);
    expect(await clockOf(page), '確かめの まどが 出て いる 間も 時刻は 止まる').toEqual(clockC);
    await pressEsc(page);
    e = await ed(page);
    expect(e.confirm, 'Esc で まどだけ とじる').toBeNull();
    expect(e.step, 'Esc では すすみは そのまま').toBe('namae');
    expect(await countOf(page, 'sekkeizu'), 'Esc では せっけいずは できない').toBe(1);
    expect((await menuState(page)).page, 'エディターは 開いた まま').toBe('editor');
    await clickBtn(page, 'done');
    await clickBtn(page, 'no');
    e = await ed(page);
    expect(e.confirm, '［かぐを おく］で まどが きえる').toBeNull();
    expect(e.step, '［かぐを おく］は ② なか へ').toBe('naka');
    expect(await countOf(page, 'sekkeizu'), '［かぐを おく］では せっけいずは できない').toBe(1);
    await clickBtn(page, 'next');
    await clickBtn(page, 'done');
    expect((await ed(page)).confirm, 'もう 1 度 確かめの まど').toBe('futonOnly');
    await clickBtn(page, 'yes');
    expect(await menuState(page), '［このまま つくる］で できる').toMatchObject({ open: true, page: 'top' });
    expect(await countOf(page, 'sekkeizu'), '2 まい目').toBe(2);
    expect((await fudeLeft(page))[0]!.left, 'ふでの たいきゅうが もう 1 へる').toBe(fudeMax - 2);
    expect((await kura(page)).paper, '持ち物に かみが ない ので くらから 1 まい').toBe(2);
    bps = await blueprints(page);
    expect(bps.map((b) => b.number).sort(), '番号は 1, 2').toEqual([1, 2]);
    expect(bps.find((b) => b.number === 2)!.furniture, '2 まい目は ふとん だけ').toEqual([{ kind: 'futon', x: 1, z: 1, rot: 0 }]);
    expect(bps.find((b) => b.number === 1)!.furniture, '1 まい目は かわらない').toEqual(formBefore.furniture);

    // ---- あたらしい せっけいず（AC47）: 確かめの まど。Esc・やめる で かわらない・ぜんぶ けす で まっさら → もどす で もどる
    await clickBtn(page, 'editor');
    const shapeKeep = shapeOf(await ed(page));
    await clickBtn(page, 'new');
    e = await ed(page);
    expect(e.confirm, 'あたらしい せっけいず → 確かめの まど').toBe('reset');
    await expect(page.getByTestId('house-confirm')).toHaveAttribute('data-kind', 'reset');
    expect(await plainText(page, 'house-confirm'), '確かめの まどの 字').toContain(squash(MSG.reset));
    expect((await btnState(page, 'yes'))?.text, '［ぜんぶ けす］').toBe('ぜんぶけす');
    expect((await btnState(page, 'no'))?.text, '［やめる］').toBe('やめる');
    await pressEsc(page);
    e = await ed(page);
    expect(e.confirm, 'Esc で まどだけ とじる').toBeNull();
    expect(shapeOf(e), 'Esc では かわらない').toEqual(shapeKeep);
    await clickBtn(page, 'new');
    await clickBtn(page, 'no');
    expect(shapeOf(await ed(page)), '［やめる］でも かわらない').toEqual(shapeKeep);
    await clickBtn(page, 'new');
    await clickBtn(page, 'yes');
    e = await ed(page);
    expect(e, '［ぜんぶ けす］で まっさら').toMatchObject({
      step: 'soto',
      size: { w: 5, d: 5 },
      windows: 0,
      windowKind: 'shoji',
      roof: 'flat',
      furniture: [],
      light: 'lantern',
      name: { front: '', back: SUFFIXES[0] },
      confirm: null,
    });
    await clickBtn(page, 'undo');
    expect(shapeOf(await ed(page)), 'もどす 1 回で もとに もどる').toEqual(shapeKeep);

    // ---- せっけいずの 名前（AC15）: 持ち物の せっけいずの ツールチップ
    await press(page, 'close');
    const slot1 = bps.find((b) => b.number === 1)!.slot;
    expect(await tooltipNameOf(page, slot1), '持ち物の 名前 ＝ <前><後ろ>の せっけいず').toBe(`${formBefore.name.front}${formBefore.name.back}の せっけいず`);
  });

  test('AC34 ③・AC50・AC41: 見本 — いちばん 大きい 形でも 描画回数 24 以下・回るだけでは 作りなおさない・1 コマ 0.3°・ゲームの 時間は 止まる', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await openHouse(page);
    const first = await firstArchitect(page);
    await openEditorFast(page, first.id);

    /** 開いて（切りかえて）から 読むまでに すすむ コマ（press の 2 コマ ほか）の ぶんの ゆとり。1 コマ 0.3° ×10 コマ。回しつづけた あとの 値（28＋180 など）とは はっきり ちがう */
    const OPEN_SLACK = 3;
    const angleOf = async (): Promise<number> => (await ed(page)).preview!.angle;
    /** n コマ すすめた ときの angle の ふえ方（0〜360 の 周りで くらべる） */
    const turned = async (n: number): Promise<number> => {
      const a = await angleOf();
      await stepUi(page, n);
      return (((await angleOf()) - a) % 360 + 360) % 360;
    };

    // ---- ① そと: mode・roof・pitch・angle の はじまり
    let p = (await ed(page)).preview!;
    expect(p, '① そと').toMatchObject({ mode: 'outside', roof: true, pitch: 26, touched: false });
    expect(p.angle, '開いた ときは まえ ＋28°').toBeGreaterThanOrEqual(28);
    expect(p.angle, '開いた ときは まえ ＋28°').toBeLessThan(28 + OPEN_SLACK);
    // 1 コマ ＝ 1/60 秒 ごとに 0.3 ふえる（600 コマで 180）。ゲームの 時間は 止まって いても 止まらない
    const clock0 = await clockOf(page);
    expect(await turned(1), '1 コマで 0.3°').toBeCloseTo(0.3, 3);
    expect(await turned(600), '600 コマで 180°').toBeCloseTo(180, 1);
    expect(await clockOf(page), 'エディターが 開いて いる 間は ゲームの 時刻は 止まる').toEqual(clock0);
    p = (await ed(page)).preview!;
    expect(p.pitch, '回っても 見おろす 角度は かわらない').toBe(26);
    expect(p.angle >= 0 && p.angle < 360, 'angle は 0〜360 未満').toBe(true);
    expect(p.touched, 'さわって いない').toBe(false);
    await stepUi(page, 1200);
    expect((await ed(page)).preview!.angle, '2 周 しても 0〜360 未満').toBeLessThan(360);

    // ---- ② なか: 屋根なし・見おろし 50°・angle 28 から。① は 見えて いない 間 すすまない
    await press(page, 'next');
    p = (await ed(page)).preview!;
    expect(p, '② なか').toMatchObject({ mode: 'inside', roof: false, pitch: 50, touched: false });
    expect(p.angle, '② に なった ときも 28 から').toBeGreaterThanOrEqual(28);
    expect(p.angle, '② に なった ときも 28 から').toBeLessThan(28 + OPEN_SLACK);
    expect(await turned(600), '② も 600 コマで 180°').toBeCloseTo(180, 1);
    await press(page, 'prev');
    p = (await ed(page)).preview!;
    expect(p.mode, '① に もどった').toBe('outside');
    expect(p.angle, '見えて いない 間は すすまない ので ① に もどると 28 から').toBeGreaterThanOrEqual(28);
    expect(p.angle, '見えて いない 間は すすまない ので ① に もどると 28 から').toBeLessThan(28 + OPEN_SLACK);

    // ---- ③ なまえ: 見本は 出さない
    await press(page, 'next');
    await press(page, 'next');
    expect((await ed(page)).step).toBe('namae');
    expect((await ed(page)).preview, '③ では preview が null').toBeNull();
    // ① に もどって 回してから とじて 開くと 28 から（作りかけの すすみは のこるので ① で とじる）
    await press(page, 'prev');
    await press(page, 'prev');
    expect(await turned(600), '① で 600 コマ').toBeCloseTo(180, 1);
    await press(page, 'close');
    await openEditorFast(page, first.id);
    p = (await ed(page)).preview!;
    expect(p.mode, '作りかけの すすみ ① で 開く').toBe('outside');
    expect(p.angle, 'とじて 開くと はじめに もどる').toBeGreaterThanOrEqual(28);
    expect(p.angle, 'とじて 開くと はじめに もどる').toBeLessThan(28 + OPEN_SLACK);

    // ---- AC34 ③: いちばん 大きい 形（9×9・窓 上限・1×1 の 家具 いっぱい）でも 見本を 描いた コマの 描画回数は 24 以下
    const MAX_CALLS = 24;
    const GLOW_DONE = 100; // 窓・戸の 光り（90 コマ）が おわる まで 進める コマ数
    expect(await edit(page, { op: 'size', w: 9, d: 9 }), '9×9').toBe(true);
    const e9 = await ed(page);
    expect(e9.windowMax, '9×9 の まどの かず 上限').toBe((9 + 1) / 2 + 2 * ((9 + 1) / 2));
    for (let i = 0; i < e9.windowMax; i++) expect(await edit(page, { op: 'windows', delta: 1 }), `まど ${i + 1}`).toBe(true);
    expect((await ed(page)).windows, '窓 上限').toBe(e9.windowMax);
    await stepUi(page, 1);
    const soto = await drawStats(page);
    testInfo.annotations.push({ type: '① 9×9・窓 上限', description: `描画 ${soto.calls} 回・三角形 ${soto.triangles}` });
    expect(soto.calls, `① 9×9・窓 上限: 見本を 描いた コマの 描画回数（上限 ${MAX_CALLS}）`).toBeLessThanOrEqual(MAX_CALLS);
    expect(soto.calls, '見本を 描いた（描画回数が 0 ではない）').toBeGreaterThan(0);
    await press(page, 'next');
    const placed = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const fails: string[] = [];
      let n = 0;
      for (let z = 0; z < 9; z++) {
        for (let x = 0; x < 9; x++) {
          if (h.house.edit({ op: 'place', kind: 'shelf', x, z })) n++;
          else fails.push(`(${x}, ${z})`);
        }
      }
      h.step(2);
      return { n, fails };
    });
    expect(placed.n, '1×1 の 家具を 戸の 前いがいの 9×9 − 1 マスに').toBe(9 * 9 - 1);
    expect(placed.fails, '置けなかった マスは 戸の 前の 1 マス だけ').toEqual([`(${(9 - 1) / 2}, ${9 - 1})`]);
    await stepUi(page, 1);
    const naka = await drawStats(page);
    testInfo.annotations.push({ type: '② 9×9・窓 上限・ほんだな 80 こ', description: `描画 ${naka.calls} 回・三角形 ${naka.triangles}` });
    expect(naka.calls, `② 9×9・窓 上限・家具 いっぱい: 見本を 描いた コマの 描画回数（上限 ${MAX_CALLS}。家具 1 こごとに 描くと 80 回で 落ちる）`).toBeLessThanOrEqual(MAX_CALLS);
    // 作りなおすのは 形が かわった ときだけ（preview.builds）。回る だけ では ふえない
    await stepUi(page, GLOW_DONE); // ① で 窓を ふやした 光りが 残って いても おわる まで（光りの 終わりでも builds が ふえる〔PR-2〕）
    const b0 = (await ed(page)).preview!.builds;
    await stepUi(page, 600);
    expect((await ed(page)).preview!.builds, '600 コマ 回っても 作りなおさない（② 9×9・家具 いっぱい）').toBe(b0);
    expect(await edit(page, { op: 'remove', x: 0, z: 0 }), '家具を 1 つ とる').toBe(true);
    const b1 = (await ed(page)).preview!.builds;
    expect(b1, '形が かわると 1 回 作りなおす（家具を とる）').toBe(b0 + 1);
    expect(await edit(page, { op: 'place', kind: 'shelf', x: 0, z: 0 }), '家具を もう 1 つ 置く').toBe(true);
    expect((await ed(page)).preview!.builds, '形が かわると 1 回 作りなおす（家具を 置く）').toBe(b1 + 1);

    // ---- 2.4: 13 しゅるいを まぜて 置いた 9×9（ほんだな 80 こ とは べつに）も 24 以下。しゅるいが ふえても 回数は ふえない
    await clearFurniture(page);
    expect((await ed(page)).furniture, '家具を ぜんぶ とった').toEqual([]);
    const mixed = await fillFurniture(page);
    expect(mixed.kinds, '13 しゅるい ぜんぶ 置けた（2.4）').toEqual(Object.keys(FURNITURE).sort());
    expect(mixed.placed, '9×9 に 13 しゅるいを まぜて たくさん（42 こ ぐらい）').toBeGreaterThan(30);
    await stepUi(page, 1);
    const mix = await drawStats(page);
    testInfo.annotations.push({ type: '② 9×9・窓 上限・13 しゅるい まぜ', description: `描画 ${mix.calls} 回・三角形 ${mix.triangles}` });
    expect(mix.calls, `② 9×9・13 しゅるい まぜ: 見本を 描いた コマの 描画回数（上限 ${MAX_CALLS}。半透明の かべで ② は 5 回ぐらい）`).toBeLessThanOrEqual(MAX_CALLS);
    expect(mix.calls, '見本を 描いた（描画回数が 0 ではない）').toBeGreaterThan(0);
    const bm = (await ed(page)).preview!.builds;
    await stepUi(page, 600);
    expect((await ed(page)).preview!.builds, '600 コマ 回っても 作りなおさない（② 9×9・13 しゅるい まぜ）').toBe(bm);
    await press(page, 'prev');
    // ① に なると 戸が 光る（90 コマ。光りの 終わりでも builds が 1 ふえる〔PR-2〕）。光り おわる まで 進めて から 数え はじめる
    await stepUi(page, GLOW_DONE);
    const bs0 = (await ed(page)).preview!.builds;
    await stepUi(page, 600);
    expect((await ed(page)).preview!.builds, '600 コマ 回っても 作りなおさない（① 9×9・窓 上限）').toBe(bs0);
    expect(await edit(page, { op: 'size', w: 7, d: 9 }), '大きさを かえる').toBe(true);
    expect((await ed(page)).preview!.builds, '大きさを かえると 1 回 作りなおす').toBe(bs0 + 1);
    const after = await drawStats(page);
    expect(after.calls, '大きさを かえた あとも 24 以下').toBeLessThanOrEqual(MAX_CALLS);
  });

  test.describe('動きを へらす 設定', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('AC50: 動きを へらす 設定では 見本は 回らず angle 28 の まま（① そと・② なか）', async ({ page }) => {
      test.setTimeout(120_000);
      await openHouse(page);
      const first = await firstArchitect(page);
      await openEditorFast(page, first.id);
      let p = (await ed(page)).preview!;
      expect(p, '① そと').toMatchObject({ mode: 'outside', roof: true, pitch: 26, touched: false });
      expect(p.angle, '動きを へらす 設定では まえ ＋28°').toBeCloseTo(28, 5);
      await stepUi(page, 600);
      p = (await ed(page)).preview!;
      expect(p.angle, '600 コマ たっても angle 28 の まま').toBeCloseTo(28, 5);
      await press(page, 'next');
      await stepUi(page, 600);
      p = (await ed(page)).preview!;
      expect(p, '② なか').toMatchObject({ mode: 'inside', roof: false, pitch: 50, touched: false });
      expect(p.angle, '② も angle 28 の まま').toBeCloseTo(28, 5);
    });
  });

  test('AC32b・AC47: セーブして 読みこみなおしても 作りかけ・せっけいず・ふでの 記録・次の 番号が 同じ（もどす の 記録は 空）', async ({ page }) => {
    test.setTimeout(240_000);
    await openHouse(page, '?seed=7'); // ?nosave=1 を つけない（保存する 世界）
    const first = await firstArchitect(page);
    await openEditorFast(page, first.id); // はじめて 話す → ふでを もらう
    await setForm(page, {
      w: 7,
      d: 5,
      windows: 2,
      furniture: [
        { kind: 'futon', x: 1, z: 1 },
        { kind: 'table', x: 4, z: 0 },
        { kind: 'chair', x: 5, z: 3 },
      ],
      front: 'ひみつ',
      back: SUFFIXES[3],
    });
    // せっけいずを 1 まい 作る
    await setBag(page, { paper: 2 });
    await page.evaluate(() => (window as any).__rikkun.inventory.add('fude', 1));
    await press(page, 'done');
    expect(await countOf(page, 'sekkeizu'), 'せっけいずが 1 まい できた').toBe(1);
    const bp = await blueprints(page);
    expect(bp, 'blueprints()').toHaveLength(1);
    // ふでを 手ばなす（「もらった」記録が 保存される かを 見る ため）。作りかけを もう 少し かえて、② で おわる
    await page.evaluate(() => (window as any).__rikkun.inventory.remove('fude', 1));
    await press(page, 'editor');
    expect(await edit(page, { op: 'place', kind: 'andon', x: 0, z: 4 }), 'あんどんを 置く').toBe(true);
    expect(await edit(page, { op: 'windows', delta: 1 }), 'まどを 1 つ ふやす').toBe(true);
    await press(page, 'next'); // ① から ② へ（すすみも のこる）
    await previewDrag(page, 100, 40); // PR-2: 見本の 向きは 保存に 入らない（開きなおすと touched: false。AC32b）
    expect((await ed(page)).preview?.touched, '② の 見本を まわした').toBe(true);
    const saved = await ed(page);
    expect(saved.step, '② なか で おわる').toBe('naka');
    expect(saved.canUndo, '保存の 前は もどせる').toBe(true);
    await press(page, 'close');
    await page.evaluate(() => (window as any).__rikkun.save.now());

    await reopenHouse(page);
    expect(await blueprints(page), '読みこみなおしても せっけいずの 中身・番号・名前が 同じ').toEqual(bp);
    expect(await countOf(page, 'sekkeizu')).toBe(1);
    expect(await countOf(page, 'fude'), 'ふでは 手ばなした まま').toBe(0);
    const first2 = await firstArchitect(page);
    const t = await talkTo(page, first2.id, 'hook');
    expect(t.menu.open).toBe(true);
    expect(t.steps, '「ふでを もらった」記録が のこって いる ので ふでを わたす 長い あいさつには ならない').toBeLessThan(100);
    expect(await countOf(page, 'fude'), 'ふでは もう 1 度は くれない').toBe(0);
    await clickBtnEditor(page);
    const e = await ed(page);
    expect(formOf(e), '作りかけ（すすみ・大きさ・窓・家具・あかり・名前）が 同じ').toEqual(formOf(saved));
    expect({ canUndo: e.canUndo, canRedo: e.canRedo }, '読みこみなおすと もどす の 記録は 空').toEqual({ canUndo: false, canRedo: false });
    expect(e.selected, '家具の えらびは のこらない').toBeNull();
    expect(e.preview, '見本の 向きは のこらない（開きなおすと さわる 前。PR-2）').toMatchObject({ mode: 'inside', touched: false, wait: null });
    expect(e.preview?.angle, '見本の 向きは のこらない（まえ ＋28° から）').toBeLessThan(28 + 3);
    expect(e.preview?.angle, '見本の 向きは のこらない（まえ ＋28° から）').toBeGreaterThanOrEqual(28);
    // 次の 番号（その 世界で 作った 順）
    // （かばんは 空に しない: 保存された せっけいずが きえて しまう ので、足すだけ）
    await page.evaluate(() => {
      const inv = (window as any).__rikkun.inventory;
      inv.add('paper', 2);
      inv.add('fude', 1);
    });
    await press(page, 'next');
    await press(page, 'done');
    const bp2 = await blueprints(page);
    expect(bp2.map((b) => b.number).sort(), '次の 番号は 2（保存された）').toEqual([1, 2]);
    expect(bp2.find((b) => b.number === 1), '1 まい目は かわらない').toEqual(bp[0]);
  });
});

/** メニューの「せっけいずを つくる」を マウスで 押す（もう 話して メニューが 開いて いる とき） */
async function clickBtnEditor(page: Page): Promise<void> {
  await clickBtn(page, 'editor');
  expect(await menuState(page), 'エディターが 開く').toMatchObject({ open: true, page: 'editor' });
}

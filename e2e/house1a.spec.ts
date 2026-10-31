import { expect, test } from '@playwright/test';
import { findUnrubiedKanji } from '../src/ui/text';
import { BTN_ORDER, TID, clickUi, clockOf, countOf, fudeLeft, htmlOf, menuMismatch, menuState, openHouse, press, shownTid, spawnPoint, stepUi, talkTo, tid, voiceCount, waitArchitects } from './helpers/house';

/**
 * HOUSE-1A（#338。docs/design/HOUSE-1.md §2.1〜2.4・§5・§6、docs/tickets/HOUSE-1A.md）の E2E。
 * E2E に 書くのは 画面・入力が いる 確認と 遊びの 流れの 代表だけ（#311）。数・状態だけの 基準は ユニット（developer）:
 *   AC2・AC4・AC6〜AC8・AC32・AC33・AC40・AC41 と、AC1・AC3 の 数の 部分（置き方の 関数・道具を くれる 条件）。
 *   AC41 は ユニット。ここでは ゲーム本体への つなぎ漏れ（本当に 時刻が 止まる）を AC3 の 通しの 中で 1 か所だけ 見る。
 * AC35（メニューの 3 つの 大きさ）は UI 検査（e2e/ui-gate.spec.ts の house-menu）。
 * 1E: くらを なくした ので、AC5（くらの あずけ・とりだし）の E2E は 消した（AC5〜AC8b は 欠番）。
 *
 * 窓口は 仕様 §6.1 の `window.__rikkun.house`。つなぎ目の 約束（PO が 票 docs/tickets/HOUSE-1A.md に 書いた 物）と、
 * 仕様に 無い 名前（ボタンの id・画面の data-testid・声の 効果音の 名前）は e2e/helpers/house.ts の 先頭に ある（開発は これに そろえる）。
 * 実装の 前は `window.__rikkun.house` が 無いので どちらも 赤。
 */

test.describe('HOUSE-1A 建築士さん・メニュー', () => {
  test('AC1・AC3（1B の ふで も）: 新しい世界 → 最初の建築士さんを右クリック → うなずき → ふきだし・声 1 回 → メニュー → 道具（みずもり・どうづき・ふで）1 こずつ → 2 回目は ふえない → なくして「どうぐを もらう」でもどる（ふでは もどらない）', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openHouse(page);

    // ---- AC1: 新しい世界に 最初の 1 人（first: true）が ちょうど 1 人、スタート地点から 横 6〜10 マス
    const start = await spawnPoint(page);
    const all = await waitArchitects(page);
    const firsts = all.filter((a) => a.first);
    expect(firsts, `最初の 建築士さん（first: true）は ちょうど 1 人（architects() = ${JSON.stringify(all)}）`).toHaveLength(1);
    const first = firsts[0]!;
    expect(first.busy, '建築中ではない').toBe(false);
    const away = Math.hypot(first.x - start.x, first.z - start.z);
    // 横 6〜10 マス（マスの まん中と 足もとの ずれ 0.5 まで ゆるす）
    expect(away, `スタート地点から 横 6〜10 マス（実際 ${away.toFixed(2)}）`).toBeGreaterThanOrEqual(5.5);
    expect(away, `スタート地点から 横 6〜10 マス（実際 ${away.toFixed(2)}）`).toBeLessThanOrEqual(10.5);

    // はじめは 道具を 持っていない・メニューは 閉じている
    expect(await countOf(page, 'mizumori')).toBe(0);
    expect(await countOf(page, 'dotsuki')).toBe(0);
    expect(await countOf(page, 'fude')).toBe(0);
    expect((await menuState(page)).open).toBe(false);

    // ---- AC3 (1) 1 回目: ねらって 右クリック → うなずき（メニューが 開くまで 1 ステップずつ）→ ふきだし・声 → メニュー
    const t1 = await talkTo(page, first.id, 'rightClick');
    testInfo.annotations.push({ type: 'うなずき', description: `右クリックから メニューが 開くまで ${t1.steps} ステップ` });
    // うなずき（仕様 §3.6 で 約 20 ステップ。細かい 数は ここでは 決めず、GIF で 見る）の あとで 開く。右クリックの すぐ あとには 開かない
    expect(t1.steps, '右クリックの すぐ あとには 開かない（うなずきの あと）').toBeGreaterThan(1);
    expect(t1.menu.open, 'メニューが 開く').toBe(true);
    expect(t1.menu.page, 'いちばん 上の ページ').toBe('top');
    expect(t1.menu.bubble.trim(), 'ふきだしが 空でない').not.toBe('');
    expect(voiceCount(t1.sfx), `声の 音が ちょうど 1 回（鳴った 音: ${t1.sfx.join(', ') || 'なし'}）`).toBe(1);
    // つなぎ目の 約束: あいさつは クリック なしで 進む（ここまで 1 ステップずつ 進めた だけ）。open が true に なった ときには ボタンまで 出て いて、道具は もう わたして ある
    expect(t1.atOpen?.buttons, 'open が true に なった ときに ボタンまで 出て いる').toEqual(BTN_ORDER.filter((id) => id !== 'tools'));
    expect({ mizumori: t1.atOpen?.mizumori, dotsuki: t1.atOpen?.dotsuki, fude: t1.atOpen?.fude }, '道具（1B から ふでも）は open が true に なる 前に わたす').toEqual({ mizumori: 1, dotsuki: 1, fude: 1 });
    expect(await countOf(page, 'mizumori'), 'はじめて 話すと みずもり 1 こ').toBe(1);
    expect(await countOf(page, 'dotsuki'), 'どうづき 1 こ').toBe(1);
    expect(await countOf(page, 'fude'), '1B から ふで 1 本（AC3・AC46）').toBe(1);
    const fude1 = await fudeLeft(page);
    expect(fude1, 'ふでは 新品（たいきゅうが まるまる のこって いる）').toHaveLength(1);
    expect(fude1[0]!.left, 'ふでは 新品').toBe(fude1[0]!.max);
    // ボタンは §2.3 の 順。道具を 持って いるので「どうぐを もらう」は 出ない。1E: くらの ボタンは ない
    expect(
      t1.menu.buttons.map((b) => b.id),
      'ボタンの ならび（上から）',
    ).toEqual(BTN_ORDER.filter((id) => id !== 'tools'));
    for (const id of ['editor', 'close']) expect(t1.menu.buttons.find((b) => b.id === id)?.enabled, `${id} は 押せる（1B から editor も 動く）`).toBe(true);
    // 1B: メニューの ボタンの 名前が「いえを つくる」から「せっけいずを つくる」に かわった
    const editorLabel = await shownTid(page, TID.btn('editor')).evaluate((el) => {
      const c = el.cloneNode(true) as Element;
      c.querySelectorAll('rt, rp').forEach((n) => n.remove());
      return (c.textContent ?? '').replace(/\s+/g, '');
    });
    expect(editorLabel, 'editor の ボタンの 字').toBe('せっけいずをつくる');
    // 画面（DOM）が menu() と 同じ・ふりがなの ない 漢字が ない
    expect(await menuMismatch(page), '画面と menu() の ちがい').toEqual([]);
    // ふきだしは 画面の どこに あっても よい（house-menu の 外でも）ので、メニューと ふきだしの 両方を 見る
    expect(findUnrubiedKanji((await htmlOf(page, TID.menu)) + (await htmlOf(page, TID.bubble))), 'ふりがなの ない 漢字（メニュー・ふきだし）').toEqual([]);
    await testInfo.attach('メニュー', { body: await page.screenshot(), contentType: 'image/png' });

    // ---- AC41: メニューが 開いて いる 間は 時刻が 止まる（step(600) の 前後で 同じ）。とじると また 進む
    const clock0 = await clockOf(page);
    await stepUi(page, 600);
    expect(await clockOf(page), 'メニューが 開いて いる 間は 時刻が 止まる').toEqual(clock0);

    // Esc で 閉じる
    await page.keyboard.press('Escape');
    await stepUi(page);
    expect((await menuState(page)).open, 'Esc で 閉じる').toBe(false);
    await stepUi(page, 60);
    expect(await clockOf(page), 'とじると 時刻は また 進む').not.toEqual(clock0);

    // ---- AC3 (2) 2 回目: 道具は ふえない
    const t2 = await talkTo(page, first.id, 'rightClick');
    expect(t2.menu.open).toBe(true);
    expect(t2.menu.page).toBe('top');
    expect(t2.menu.bubble.trim(), 'ふきだしが 空でない').not.toBe('');
    expect(voiceCount(t2.sfx), `2 回目も 声は ちょうど 1 回（鳴った 音: ${t2.sfx.join(', ') || 'なし'}）`).toBe(1);
    expect(await countOf(page, 'mizumori'), '2 回目は ふえない').toBe(1);
    expect(await countOf(page, 'dotsuki'), '2 回目は ふえない').toBe(1);
    expect(await countOf(page, 'fude'), '2 回目は ふでも ふえない').toBe(1);
    expect(
      t2.menu.buttons.map((b) => b.id),
      '道具を 持って いるので「どうぐを もらう」は 出ない',
    ).not.toContain('tools');
    // ✕ を マウスで 押して とじる（6 歳は ✕ を 押す）
    await clickUi(page, shownTid(page, TID.btn('close')), 'メニューの ✕（house-btn-close）');
    expect((await menuState(page)).open, '✕ を 押して とじる').toBe(false);

    // ---- AC3 (3) 道具を なくした あと: 話すと「どうぐを もらう」が 出て、押すと みずもり・どうづきが 1 こずつ もどる。ふでは もどらない（AC46: はじめの 1 本を わたした あと）
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.remove('mizumori', 1);
      h.inventory.remove('dotsuki', 1);
      h.inventory.remove('fude', 1);
      h.step(1);
    });
    expect(await countOf(page, 'mizumori')).toBe(0);
    expect(await countOf(page, 'dotsuki')).toBe(0);
    expect(await countOf(page, 'fude')).toBe(0);
    const t3 = await talkTo(page, first.id, 'rightClick');
    expect(t3.menu.open).toBe(true);
    expect(
      t3.menu.buttons.map((b) => b.id),
      '両方 ないので「どうぐを もらう」も 出る（6 つ）',
    ).toEqual([...BTN_ORDER]);
    expect(t3.menu.buttons.find((b) => b.id === 'tools')?.enabled, 'どうぐを もらう は 押せる').toBe(true);
    expect(await countOf(page, 'mizumori'), '話しただけでは もどらない').toBe(0);
    expect(await countOf(page, 'dotsuki'), '話しただけでは もどらない').toBe(0);
    expect(await countOf(page, 'fude'), '話しただけでは もどらない（ふでは 2 回目以降 くれない）').toBe(0);
    expect(await menuMismatch(page), '画面と menu() の ちがい（ボタン 6 つ）').toEqual([]);
    await clickUi(page, tid(page, TID.btn('tools')));
    expect(await countOf(page, 'mizumori'), '「どうぐを もらう」で みずもり 1 こ').toBe(1);
    expect(await countOf(page, 'dotsuki'), '「どうぐを もらう」で どうづき 1 こ').toBe(1);
    expect(await countOf(page, 'fude'), '「どうぐを もらう」では ふでは ふえない（はじめの 1 本を わたした あと。AC46）').toBe(0);
    expect((await press(page, 'close')).open, 'とじる').toBe(false);
  });
});

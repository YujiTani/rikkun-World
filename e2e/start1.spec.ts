import { expect, test, type Page } from '@playwright/test';
import { BASE_SET } from './helpers/blade';
import { packedBytesOf, waitSpritesReady } from './helpers/char';
import {
  clickGo,
  fightKarakasa,
  focusedTestId,
  isDisabled,
  isPressed,
  makeSavedWorld,
  markIsThere,
  openMenu,
  placeMarkAndSave,
  pressDigits,
  settleWorld,
  startInfo,
  startNewWorld,
  startState,
  tid,
  toNewScreen,
  waitExistingChecked,
  waitStarted,
} from './helpers/start';

/**
 * START-1（docs/design/START-1.md §6）: スタートメニュー。
 *   通し AC13（はじめから）・AC14（つづきから）・AC11（スタートの あと）、
 *   画面の つなぎ（AC8・AC9 の 画面ぶん。動きの 細かい 決まりは ユニット src/start/*.test.ts）、
 *   AC7 の おぼえ方（画面から）、AC15（設定ファイル）、URL で 始めたとき（窓口 start.info）。
 * メニューを 見る テストは URL に ?menu=1（E2E のサーバーは VITE_START_MENU=off なので 付けないと 出ない）。
 * 数・場所は ゲーム（window.__rikkun）に 聞く。スクショは 撮らない（見た目は UI 検査 e2e/ui-gate.spec.ts と オーナー確認）。
 */
test.describe.configure({ timeout: 240_000 });

const KEY_CHAR = 'rikkun.char.v1';
const KEY_WEIGHT = 'rikkun.weight.v1';
const KEY_START = 'rikkun.start.v1';
const ls = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);
const lastSeed = async (page: Page): Promise<number | null> => {
  const raw = await ls(page, KEY_START);
  return raw === null ? null : (JSON.parse(raw).lastSeed as number);
};
const noSpace = (s: string) => s.replace(/\s+/g, '');

test.describe('START-1 画面の つなぎ（AC8・AC9）', () => {
  test('AC8: 1 枚目 ― 字・えらんでいる 方・つづきから は 暗い・フォーカスは はじめから・Enter で 2 枚目へ', async ({ page }) => {
    await openMenu(page, '?menu=1');
    // 世界は まだ ない
    expect(await page.evaluate(() => (window as any).__rikkun.ready)).not.toBe(true);
    const st = await startState(page);
    expect(st).toMatchObject({ shown: true, screen: 'menu', continue: null, checking: false, char: 'girl', weight: 'fine' });

    const text = noSpace((await tid(page, 'start-menu').textContent()) ?? '');
    for (const w of ['りっくんワールド', 'つづきから', 'はじめから', 'キャラ', 'おんなのこ', 'おとこのこ', 'おもさ', 'かるい', 'ふつう', 'きれい']) {
      expect(text, w).toContain(w);
    }
    expect(await isDisabled(page, 'start-continue')).toBe(true);
    expect(await focusedTestId(page)).toBe('start-new');

    // えらんでいる 方だけ aria-pressed=true（はじめ: 女の子・きれい）
    expect([await isPressed(page, 'start-char-girl'), await isPressed(page, 'start-char-boy')]).toEqual([true, false]);
    expect([await isPressed(page, 'start-weight-light'), await isPressed(page, 'start-weight-normal'), await isPressed(page, 'start-weight-fine')]).toEqual([false, false, true]);

    // 1 枚目で 数字キーは 何もしない
    await page.keyboard.press('5');
    expect(await startState(page)).toMatchObject({ screen: 'menu', seedText: '' });

    // 押すと すぐ えらんだ 方が かわる
    await tid(page, 'start-char-boy').click();
    await tid(page, 'start-weight-light').click();
    expect([await isPressed(page, 'start-char-girl'), await isPressed(page, 'start-char-boy')]).toEqual([false, true]);
    expect([await isPressed(page, 'start-weight-light'), await isPressed(page, 'start-weight-normal'), await isPressed(page, 'start-weight-fine')]).toEqual([true, false, false]);
    expect(await startState(page)).toMatchObject({ char: 'boy', weight: 'light' });

    // Enter で 選択中の ボタン（はじめから）→ 2 枚目
    await tid(page, 'start-new').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (window as any).__rikkun.start.state().screen === 'new');
    await expect(tid(page, 'start-new-screen')).toBeVisible();
    await expect(tid(page, 'start-menu')).toBeHidden();
  });

  test('AC9: 2 枚目 ― 字・数字キーと ボタン・Backspace・9 けた・ランダム・Esc・もどる', async ({ page }) => {
    await openMenu(page, '?menu=1');
    await toNewScreen(page);
    const text = noSpace((await tid(page, 'start-new-screen').textContent()) ?? '');
    for (const w of ['あたらしいせかい', 'シード', 'ランダム', 'つよさ', 'やさしい', 'ふつう', 'つよい', 'もどる', 'スタート']) expect(text, w).toContain(w);
    expect(await startState(page)).toMatchObject({ screen: 'new', seedText: '', strength: 'normal', existing: false });
    expect([await isPressed(page, 'start-strength-easy'), await isPressed(page, 'start-strength-normal'), await isPressed(page, 'start-strength-hard')]).toEqual([false, true, false]);
    await expect(tid(page, 'start-existing')).toBeHidden();
    for (let d = 0; d <= 9; d++) await expect(tid(page, `start-key-${d}`)).toBeVisible();

    // 数字キーと 画面の 数字ボタンは 同じ
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.press('3');
    expect((await startState(page)).seedText).toBe('123');
    expect(noSpace((await tid(page, 'start-seed').textContent()) ?? '')).toContain('123');
    await tid(page, 'start-key-4').click();
    expect((await startState(page)).seedText).toBe('1234');
    // Backspace と ⌫ は 同じ
    await page.keyboard.press('Backspace');
    expect((await startState(page)).seedText).toBe('123');
    await tid(page, 'start-key-back').click();
    expect((await startState(page)).seedText).toBe('12');
    // 9 けたまで。10 けた目は 入らない
    await pressDigits(page, '3456789');
    expect((await startState(page)).seedText).toBe('123456789');
    await page.keyboard.press('1');
    await tid(page, 'start-key-1').click();
    expect((await startState(page)).seedText).toBe('123456789');
    // 9 けたが まどに 入りきる
    const fits = await tid(page, 'start-seed').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, '9 けたが start-seed の はばに 入る').toBe(true);

    // ランダム: 1〜9999 の 整数
    for (let i = 0; i < 3; i++) {
      await tid(page, 'start-random').click();
      const n = Number((await startState(page)).seedText);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(9999);
    }

    // つよさ
    await tid(page, 'start-strength-hard').click();
    expect(await isPressed(page, 'start-strength-hard')).toBe(true);
    expect(await isPressed(page, 'start-strength-normal')).toBe(false);

    // Esc で 1 枚目。入れた 値は のこる
    const keep = await startState(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window as any).__rikkun.start.state().screen === 'menu');
    await expect(tid(page, 'start-menu')).toBeVisible();
    await page.keyboard.press('7'); // 1 枚目では 何もしない
    await tid(page, 'start-new').click();
    expect(await startState(page)).toMatchObject({ screen: 'new', seedText: keep.seedText, strength: 'hard' });
    // もどる でも 同じ
    await tid(page, 'start-back').click();
    await page.waitForFunction(() => (window as any).__rikkun.start.state().screen === 'menu');
    await tid(page, 'start-new').click();
    expect((await startState(page)).seedText).toBe(keep.seedText);
  });

  test('?menu=1&seed=5 は まどに はじめから 5。?menu=1&char=block は キャラの 行が ない', async ({ page }) => {
    await openMenu(page, '?menu=1&seed=5');
    await toNewScreen(page);
    expect((await startState(page)).seedText).toBe('5');
    expect(noSpace((await tid(page, 'start-seed').textContent()) ?? '')).toContain('5');

    await openMenu(page, '?menu=1&char=block');
    await expect(tid(page, 'start-char-girl')).toHaveCount(0);
    await expect(tid(page, 'start-char-boy')).toHaveCount(0);
    await expect(tid(page, 'start-weight-fine')).toHaveCount(1);
    expect((await startState(page)).char).toBe('block');
  });
});

test.describe('START-1 キーボード（Enter は フォーカスの ボタン）', () => {
  test('Tab で おとこのこ に 移して Enter → おとこのこ が えらばれ、2 枚目へは 行かない', async ({ page }) => {
    await openMenu(page, '?menu=1', { waitChecked: true });
    await tid(page, 'start-char-boy').focus();
    await page.keyboard.press('Enter');
    expect(await startState(page)).toMatchObject({ screen: 'menu', char: 'boy' });
  });
});

test.describe('START-1 おぼえる（AC7 を 画面から）', () => {
  test('メニューで 押した とき すぐ localStorage に 書く。読み直すと そのまま えらばれている', async ({ page }) => {
    await openMenu(page, '?menu=1');
    expect(await ls(page, KEY_CHAR)).toBeNull();
    await tid(page, 'start-char-boy').click();
    await tid(page, 'start-weight-light').click();
    expect(await ls(page, KEY_CHAR)).toBe('boy');
    expect(await ls(page, KEY_WEIGHT)).toBe('light');
    expect(await lastSeed(page), 'スタート前は lastSeed を 書かない').toBeNull();

    await openMenu(page, '?menu=1');
    expect(await startState(page)).toMatchObject({ char: 'boy', weight: 'light' });
    expect(await isPressed(page, 'start-char-boy')).toBe(true);
    expect(await isPressed(page, 'start-weight-light')).toBe(true);
  });

  test('?menu=1&nosave=1: メニューは 出る・つづきから は 暗い・えらんだ物を おぼえない', async ({ page }) => {
    await makeSavedWorld(page); // 保存の ある 世界（つづきから が 明るく なる はずの 状態）
    await openMenu(page, '?menu=1&nosave=1');
    expect((await startState(page)).continue).toBeNull();
    expect(await isDisabled(page, 'start-continue')).toBe(true);
    const before = { char: await ls(page, KEY_CHAR), weight: await ls(page, KEY_WEIGHT), start: await ls(page, KEY_START) };
    await tid(page, 'start-char-boy').click();
    await tid(page, 'start-weight-light').click();
    expect(await startState(page)).toMatchObject({ char: 'boy', weight: 'light' });
    expect({ char: await ls(page, KEY_CHAR), weight: await ls(page, KEY_WEIGHT), start: await ls(page, KEY_START) }).toEqual(before);
  });
});

test.describe('START-1 通し', () => {
  test('AC13: はじめから の 通し（おとこのこ・かるい・4 2・やさしい → スタート）', async ({ page }) => {
    const reqs: string[] = [];
    const navs: string[] = [];
    page.on('request', (r) => reqs.push(new URL(r.url()).pathname));
    page.on('framenavigated', (f) => f === page.mainFrame() && navs.push(f.url()));
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await openMenu(page, '?menu=1'); // IndexedDB・localStorage は 空
    expect(await startState(page)).toMatchObject({ shown: true, screen: 'menu', continue: null });
    await expect(tid(page, 'start-menu')).toBeVisible();
    expect(await isDisabled(page, 'start-continue')).toBe(true);

    await tid(page, 'start-char-boy').click();
    await tid(page, 'start-weight-light').click();
    await toNewScreen(page);
    await pressDigits(page, '42');
    await waitExistingChecked(page);
    await tid(page, 'start-strength-easy').click();
    expect(await startState(page)).toMatchObject({ seedText: '42', strength: 'easy', existing: false });

    // メニューの あいだ キャラの 絵（PNG）は 読まない。顔の絵 face.png だけ
    const menuPngs = reqs.filter((p) => /\/models\/char\/.+\.png$/.test(p) && !p.endsWith('/face.png'));
    expect(menuPngs, 'メニューの あいだは face.png いがいの キャラの 絵を 読まない').toEqual([]);
    expect(reqs.some((p) => p.endsWith('/models/char/boy/face.png')), '顔の絵（おとこのこ）').toBe(true);
    expect(reqs.some((p) => p.endsWith('/models/char/girl/face.png')), '顔の絵（おんなのこ）').toBe(true);

    await clickGo(page);
    await waitStarted(page);
    await settleWorld(page);

    // 始めた あとの 窓口
    const info = await startInfo(page);
    expect(info).toMatchObject({ from: 'menu', seed: 42, strength: 'easy', weight: 'light' });
    // E2E の サーバーは VITE_MICRO_DEFAULT=off・VITE_RING_DEFAULT=small・VITE_SHADOW_DEFAULT=off で 起動する。
    // 環境変数は おもさより 先（仕様 §4.4。台帳 START-1 の test-prep の 周 1）なので、かるい の 16・small・かげなし は ここでは 見えない
    // （かるい → 16・small・かげなし は ユニット src/start/weightPref.test.ts が 見る）。
    expect(info.microR, '環境変数 VITE_MICRO_DEFAULT=off が おもさ（16）より 先').toBe(0);
    expect(info.ring).toBe('small');
    expect(info.shadowBuilt).toBe(false);
    expect(await page.evaluate(() => (window as any).__rikkun.char.get().kind)).toBe('boy');
    expect(await page.evaluate(() => (window as any).__rikkun.world.seed())).toBe(42);

    // 男の子の 絵: はじめの 4 つが ready。gpuBytes は boy/atlas.json の packed の 合計
    await waitSpritesReady(page, BASE_SET);
    const spr = await page.evaluate(() => {
      const s = (window as any).__rikkun.player.doll().sprite;
      return { kind: s.kind as string, gpuBytes: s.gpuBytes as number, status: s.status as Record<string, string> };
    });
    expect(spr.kind).toBe('boy');
    for (const n of BASE_SET) expect(spr.status[n], n).toBe('ready');
    const boyBytes = await packedBytesOf(page, 'boy', BASE_SET);
    expect(boyBytes).toBeGreaterThan(0);
    expect(spr.gpuBytes).toBe(boyBytes);
    // 女の子の 絵は 1 つも 読まない（顔の絵 face.png は メニューで 読む）
    const girl = reqs.filter((p) => p.includes('/models/char/girl/') && !p.endsWith('/face.png'));
    expect(girl, '女の子の 絵を 読んでいない').toEqual([]);

    // 遊ぶ: からかさ（M = 1）の 体力 4・攻撃力 1、すで で 4 回で たおれる
    const f = await fightKarakasa(page, 6);
    expect(f).toMatchObject({ m: 1, maxHp: 4, attack: 1 });
    expect(f.aimed.every((a) => a), JSON.stringify(f.aimed)).toBe(true);
    expect(f.hp.slice(0, 3)).toEqual([3, 2, 1]);
    expect(f.state.slice(0, 3).every((s) => s !== 'dying')).toBe(true);
    expect(f.state[3]).toBe('dying');

    // おぼえた 物
    expect(await ls(page, KEY_CHAR)).toBe('boy');
    expect(await ls(page, KEY_WEIGHT)).toBe('light');
    expect(await lastSeed(page)).toBe(42);
    expect(navs.length, 'ページは 読み直さない（最初の 1 回だけ）').toBe(1);
    expect(errors).toEqual([]);
  });

  test('AC14: つづきから の 通し（保存を 読む → つづきから → 同じ シードで はじめから → 空で スタート）', async ({ page }) => {
    // AC13 の あと: 42・やさしい の 世界に しるしを 置いて 保存
    await openMenu(page, '?menu=1');
    await startNewWorld(page, { char: 'boy', weight: 'light', digits: '42', strength: 'easy' });
    const flow = await placeMarkAndSave(page);
    expect(await page.evaluate(() => (window as any).__rikkun.save.info().writes)).toBeGreaterThan(0);

    // 読み直す → つづきから が 明るい（seed 42・やさしい）・フォーカス
    await openMenu(page, '?menu=1');
    expect(await startState(page)).toMatchObject({ shown: true, screen: 'menu', continue: { seed: 42, strength: 'easy' }, checking: false });
    expect(await isDisabled(page, 'start-continue')).toBe(false);
    await expect.poll(() => focusedTestId(page), { message: '調べおわったら フォーカスが つづきから へ 移る' }).toBe('start-continue');
    // カードの 中に その 世界の シード（§3.1「シード 1234」の 形）と つよさの 印
    const cardText = noSpace((await tid(page, 'start-continue').textContent()) ?? '');
    expect(cardText).toContain('つづきから');
    expect(cardText).toContain('シード42');
    // 前に えらんだ キャラ・おもさは そのまま
    expect(await startState(page)).toMatchObject({ char: 'boy', weight: 'light' });
    expect(await ls(page, KEY_START)).not.toBeNull();
    await tid(page, 'start-continue').click();
    await waitStarted(page);
    await settleWorld(page);
    const info = await startInfo(page);
    expect(info).toMatchObject({ from: 'menu', seed: 42, strength: 'easy' });
    expect(await markIsThere(page, flow), '保存の 中身（置いた ブロック 1 つ）').toBe(true);

    // もう一度 読み直して はじめから → 4・2 → 同じ シードの 保存の おしらせ・つよさは やさしい で 押せない
    await openMenu(page, '?menu=1');
    await toNewScreen(page);
    await pressDigits(page, '42');
    await expect(tid(page, 'start-existing')).toBeVisible();
    expect(await startState(page)).toMatchObject({ seedText: '42', existing: true, strength: 'easy' });
    expect(noSpace((await tid(page, 'start-existing').textContent()) ?? ''), '§3.1 の おしらせ').toContain('このシードのせかいはもうあるよ。つづきからあそぶよ');
    for (const s of ['easy', 'normal', 'hard']) expect(await isDisabled(page, `start-strength-${s}`), s).toBe(true);
    expect(await isPressed(page, 'start-strength-easy')).toBe(true);
    // ほかの 数に すると おしらせは きえて つよさは えらべる
    await tid(page, 'start-key-5').click();
    await expect(tid(page, 'start-existing')).toBeHidden();
    expect(await isDisabled(page, 'start-strength-hard')).toBe(false);
    await tid(page, 'start-key-back').click();
    await expect(tid(page, 'start-existing')).toBeVisible();
    // スタート → 同じ 世界（置いた ブロックが ある）
    await waitExistingChecked(page);
    await clickGo(page);
    await waitStarted(page);
    await settleWorld(page);
    expect(await startInfo(page)).toMatchObject({ seed: 42, strength: 'easy' });
    expect(await markIsThere(page, flow), '同じ 世界').toBe(true);

    // シードを 空に して スタート → 20261012（ふだんの 世界。この ブラウザには vox-main が ないので 新しい 世界）
    await openMenu(page, '?menu=1');
    await toNewScreen(page);
    expect((await startState(page)).seedText).toBe('');
    await waitExistingChecked(page);
    await clickGo(page);
    await waitStarted(page);
    expect(await page.evaluate(() => (window as any).__rikkun.world.seed())).toBe(20261012);
    expect((await startInfo(page)).strength).toBe('normal');
    expect(await lastSeed(page)).toBe(20261012);
  });

  test('AC11: スタートの あと ― メニューが きえ、URL は かわらず、読み直さず、案内画面が 出る', async ({ page }) => {
    const navs: string[] = [];
    page.on('framenavigated', (f) => f === page.mainFrame() && navs.push(f.url()));
    await openMenu(page, '?menu=1');
    const href = await page.evaluate(() => location.href);
    expect(href).toContain('menu=1');
    const t0 = navs.length;
    await toNewScreen(page);
    await waitExistingChecked(page);
    await clickGo(page);
    await waitStarted(page);

    expect(await startState(page)).toMatchObject({ shown: false, screen: null });
    await expect(tid(page, 'start-menu')).toBeHidden();
    await expect(tid(page, 'start-new-screen')).toBeHidden();
    expect(await page.evaluate(() => location.href), 'アドレスは かえない').toBe(href);
    expect(navs.length, 'ページの 読み直しが 起きない').toBe(t0);
    // 今の 案内画面（クリックして あそぼう）が 出る。キャラの 行は ない
    await expect(page.locator('.play-overlay')).toBeVisible();
    await expect(page.locator('.play-overlay .po-button')).toBeVisible();
    expect(await page.locator('.play-overlay').count()).toBe(1);
    const charRow = await page.locator('#char-setting, [data-testid="char-setting"], .char-setting').count();
    expect(charRow, '案内画面に キャラの 行（char-setting）が ない').toBe(0);
    expect(await startInfo(page)).toMatchObject({ from: 'menu', seed: 20261012, strength: 'normal' });
  });
});

test.describe('START-1 URL で 始める（今どおり）', () => {
  test('/?seed=7: メニューは 出ない・start.info は url・lastSeed を 書く。?nosave=1 は 書かない', async ({ page }) => {
    await page.goto('/?seed=7');
    await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
    expect(await startState(page)).toMatchObject({ shown: false, screen: null });
    expect(await startInfo(page)).toMatchObject({ from: 'url', seed: 7, strength: 'normal' });
    await expect(tid(page, 'start-menu')).toHaveCount(0);
    expect(await lastSeed(page)).toBe(7);
  });

  test('/?nosave=1&seed=8: lastSeed を 書かない', async ({ page }) => {
    await page.goto('/?nosave=1&seed=8');
    await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
    expect(await startInfo(page)).toMatchObject({ from: 'url', seed: 8 });
    expect(await ls(page, KEY_START)).toBeNull();
  });

  for (const level of ['easy', 'hard'] as const) {
    test(`?strength=${level}: その 起動の からかさ（M = 1）の 体力・攻撃力`, async ({ page }) => {
      await page.goto(`/?nosave=1&strength=${level}`);
      await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
      await settleWorld(page);
      expect((await startInfo(page)).strength).toBe(level);
      const want = level === 'easy' ? { maxHp: 4, attack: 1 } : { maxHp: 12, attack: 3 };
      const f = await fightKarakasa(page, 0);
      expect(f).toMatchObject({ m: 1, ...want });
    });
  }
});

test.describe('START-1 飛ばし方（AC15）', () => {
  test('4 つの playwright 設定の webServer.command が どれも VITE_START_MENU=off を ふくむ', async () => {
    const configs = {
      'playwright.config.ts': (await import('../playwright.config')).default,
      'playwright.perf.config.ts': (await import('../playwright.perf.config')).default,
      'playwright.shadow.config.ts': (await import('../playwright.shadow.config')).default,
      'playwright.calm.config.ts': (await import('../playwright.calm.config')).default,
    };
    for (const [name, c] of Object.entries(configs)) {
      const ws = c.webServer as { command?: string } | { command?: string }[] | null | undefined;
      const commands = (Array.isArray(ws) ? ws : ws ? [ws] : []).map((w) => w.command ?? '');
      expect(commands.length, `${name} の webServer`).toBeGreaterThan(0);
      expect(commands.every((cmd) => cmd.includes('VITE_START_MENU=off')), `${name}: ${commands.join(' | ')}`).toBe(true);
    }
  });

  test('今の webServer は VITE_MICRO_DEFAULT=off・VITE_SHADOW_DEFAULT=off も そのまま ふくむ（e2e180-micro の 確かめは 通る）', async ({}, testInfo) => {
    const ws = testInfo.config.webServer as { command?: string } | { command?: string }[] | null;
    const commands = (Array.isArray(ws) ? ws : ws ? [ws] : []).map((w) => w.command ?? '');
    expect(commands.some((c) => c.includes('VITE_START_MENU=off') && c.includes('VITE_MICRO_DEFAULT=off') && c.includes('VITE_SHADOW_DEFAULT=off'))).toBe(true);
  });
});

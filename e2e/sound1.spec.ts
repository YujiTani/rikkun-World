import { expect, test, type Page } from '@playwright/test';
import { flatArea, openGame, stepCollectSfx } from './helpers/audio';
import { aimAtBlock, installAimHelpers } from './helpers/aim';

/**
 * SOUND-1 の受け入れ（docs/tickets/SOUND-1-bgm.md の B8・B9・B10、SOUND-1-sfx.md の S9）。
 * 音そのものは聞けないので、window.__rikkun.audio（docs/audio/SOUND.md §8）に「何を鳴らすと決めたか」を聞く。
 * 場面を変えるステップ数は settings から読む（決め打ちしない）。
 */

const ASSETS = 'test-shots/assets';

test.describe.configure({ timeout: 120_000 });

const audioState = (page: Page) => page.evaluate(() => (window.__rikkun as any).audio.state());
const step = (page: Page, n: number) => page.evaluate((n) => (window.__rikkun as any).step(n), n);

test.describe('SOUND-1 場面と BGM', () => {
  test('B8: よるで night、妖怪が追いかけると battle、いなくなると もどる', async ({ page }) => {
    await openGame(page);
    const { bx, by, bz } = await flatArea(page);

    // ひる
    await page.evaluate(() => (window.__rikkun as any).time.set(0));
    await step(page, 30);
    let s = await audioState(page);
    expect(s.scene).toBe('day');
    expect(s.song).toBe('day');

    // よる（時間帯は ゲームに聞いて確かめる）
    await page.evaluate(() => (window.__rikkun as any).time.set(59400 + 100));
    await step(page, 30);
    expect(await page.evaluate(() => (window.__rikkun as any).time.get().phase)).toBe('night');
    s = await audioState(page);
    expect(s.scene).toBe('night');
    expect(s.song).toBe('night');

    // 妖怪を近くに出して追いかけさせる
    const ticks = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      return { enter: h.settings.get('battleEnterTicks'), exit: h.settings.get('battleExitTicks') };
    });
    expect(ticks.enter, 'settings に battleEnterTicks がある').toBeGreaterThan(0);
    expect(ticks.exit, 'settings に battleExitTicks がある').toBeGreaterThan(0);
    await page.evaluate(
      ({ bx, by, bz }) => {
        const h = window.__rikkun! as any;
        h.yokai.spawn('karakasa', bx + 0.5 + 8, by, bz + 0.5, { yawDeg: 90 });
      },
      { bx, by, bz },
    );
    // 入るまでの手前ではまだ night（Enter - 1 より前は battle にならない）
    await step(page, Math.max(1, ticks.enter - 10));
    expect((await audioState(page)).scene).toBe('night');
    await page.evaluate((n) => {
      const h = window.__rikkun! as any;
      for (let i = 0; i < n + 60; i++) {
        h.combat.setHp(20); // やられない
        h.step(1);
      }
    }, ticks.enter);
    expect(await page.evaluate(() => (window.__rikkun as any).yokai.list().some((y: any) => y.state === 'chase' || y.state === 'attack'))).toBe(true);
    s = await audioState(page);
    expect(s.scene).toBe('battle');
    expect(s.song).toBe('battle');

    // いなくなる → exit の手前はまだ battle、そのあと night にもどる
    await page.evaluate(() => (window.__rikkun as any).yokai.clear());
    await step(page, ticks.exit - 20);
    expect((await audioState(page)).scene).toBe('battle');
    await step(page, 40);
    s = await audioState(page);
    expect(s.scene).toBe('night');
    expect(s.song).toBe('night');
  });

  test('B9: もちもの 0.7・案内 0.4・おめでとう ducking', async ({ page }) => {
    await openGame(page);
    expect((await audioState(page)).screenLevel).toBe(1);

    // もちもの
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
    });
    expect((await audioState(page)).screenLevel).toBeCloseTo(0.7, 2);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
    });
    expect((await audioState(page)).screenLevel).toBe(1);

    // 案内画面
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.lock.simulate(false);
      h.step(3);
    });
    expect(await page.evaluate(() => (window.__rikkun as any).lock.get().overlayVisible)).toBe(true);
    expect((await audioState(page)).screenLevel).toBeCloseTo(0.4, 2);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.lock.simulate(true);
      h.step(3);
    });
    expect((await audioState(page)).screenLevel).toBe(1);

    // おめでとう画面
    expect((await audioState(page)).ducking).toBe(false);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.achievements.record('level', 5);
      h.step(2);
      h.achievements.flush();
      h.step(70);
    });
    expect(await page.evaluate(() => (window.__rikkun as any).achievements.modal().open)).toBe(true);
    expect((await audioState(page)).ducking).toBe(true);
    // おしらせは 240 ステップで 自動で きえる（WEAPON-7 O8。とじる は ない）
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.step(h.achievements.modal().leftSteps);
    });
    await step(page, 5);
    expect((await audioState(page)).ducking).toBe(false);
  });
});

test.describe('SOUND-1 案内画面の おと', () => {
  // 画面の部品の名前・ID は票に無い。SOUND.md §7 の文字と並び順（ぜんぶ・おんがく・こうかおん）で探す。
  const muteButton = (page: Page) => page.getByRole('button', { name: 'おと', exact: true });
  const volumeToggle = (page: Page) => page.getByRole('button', { name: /おとの\s*おおきさ/ });
  const sliders = (page: Page) => page.locator('input[type="range"]');

  async function openGuide(page: Page) {
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      document.exitPointerLock(); // 本物のロックが残っていると、マウスの位置が止まったままになる
      h.lock.simulate(false);
      h.step(3);
    });
    expect(await page.evaluate(() => (window.__rikkun as any).lock.get().overlayVisible)).toBe(true);
  }

  test('B10: ミュートのボタン・つまみ・settings・読みなおし', async ({ page }) => {
    await openGame(page, '');
    await openGuide(page);

    // 「おと」ボタンで muted が切りかわる
    await expect(muteButton(page)).toBeVisible();
    const box = await muteButton(page).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(64);
    expect(box!.height).toBeGreaterThanOrEqual(64);
    expect((await audioState(page)).muted).toBe(false);
    await muteButton(page).click();
    expect((await audioState(page)).muted).toBe(true);
    await muteButton(page).click();
    expect((await audioState(page)).muted).toBe(false);

    // つまみ 3 本
    await volumeToggle(page).click();
    await expect(sliders(page)).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const b = await sliders(page).nth(i).boundingBox();
      expect(b!.height, `つまみ ${i} の高さ`).toBeGreaterThanOrEqual(40);
    }
    await page.screenshot({ path: `${ASSETS}/sound1-guide-open.png` });
    const setSlider = (i: number, v: number) =>
      sliders(page).nth(i).evaluate((el, v) => {
        const input = el as HTMLInputElement;
        input.value = String(Math.round(v * Number(input.max || 1) * 1000) / 1000);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, v);
    await setSlider(0, 0.3);
    await setSlider(1, 0.2);
    await setSlider(2, 0.9);
    await step(page, 2);
    let s = await audioState(page);
    expect(s.master).toBeCloseTo(0.3, 2);
    expect(s.bgm).toBeCloseTo(0.2, 2);
    expect(s.fx).toBeCloseTo(0.9, 2);

    // settings からも同じ
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.settings.set('audioMuted', true);
      h.step(2);
    });
    expect((await audioState(page)).muted).toBe(true);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.settings.set('audioMuted', false);
      h.settings.set('masterVolume', 0.5);
      h.settings.set('bgmVolume', 0.25);
      h.settings.set('fxVolume', 0.75);
      h.step(2);
    });
    s = await audioState(page);
    expect([s.muted, s.master, s.bgm, s.fx]).toEqual([false, 0.5, 0.25, 0.75]);

    // 案内画面を閉じると枠も閉じる
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.lock.simulate(true);
      h.step(3);
    });
    await expect(sliders(page).first()).toBeHidden();

    // ミュートも音量も、読みなおしても残る
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.settings.set('audioMuted', true);
      h.step(2);
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    s = await audioState(page);
    expect([s.muted, s.master, s.bgm, s.fx]).toEqual([true, 0.5, 0.25, 0.75]);
    await page.evaluate(() => localStorage.removeItem('rikkun.audio.v1'));
  });
});

test.describe('SOUND-1 ほる効果音', () => {
  test('S9: dig → crack → crackFinal → ready → break → pickup の順、pickup は和音の音', async ({ page }) => {
    await openGame(page);
    const { bx, by, bz } = await flatArea(page);
    await page.evaluate(
      ({ bx, by, bz }) => {
        const h = window.__rikkun! as any;
        h.inventory.clear();
        h.settings.set('dropMax', { common: 1, uncommon: 1, rare: 1, superRare: 1 });
        h.world.setBlock(bx + 2, by + 1, bz, 'dirt'); // 立つ所の 2 つ先、目の高さ（yaw 90 のむき）
        h.step(2);
        h.audio.sfx(); // これまでの記録を空にする
      },
      { bx, by, bz },
    );
    // CHAR-1 v2 の三人称のねらい（肩の点 S から）で、そのブロックの横の面をねらう
    await installAimHelpers(page);
    await aimAtBlock(page, bx + 2, by + 1, bz, 0.5);
    await page.evaluate(() => (window.__rikkun as any).audio.sfx());
    expect(await page.evaluate(() => (window.__rikkun as any).target.get()), 'ブロックをねらえている').not.toBeNull();

    await page.evaluate(() => (window.__rikkun as any).input.press('primary'));
    // ほり終わる（ready）まで押しつづけ、押し直すとこわれる（M2 AC4）
    const records = await stepCollectSfx(page, 60);
    await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
    await page.evaluate(() => (window.__rikkun as any).step(2));
    await page.evaluate(() => (window.__rikkun as any).input.press('primary'));
    records.push(...(await stepCollectSfx(page, 10)));
    await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
    records.push(...(await stepCollectSfx(page, 60)));

    const names = records.map((r: any) => r.name);
    // dig は「コツ」の間隔で鳴り、ひびの段が上がるステップでは ひびの音に代わる（DigFx）ので、dig は ready の前のどこかに 1 回以上。
    expect(names.slice(0, names.indexOf('ready')), 'ready の前に dig がある').toContain('dig');
    const order = ['crack', 'crackFinal', 'ready', 'break', 'pickup'];
    // 順に出る（間にほかの音が混ざってもよいが、この順に 1 つずつ見つかる）
    let from = 0;
    const at: number[] = [];
    for (const n of order) {
      const i = names.indexOf(n, from);
      expect(i, `${n} が ${order.join(' → ')} の順で出る（実際: ${names.join(',')}）`).toBeGreaterThanOrEqual(0);
      at.push(i);
      from = i + 1;
    }

    // pickup の高さは、そのときの和音（根音・3 度・5 度）の音
    const pick = records[at[4]];
    const chord = pick.chord ?? (await page.evaluate(() => (window.__rikkun as any).audio.chord()));
    const root = typeof chord === 'object' ? chord.root : null;
    const minor = typeof chord === 'object' ? chord.minor : null;
    expect(root, 'pickup の記録に和音（root / minor）が入っている').not.toBeNull();
    const allowed = [0, minor ? 3 : 4, 7].map((d) => (root + d) % 12);
    // semis は「C を根音として作った音」からのずらし（contract 3.）なので、semis そのものが 高さの種類
    expect(allowed).toContain(((pick.semis % 12) + 12) % 12);
  });
});

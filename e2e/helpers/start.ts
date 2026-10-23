import { expect, type Page } from '@playwright/test';

/**
 * START-1（docs/design/START-1.md §4.7）の E2E が くり返し使う準備。
 * 時間や座標を決め打ちせず、ゲーム（window.__rikkun.start など）に聞く。
 *
 * 画面の決まり（仕様書 §4.7 の data-testid。ここで次のように 読む。開発はこれに合わせる）:
 *   start-menu        1 枚目の パネルそのもの（はば 648、画面の まん中）。2 枚目の あいだは 見えない
 *   start-new-screen  2 枚目の パネルそのもの。1 枚目の あいだは 見えない
 *   start-continue / start-new / start-char-girl|boy / start-weight-light|normal|fine
 *   start-seed（まど）/ start-key-0〜9 / start-key-back / start-random / start-existing（おしらせ）
 *   start-strength-easy|normal|hard / start-back / start-go
 *   えらんでいる 方は aria-pressed="true"、押せない 物は disabled 属性
 * メニューの あいだは 世界が ない: `__rikkun.start` だけ ある（`__rikkun.ready` は true に ならない）。
 */

export type Strength = 'easy' | 'normal' | 'hard';

export interface StartState {
  shown: boolean;
  screen: 'menu' | 'new' | null;
  continue: { seed: number; strength: Strength } | null;
  checking: boolean;
  seedText: string;
  existing: boolean;
  strength: Strength;
  char: 'girl' | 'boy' | 'block';
  weight: 'light' | 'normal' | 'fine';
}

export interface StartInfo {
  from: 'menu' | 'url';
  seed: number;
  strength: Strength;
  weight: 'light' | 'normal' | 'fine';
  microR: number;
  ring: 'small' | 'full';
  shadowBuilt: boolean;
}

export const startState = (page: Page): Promise<StartState> => page.evaluate(() => (window as any).__rikkun.start.state());
export const startInfo = (page: Page): Promise<StartInfo> => page.evaluate(() => (window as any).__rikkun.start.info());

export const tid = (page: Page, id: string) => page.getByTestId(id);

/** メニューを 開いて、出るまで 待つ。waitChecked なら「つづきから」の 調べが おわるまで（最長 3 秒 + 余裕） */
export async function openMenu(page: Page, search = '?menu=1', opts: { waitChecked?: boolean } = {}): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/' + search);
  await page.waitForFunction(() => (window as any).__rikkun?.start?.state().shown === true, null, { timeout: 60_000 });
  if (opts.waitChecked !== false) await page.waitForFunction(() => (window as any).__rikkun.start.state().checking === false, null, { timeout: 30_000 });
}

/** 「はじめから」を 押して 2 枚目を 出す */
export async function toNewScreen(page: Page): Promise<void> {
  await tid(page, 'start-new').click();
  await page.waitForFunction(() => (window as any).__rikkun.start.state().screen === 'new');
}

/** 2 枚目で 数字ボタンを 順に 押す */
export async function pressDigits(page: Page, digits: string): Promise<void> {
  for (const d of digits) await tid(page, `start-key-${d}`).click();
}

/**
 * 入れた 数の 保存を 調べおわるまで 待つ（調べている あいだ スタートは 暗い。仕様 §5）。
 * 暗さは disabled か aria-disabled。どちらも 付けない 作りでも 止まらない（0.5 秒で 先へ）
 */
export async function waitExistingChecked(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="start-go"]') as HTMLButtonElement | null;
        return !!el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
      },
      null,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(300);
}

/** スタートを 押す。調べの とちゅうで 押しても（dry で）始まらない 作りなので、メニューが きえるまで 押し直す */
export async function clickGo(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const shown = await page.evaluate(() => (window as any).__rikkun.start.state().shown);
    if (!shown) return;
    await tid(page, 'start-go').click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

/** スタートを 押したあと、世界が できて メニューが きえるまで 待つ（世界づくりは 時間が かかる） */
export async function waitStarted(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const h = (window as any).__rikkun;
      return h?.ready === true && h.start?.state().shown === false;
    },
    null,
    { timeout: 150_000 },
  );
}

/** 世界が できたあとの 準備（実績の音を消す・止める・ロックを まねる） */
export async function settleWorld(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.pause();
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
  });
}

export interface NewWorldOptions {
  char?: 'girl' | 'boy';
  weight?: 'light' | 'normal' | 'fine';
  /** 数字ボタンで 入れる 字（省くと 空 = ふだんの シード） */
  digits?: string;
  /** 省くと ふつう（押さない）。同じ シードの 保存が あると 押せない */
  strength?: Strength;
  /** スタートの あと、世界が できるまで 待つ（既定 true） */
  wait?: boolean;
}

/** 開いている 1 枚目から 「はじめから」→ 2 枚目 → スタート まで 画面の ボタンで 押す */
export async function startNewWorld(page: Page, o: NewWorldOptions = {}): Promise<void> {
  if (o.char) await tid(page, `start-char-${o.char}`).click();
  if (o.weight) await tid(page, `start-weight-${o.weight}`).click();
  await toNewScreen(page);
  if (o.digits) await pressDigits(page, o.digits);
  await waitExistingChecked(page);
  if (o.strength) await tid(page, `start-strength-${o.strength}`).click();
  await clickGo(page);
  if (o.wait !== false) {
    await waitStarted(page);
    await settleWorld(page);
  }
}

/**
 * 世界の しるし（空に 浮かぶ ブロック 1 つ）を 置いて、保存を 書かせる。置いた 場所を 返す。
 * 保存の 名前（IndexedDB）は seed ごと。?nosave=1 では 使えない。
 */
export async function placeMarkAndSave(page: Page): Promise<{ x: number; y: number; z: number }> {
  const at = await page.evaluate(async () => {
    const h = (window as any).__rikkun;
    const sp = h.world.spawn();
    const p = { x: Math.floor(sp.x) + 1, y: Math.floor(sp.y) + 6, z: Math.floor(sp.z) + 1 };
    const ok = h.world.setBlock(p.x, p.y, p.z, 'log');
    if (!ok) throw new Error('しるしの ブロックを 置けない');
    h.step(2);
    await h.save.now();
    return p;
  });
  return at;
}

/** 世界が 読みこまれて、しるしの ブロックが 見えるまで 進める（保存の 続きか どうかの 確認） */
export async function markIsThere(page: Page, at: { x: number; y: number; z: number }): Promise<boolean> {
  return page.evaluate(async (p) => {
    const h = (window as any).__rikkun;
    h.pause();
    for (let n = 0; n < 600; n++) {
      if (h.world.getBlock(p.x, p.y, p.z) === 'log') return true;
      h.step(5);
    }
    await h.world.settle?.({ full: false });
    return h.world.getBlock(p.x, p.y, p.z) === 'log';
  }, at);
}

/**
 * 保存の ある 世界を 1 つ 作る（メニューの 通し）。終わると ページは その 世界を 開いたまま。
 * 同じ ブラウザの IndexedDB・localStorage に のこる。
 */
export async function makeSavedWorld(page: Page, o: NewWorldOptions = {}): Promise<{ x: number; y: number; z: number }> {
  await openMenu(page, '?menu=1');
  await startNewWorld(page, o);
  return placeMarkAndSave(page);
}

/** 画面の 本物の ボタンが ぜんぶ 見えて 押せる（disabled でない）か。ふつうの 順で ならんだ 名前から */
export const isDisabled = (page: Page, id: string): Promise<boolean> => tid(page, id).evaluate((el) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true');
export const isPressed = (page: Page, id: string): Promise<boolean> => tid(page, id).evaluate((el) => el.getAttribute('aria-pressed') === 'true');
/** いま キーボードの 選択（フォーカス）が ある 物の data-testid */
export const focusedTestId = (page: Page): Promise<string | null> => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-testid') ?? null);

export interface FightResult {
  m: number;
  maxHp: number;
  attack: number;
  /** 1 回ずつ たたいたあとの 体力 */
  hp: number[];
  state: string[];
  aimed: boolean[];
}

/**
 * いる 場所（スポーンの まわり）に 平らな 床を 作り、からかさ（M = 1）を 1 体 置いて、すで で 何回か たたく。
 * 立つ 場所は ゲームに 聞く。たたく 数は punches。たおれたら そこで やめる。
 */
export async function fightKarakasa(page: Page, punches: number): Promise<FightResult> {
  return page.evaluate((punches) => {
    const h = (window as any).__rikkun;
    const sp = h.world.spawn();
    const bx = Math.floor(sp.x);
    const by = Math.floor(sp.y);
    const bz = Math.floor(sp.z);
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.world.fill(bx - 8, by - 1, bz - 8, bx + 12, by - 1, bz + 8, 'stone');
    h.world.fill(bx - 8, by, bz - 8, bx + 12, by + 8, bz + 8, 'air');
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.inventory.clear();
    h.armor.set(null, null, null, null);
    h.time.set(0);
    h.combat.setHp(20);
    const place = (x: number, y: number, z: number) => {
      h.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
    };
    place(bx + 0.5, by, bz + 0.5);
    h.step(10);
    const id = h.yokai.spawn('karakasa', bx + 2.5, by, bz + 0.5, { ai: false, yawDeg: 270 });
    h.yokai.events();
    const one = () => h.yokai.list().find((y: any) => y.id === id);
    const first = one();
    const out: FightResult = { m: first.m, maxHp: first.maxHp, attack: first.attack, hp: [], state: [], aimed: [] };
    for (let n = 0; n < punches; n++) {
      const y = one();
      if (!y) break;
      place(y.position.x - 2, y.position.y, y.position.z);
      const hit = h.yokai.raycast(h.camera.get().eye, { x: 1, y: 0, z: 0 }, 4);
      out.aimed.push(hit?.id === id);
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(29); // 押してから 30 ステップ目に 当たる
      const z = one();
      out.hp.push(z?.hp ?? 0);
      out.state.push(z?.state ?? 'gone');
      if (!z || z.state === 'dying') break;
    }
    return out;
  }, punches);
}

/** 平らな 床を 作らずに すぐ 使える 確認: からかさの 体力・攻撃力だけ 読む（M = 1） */
export async function karakasaNumbers(page: Page): Promise<{ m: number; maxHp: number; attack: number }> {
  const r = await fightKarakasa(page, 0);
  expect(r.m).toBe(1);
  return { m: r.m, maxHp: r.maxHp, attack: r.attack };
}

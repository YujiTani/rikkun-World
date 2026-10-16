import { expect, test, type Page } from '@playwright/test';

/** #129: 時間が とんだとき、右上の時計は 絵とことばが すぐそろう。ふつうに進んだ変わり目は 0.5 秒で ふわっと入れかえる */

type Scene = 'sunrise' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'night';

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun! as any).pause());
}

/** 時計の絵の様子（いちばん上 = 後ろの子の img が前） */
const clockState = (page: Page) =>
  page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#clock .clock-img')] as HTMLImageElement[];
    const front = imgs[imgs.length - 1];
    return {
      scene: (document.querySelector('#clock') as HTMLElement).dataset.scene as string,
      word: document.querySelector('#clock .clock-word')!.textContent as string,
      frontFade: front.classList.contains('is-fade'),
      frontAnimating: front.getAnimations().length > 0,
      frontOpacity: getComputedStyle(front).opacity,
      frontSrc: front.src,
    };
  });

/** time.set(t) して 1 ステップ進めた直後の時計 */
const jump = (page: Page, t: number) =>
  page.evaluate((tt) => {
    const h = window.__rikkun! as any;
    h.time.set(tt);
    h.step(1);
  }, t);

/** ゲームに聞いて、各 scene に入る dayTick（とその境目）を集める */
async function mapScenes(page: Page) {
  return page.evaluate(() => {
    const h = window.__rikkun! as any;
    const sceneAt = (t: number) => {
      h.time.set(t);
      h.step(1);
      return (document.querySelector('#clock') as HTMLElement).dataset.scene as string;
    };
    const total = 200000;
    // 1 日の長さ: set は 1 日にまるめるので、まるめが起きる所を二分探索で探す
    let lo = 1;
    let hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      h.time.set(mid);
      if (h.time.get().dayTick === mid) lo = mid + 1;
      else hi = mid;
    }
    const len = lo;
    const firstTick: Record<string, number> = {};
    const sample: Record<string, number> = {};
    const bounds: { from: string; to: string; at: number }[] = [];
    let prev = sceneAt(0);
    firstTick[prev] = 0;
    sample[prev] = 0;
    let prevT = 0;
    for (let t = 200; t < len; t += 200) {
      const s = sceneAt(t);
      if (s !== prev) {
        // [prevT, t] の中の境目（prev でなくなる最初の tick）
        let a = prevT;
        let b = t;
        while (b - a > 1) {
          const m = (a + b) >> 1;
          if (sceneAt(m) === prev) a = m;
          else b = m;
        }
        bounds.push({ from: prev, to: sceneAt(b), at: b });
        firstTick[s] = firstTick[s] ?? b;
        sample[s] = t;
        prev = s;
      }
      prevT = t;
    }
    return { len, bounds, sample };
  });
}

test('基準1: よる から ひる 1000 に とばした直後、絵が あさ で ことばも「あさ」', async ({ page }) => {
  await open(page);
  const m = await mapScenes(page);
  expect(m.sample.night).toBeDefined();
  // あさ の絵（いちばん上の img の src）を、とばす前に ふつうの出方で覚える
  await jump(page, 1000);
  await page.waitForTimeout(700);
  const ref = await clockState(page);
  expect(ref.scene).toBe('morning');

  await jump(page, m.sample.night);
  await page.waitForTimeout(800);
  expect((await clockState(page)).scene).toBe('night');

  await jump(page, 1000); // 待たない
  const s = await clockState(page);
  expect(s.scene).toBe('morning');
  expect(s.word).toBe('あさ');
  expect(s.frontFade).toBe(false);
  expect(s.frontOpacity).toBe('1');
  expect(s.frontSrc).toBe(ref.frontSrc);
});

test('基準2: ほかの とびかたでも 絵とことばが すぐそろう', async ({ page }) => {
  await open(page);
  const m = await mapScenes(page);
  const scenes = Object.keys(m.sample) as Scene[];
  expect(scenes.length).toBeGreaterThanOrEqual(5);
  // 各 scene の絵を ふつうの出方で覚える
  const refs: Record<string, { word: string; src: string }> = {};
  for (const sc of scenes) {
    await jump(page, m.sample[sc]);
    await page.waitForTimeout(650);
    const r = await clockState(page);
    expect(r.scene).toBe(sc);
    refs[sc] = { word: r.word, src: r.frontSrc };
  }
  // 各 scene に 1 回ずつ入る 6 組（離れたとびを含む）。待たずに続けてとばす
  const n = scenes.length;
  for (let i = 0; i < n; i++) {
    const from = scenes[i];
    const to = scenes[(i + 3) % n];
    await jump(page, m.sample[from]);
    await jump(page, m.sample[to]);
    const s = await clockState(page);
    const label = `${from} -> ${to}`;
    expect(s.scene, label).toBe(to);
    expect(s.word, label).toBe(refs[to].word);
    expect(s.frontFade, label).toBe(false);
    expect(s.frontOpacity, label).toBe('1');
    expect(s.frontSrc, label).toBe(refs[to].src);
  }
});

test('基準3: ふつうに進んで変わり目をこえたときは 0.5 秒で ふわっと入れかわる', async ({ page }) => {
  await open(page);
  const m = await mapScenes(page);
  // 1 日の中の変わり目（回りこみ以外）の 1 つ目と、ひるの中の あさ → おひる
  const b = m.bounds.find((x) => x.from === 'morning' && x.to === 'noon') ?? m.bounds[0];
  expect(b).toBeDefined();
  // 変わり目の少し前に set → アニメが終わるまで待つ
  await jump(page, b.at - 10);
  await page.waitForTimeout(700);
  const before = await clockState(page);
  expect(before.scene).toBe(b.from);
  expect(before.frontAnimating).toBe(false);
  expect(before.frontOpacity).toBe('1');
  // ふつうに進めて 変わり目をこえる（1 ステップずつ）
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    for (let i = 0; i < 15; i++) h.step(1);
  });
  const during = await clockState(page);
  expect(during.scene).toBe(b.to);
  expect(during.frontFade).toBe(true);
  expect(during.frontAnimating).toBe(true);
  // 終わったあとは opacity 1
  await page.waitForTimeout(800);
  const after = await clockState(page);
  expect(after.frontAnimating).toBe(false);
  expect(after.frontOpacity).toBe('1');
  expect(after.frontSrc).toBe(during.frontSrc);
});

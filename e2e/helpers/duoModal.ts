import { expect, type Page } from '@playwright/test';
import { NOD_STEPS } from '../../src/house/architect';
import { standNear, openHouse, waitArchitects, type Architect } from './house';
import { installFakePads, setFakePad, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)・§12.0、AC141・AC161・AC164）: 2P が 本・建築士さんを 開く E2E／UI 検査の 部品。実装の 前に 書いた。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（口・目印。仕様 §12.0 の とおり）----
 *   duo.modalOwner()          本か 建築士さんの メニューを 開いた 人（1 | 2 | null）。ふつうの URL でも 効く
 *   duo.openBook(who)         `?duo=dev` だけ。その人が ほんだなで 本を 開いたのと 同じ（開けたら true）
 *   duo-wait-p1（data-testid） 2P が 開いて 世界が 止まって いる あいだ だけ 1P の 半分（左）の まん中に「ちょっと まってね」。1P が 開いた ときは 今の duo-wait（2P の 半分）だけ
 *   2P の パッド（番号 1）: ZL〔6〕= 建築士さんに 話す・ほんだなを 開く、メニューの 中は 十字〔12〜15〕で えらび A〔0〕で 押す B〔1〕で もどる／とじる（1P の パッドと 同じ）
 *   建築士さんの メニューの ボタンは 今の `house-btn-<id>`（button）。パッドで えらんだ 物は DOM の フォーカス（document.activeElement）
 *   2P を 建築士さんの 前に 立たせるのは `duo.place(2, …)`・`duo.aimAt(2, マス)`（`?duo=dev` だけ）
 */

export const PAD_ZL = 6;
export const PAD = { a: 0, b: 1, up: 12, down: 13, left: 14, right: 15 } as const;
const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

/** 偽パッドの ボタンを 1 回 押して はなす（押している 3 ステップ ＋ はなして 3 ステップ） */
export async function tapPad(page: Page, index: number, button: number): Promise<void> {
  await setFakePad(page, index, { buttons: [button] });
  await stepN(page, 3);
  await setFakePad(page, index, {});
  await stepN(page, 3);
}

/** 建築士さんの 前に 2 人が 立つ 世界を 開く（2P 参加ずみ。1P と 2P は 建築士さんの 2 マス 南に ならぶ） */
export async function openDuoArchitect(page: Page): Promise<Architect> {
  await openHouse(page, '?nosave=1&duo=dev');
  const a = (await waitArchitects(page)).find((x) => x.first)!;
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await stepN(page, 30);
  await standNear(page, a);
  return a;
}

/** 2P を 建築士さんの 2 マス 南（1P の 右 2 マス）に 置き、からだの まん中を ねらう。建築士さんの いまの 場所を 返す */
export async function p2AimAtArchitect(page: Page, id: Architect['id']): Promise<void> {
  await page.evaluate((id) => {
    const h = (window as any).__rikkun;
    const a = h.house.architects().find((x: any) => x.id === id);
    const gy: number = h.world.groundHeight(Math.floor(a.x), Math.floor(a.z));
    h.duo.place(2, { x: a.x + 2, y: gy + 1, z: a.z + 2 });
    h.duo.aimAt(2, { x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) });
    h.step(2);
  }, id);
}

/** 2P が ZL を 押して、メニューが 開く まで（上限 max ステップ）。かかった ステップを 返す（記録だけ） */
export async function p2TalkUntilMenu(page: Page, max = 600): Promise<number> {
  await setFakePad(page, 1, { buttons: [PAD_ZL] });
  await stepN(page, 3);
  await setFakePad(page, 1, {});
  let steps = 3;
  while (steps < max && !(await page.evaluate(() => (window as any).__rikkun.house.menu().open))) {
    await stepN(page, 1);
    steps++;
  }
  return steps;
}

export const ownerOf = (page: Page): Promise<1 | 2 | null> => page.evaluate(() => (window as any).__rikkun.duo.modalOwner());
export const timeScaleOf = (page: Page): Promise<number> => page.evaluate(() => (window as any).__rikkun.duo.timeScale());
export const focusedTestId = (page: Page): Promise<string | null> => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid ?? null);

/** 2P の パッドの 十字だけで、goal の ボタン（data-testid）に フォーカスを 動かす。向きは 画面の 位置から きめる（上限 12 回） */
export async function padFocus(page: Page, goal: string): Promise<void> {
  for (let n = 0; n < 12; n++) {
    if ((await focusedTestId(page)) === goal) return;
    const d = await page.evaluate((goal) => {
      const to = document.querySelector(`[data-testid="${goal}"]`)?.getBoundingClientRect();
      const cur = (document.activeElement as HTMLElement | null)?.getBoundingClientRect();
      if (!to) return null;
      if (!cur || (document.activeElement as HTMLElement).dataset?.testid === undefined) return { dy: 1 };
      return { dy: to.top - cur.top };
    }, goal);
    if (!d) throw new Error(`${goal} が 見えない`);
    await tapPad(page, 1, d.dy < 0 ? PAD.up : PAD.down);
  }
  throw new Error(`十字で ${goal} に 着かない（今は ${String(await focusedTestId(page))}）`);
}

// ===================================================================== UI 検査（AC161・AC164）

interface Box { l: number; t: number; r: number; b: number; w: number; h: number }
const boxOf = (page: Page, sel: string): Promise<Box | null> =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (el.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  }, sel);
const tid = (id: string) => `[data-testid="${id}"]`;

/**
 * 2P が 本／建築士さんの メニューを 開いて いる 画面（ui-gate の 'duo-wait-p1-book'・'duo-wait-p1-house'）。ステップは これ以上 進めない（freeze）。
 *   book : `duo.openBook(2)`（`?duo=dev`）  house : 2P が 建築士さんに ZL → メニューが 開くまで
 */
export async function openDuoWaitP1(page: Page, what: 'book' | 'house'): Promise<void> {
  const a = await openDuoArchitect(page);
  if (what === 'book') {
    expect(await page.evaluate(() => (window as any).__rikkun.duo.openBook(2))).toBe(true);
    await stepN(page, 10);
  } else {
    await p2AimAtArchitect(page, a.id);
    await p2TalkUntilMenu(page);
  }
}

/**
 * AC161 の 検査（3 つの 大きさごとに 呼ぶ）。空 = 合格。
 *  - duo-wait-p1 が 見え、1P の 半分（左。まん中の 線から 半分の はばの 5% 以上 内側）の 中に おさまり、はばの まん中・たての まん中あたり（35〜65%）。
 *  - 本・メニューの 上で 読める: 字が 20px 以上、まん中の 点の いちばん 上の 要素が duo-wait-p1 の 中。
 *  - duo-wait（2P の 半分）は 出て いない（同時に 2 つ 出ない）。`duo.modalOwner()` は 2。
 */
export async function duoWaitP1Issues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const gap = half * 0.05;
  const w = await boxOf(page, tid('duo-wait-p1'));
  if (!w) {
    add('missing', 'duo-wait-p1', '1P の 半分の「ちょっと まってね」が 見えない');
  } else {
    if (w.l < -0.5 || w.r > half - gap + 0.5) add('half', 'duo-wait-p1', `${w.l.toFixed(0)}〜${w.r.toFixed(0)} が 1P の 半分（0〜${(half - gap).toFixed(0)}）に おさまらない`);
    const cy = (w.t + w.b) / 2;
    if (cy < vh * 0.35 || cy > vh * 0.65) add('place', 'duo-wait-p1', `たての まん中（${cy.toFixed(0)}）が 画面の 35〜65% に ない`);
    const cx = (w.l + w.r) / 2;
    if (Math.abs(cx - half / 2) > half * 0.2) add('place', 'duo-wait-p1', `よこの まん中（${cx.toFixed(0)}）が 1P の 半分の まん中から 遠い`);
    const info = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="duo-wait-p1"]') as HTMLElement;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return { font: parseFloat(getComputedStyle(el).fontSize), onTop: !!top && el.contains(top) };
    });
    if (info.font < 20) add('font', 'duo-wait-p1', `字が ${info.font}px（20px 以上）`);
    if (!info.onTop) add('cover', 'duo-wait-p1', '本・メニューの 下に かくれて いる');
  }
  if (await boxOf(page, tid('duo-wait'))) add('both', 'duo-wait', '2P の 半分の「ちょっと まってね」も 出て いる（同時に 2 つ 出ない）');
  const owner = await ownerOf(page);
  if (owner !== 2) add('owner', 'duo.modalOwner', `2P が 開いたので 2 のはず（${String(owner)}）`);
  return out;
}

/**
 * 2P が 建築士さんに 話しかけた 直後（うなずき・あいさつの あいだ。メニューの 前）の 画面（ui-gate の 'duo-house-bubble-p2'）。ふきだしを 見る。
 * ステップは うなずきの 半分ほど（NOD_STEPS より 少なく）。freeze で 撮る。
 */
export async function openDuoHouseBubble(page: Page): Promise<void> {
  const a = await openDuoArchitect(page);
  await p2AimAtArchitect(page, a.id);
  await setFakePad(page, 1, { buttons: [PAD_ZL] });
  await stepN(page, 3);
  await setFakePad(page, 1, {});
  // うなずきの 半分まで（ゲームの NOD_STEPS から 出す。かずを 直書きしない）
  await stepN(page, Math.floor(NOD_STEPS / 2) - 3);
}

/** AC164 の 検査: 2P が 話した ふきだし（house-bubble）が 2P の 半分（右）の 中に おさまり、画面の 上下に はみ出さない。まだ メニューは 開いて いない */
export async function duoHouseBubbleIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const gap = half * 0.05;
  const b = await boxOf(page, tid('house-bubble'));
  if (!b) {
    add('missing', 'house-bubble', '2P が 話した ふきだしが 見えない');
    return out;
  }
  if (b.l < half + gap - 0.5 || b.r > vw + 0.5) add('half', 'house-bubble', `${b.l.toFixed(0)}〜${b.r.toFixed(0)} が 2P の 半分（${(half + gap).toFixed(0)}〜${vw}）に おさまらない`);
  if (b.t < -0.5 || b.b > vh + 0.5) add('offscreen', 'house-bubble', 'ふきだしが 画面の 上下に はみ出す');
  const talker = await page.evaluate(() => (window as any).__rikkun.duo.modalOwner());
  if (talker !== null) add('state', 'duo.modalOwner', `メニューの 前は null のはず（${String(talker)}）`);
  return out;
}

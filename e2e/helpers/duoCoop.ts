import { expect, type Page } from '@playwright/test';
import { openAnimals } from './animals';
import { openLive3 } from './live3';
import { installFakePads, setFakePad, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)・§12.0、AC137・AC138・AC156）: 2P の にわとり・とりごやの E2E／UI 検査の 部品。実装の 前に 書いた。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（口・目印。仕様 §12.0 の とおり）----
 *   duo.carrying(who)                    … その人が だっこして いる にわとりの id（なければ null）。2P が いなければ who 2 は null。ふつうの URL でも 効く。
 *   duo.coopMenu(who)                    … その人の とりごやの メニュー（`ui.coopMenu()` と 同じ 形）。2P が いなければ who 2 は null。
 *   animals.events() の 1 こ 1 こに 省ける `by`（2P の 口を 通した 物は `by: 2`。1P の 物には キーが ない）。
 *   data-testid="duo-coop-menu-p2"       2P の とりごやの メニュー（2P の 半分の 下がわ）。1P の メニューは 今の `coop-menu`（2 人の あいだ `data-layout="duo"`）。
 *   data-testid="duo-animal-hint-p2"     2P の 合図の チップ。1P の チップは 今の `#animal-hint`。
 *   data-testid="duo-natsuki-p2"         2P の なつきの パネル。
 *   data-testid="duo-carry-ring-p2"      2P の だっこの わ。
 *   2P の パッド（番号 1）: ZL〔6〕＝ secondary（あげる・だっこ・おろす・メニューを ひらく）・十字 12〜15・A〔0〕・B〔1〕。
 */

export const PAD_ZL = 6;
export const PAD_A = 0;
export const PAD_B = 1;
export const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

/** 偽パッドを 2 本 入れて 2P を 参加させる。ふつうの 床（__A.base）の 上。`?duo=dev` */
export async function startDuoCoop(page: Page): Promise<void> {
  await openAnimals(page, '?nosave=1&duo=dev');
  await page.evaluate(() => {
    (window as any).__A.base(24);
    (window as any).__rikkun.achievements.mute(true);
  });
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await stepN(page, 30);
}

/** 2P の 前（+x に 2 マス）に なかまを 置き、2P を その 子に 向ける。id を 返す。まわりは 空き地 */
export async function placeBirdFor2P(page: Page, opts: Record<string, unknown> = {}): Promise<number> {
  return page.evaluate((opts) => {
    const h = (window as any).__rikkun;
    const p = h.duo.pos(2);
    const full = h.settings.get('animalFollowTicks');
    const id = h.animals.spawn(Math.floor(p.x) + 2.5, Math.floor(p.y), Math.floor(p.z) + 0.5, { friend: true, follow: full, ...opts });
    h.step(35);
    return id as number;
  }, opts);
}

/** 2P を その 子に 向ける（ねらいが 動いた 子に 毎回 向きなおせる ように 小さく 分ける） */
export async function aim2PAt(page: Page, id: number): Promise<void> {
  await page.evaluate((id) => {
    const h = (window as any).__rikkun;
    const a = h.animals.list().find((x: any) => x.id === id);
    h.duo.aimAt(2, { x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) });
    h.step(1);
  }, id);
}

/** 2P の ZL を 押しつづけて n ステップ（n ステップごとに 向きを 直す）。はなさない */
export async function holdZL(page: Page, id: number, n: number): Promise<void> {
  await setFakePad(page, 1, { buttons: [PAD_ZL] });
  for (let i = 0; i < n; i += 5) {
    await aim2PAt(page, id);
    await stepN(page, Math.min(5, n - i));
  }
}
export const releasePad = (page: Page): Promise<void> => setFakePad(page, 1, {});

export const eventsOf = (page: Page, type: string) =>
  page.evaluate((type) => ((window as any).__rikkun.animals.events() as Array<{ type: string; by?: number; id?: number }>).filter((e) => e.type === type), type);

// ---------------------------------------------------------------------------------------------
// UI 検査（ui-gate の 'duo-coop' と 'duo-animal-hud'）

interface Box { l: number; t: number; r: number; b: number }
const boxOf = (page: Page, sel: string): Promise<Box | null> =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }, sel);
const tid = (id: string) => `[data-testid="${id}"]`;
const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/**
 * 小屋と 子を 2 人の 前に 作る（そだてた 大人 2 わ）。1P は 右クリック、2P は ZL で とりごやの メニューを ひらく。
 * 「2 人とも ひらいた」画面が いちばん 多い とき。ステップは これ以上 進めない（freeze）。
 */
export async function openDuoCoop(page: Page): Promise<void> {
  await openLive3(page, '?nosave=1&duo=dev');
  const info = await page.evaluate(() => {
    const L = (window as any).__L;
    const A = (window as any).__A;
    const f = L.farm(2);
    return { c: f.c, face: f.f, cx: A.face(f.c) };
  });
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await page.evaluate(({ c, face }) => {
    const h = (window as any).__rikkun;
    const A = (window as any).__A;
    // 1P は 巣のうしろから、2P は すこし はなれた 所から、同じ 小屋の ふちを ねらう
    h.player.set({ position: { x: c.x + 0.5 - face.fx * 4.5, y: 9, z: c.z + 0.5 - face.fz * 4.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(face.fx, face.fz), pitch: 0 });
    h.duo.place(2, { x: c.x + 0.5 - face.fx * 4.5 + face.fz * 2, y: 9, z: c.z + 0.5 - face.fz * 4.5 - face.fx * 2 });
    h.step(3);
    A.aimBlock(c.x - face.fx * 2, c.y, c.z - face.fz * 2);
    h.duo.aimAt(2, { x: c.x - face.fx * 2, y: c.y, z: c.z - face.fz * 2 });
    h.step(2);
    A.tap();
  }, info);
  await setFakePad(page, 1, { buttons: [PAD_ZL] });
  await stepN(page, 3);
  await setFakePad(page, 1, {});
  await stepN(page, 3);
}

/**
 * AC138 の 検査（3 つの 大きさごとに 呼ぶ）。空 = 合格。
 *  - 2P の メニュー（duo-coop-menu-p2）は 2P の 半分（右）の 中、1P の メニュー（coop-menu）は 1P の 半分（左）の 中に おさまり、画面の 下がわ（半分より 下）に ある。
 *  - ホットバー・ハート・レベル表示・距離メーター・矢印に かからない。左右の メニューは 重ならない。
 *  - `duo.coopMenu(2).open` が true・`duo.coopMenu(1).open` が true・`duo.timeScale()` が 1。
 */
export async function duoCoopIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const m2 = await boxOf(page, tid('duo-coop-menu-p2'));
  const m1 = await boxOf(page, tid('coop-menu'));
  if (!m2) add('missing', 'duo-coop-menu-p2', '2P の とりごやの メニューが 見えない');
  if (!m1) add('missing', 'coop-menu', '1P の とりごやの メニューが 見えない');
  if (m2 && (m2.l < half - 0.5 || m2.r > vw + 0.5 || m2.t < vh * 0.3)) add('half', 'duo-coop-menu-p2', '2P の メニューが 2P の 半分の 下がわに おさまらない');
  if (m1 && (m1.l < -0.5 || m1.r > half + 0.5 || m1.t < vh * 0.3)) add('half', 'coop-menu', '1P の メニューが 1P の 半分の 下がわに おさまらない');
  if (m1 && m2 && overlap(m1, m2)) add('overlap', 'coop-menu/duo-coop-menu-p2', '左右の メニューが 重なる');
  for (const [name, b, crowd] of [
    ['duo-coop-menu-p2', m2, ['duo-hotbar-p2', 'duo-hearts-p2', 'duo-levelbar-p2', 'duo-meter', 'duo-arrow-p1', 'duo-arrow-p2']],
    ['coop-menu', m1, ['duo-hotbar-p1', 'duo-hearts-p1', 'duo-levelbar-p1', 'duo-meter', 'duo-arrow-p1', 'duo-arrow-p2']],
  ] as const) {
    if (!b) continue;
    for (const c of crowd) {
      const o = await boxOf(page, tid(c));
      if (o && overlap(b, o)) add('overlap', `${name}/${c}`, `${name} が ${c} に かかる`);
    }
  }
  const st = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return { c1: h.duo.coopMenu(1), c2: h.duo.coopMenu(2), ts: h.duo.timeScale() as number };
  });
  if (!st.c2?.open) add('state', 'duo.coopMenu(2)', '2P の メニューは ひらいて いるはず');
  if (!st.c1?.open) add('state', 'duo.coopMenu(1)', '1P の メニューは ひらいて いるはず');
  if (st.ts !== 1) add('state', 'duo.timeScale', `世界は 止めない（${st.ts}）`);
  return out;
}

/**
 * 2 人とも 大人の なかまに むし → もういちど で 合図の チップ（おなかいっぱい）、2P は さらに ZL を 途中まで 押して だっこの わ、パネルも 出す。
 * ステップは これ以上 進めない（チップは 120 ステップで 消える ので freeze）。
 */
export async function openDuoAnimalHud(page: Page): Promise<void> {
  await startDuoCoop(page);
  const id1 = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const p = h.duo.pos(1);
    return h.animals.spawn(Math.floor(p.x) + 2.5, Math.floor(p.y), Math.floor(p.z) + 0.5, { friend: true, follow: h.settings.get('animalFollowTicks'), stage: 'adult', natsuki: 30 }) as number;
  });
  const id2 = await placeBirdFor2P(page, { stage: 'adult', natsuki: 30 });
  await page.evaluate(({ id1 }) => {
    const h = (window as any).__rikkun;
    const A = (window as any).__A;
    h.step(30);
    const a = h.animals.list().find((x: any) => x.id === id1);
    h.duo.aimAt(1, { x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) });
    h.step(1);
    h.inventory.clear();
    h.inventory.add('mushi', 5);
    h.inventory.select(0);
    h.duo.give(2, 'mushi', 5);
    A.tap();
    h.step(40);
    A.tap(); // おなかいっぱい → 合図
  }, { id1 });
  await aim2PAt(page, id2);
  for (let i = 0; i < 2; i++) {
    await setFakePad(page, 1, { buttons: [PAD_ZL] });
    await stepN(page, 2);
    await setFakePad(page, 1, {});
    await stepN(page, 40);
    await aim2PAt(page, id2);
  }
  await holdZL(page, id2, 20); // 40 より 前: わが 途中
}

/**
 * AC156 の 検査（3 つの 大きさごとに 呼ぶ）。空 = 合格。
 *  - 2P の チップ（duo-animal-hint-p2）・パネル（duo-natsuki-p2）・わ（duo-carry-ring-p2）は 2P の 半分（右）の 中、1P の チップ（#animal-hint）は 1P の 半分（左）の 中。
 *  - ホットバー・ハート・レベル表示・距離メーター・矢印・畑の チップに かからない。同じ 人の 物どうしも 重ならない。
 */
export async function duoAnimalHudIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const items = {
    chip2: await boxOf(page, tid('duo-animal-hint-p2')),
    panel2: await boxOf(page, tid('duo-natsuki-p2')),
    ring2: await boxOf(page, tid('duo-carry-ring-p2')),
    chip1: await boxOf(page, '#animal-hint'),
  };
  const names: Record<string, string> = { chip2: 'duo-animal-hint-p2', panel2: 'duo-natsuki-p2', ring2: 'duo-carry-ring-p2', chip1: 'animal-hint' };
  const crowd2 = ['duo-hotbar-p2', 'duo-hearts-p2', 'duo-levelbar-p2', 'duo-meter', 'duo-arrow-p1', 'duo-arrow-p2', 'duo-farm-hint-p2', 'duo-farm-aim-p2'].map(tid);
  const crowd1 = ['duo-hotbar-p1', 'duo-hearts-p1', 'duo-levelbar-p1', 'duo-meter', 'duo-arrow-p1', 'duo-arrow-p2'].map(tid).concat(['#farm-hint', '#farm-aim']);
  for (const k of Object.keys(items) as (keyof typeof items)[]) {
    const b = items[k];
    if (!b) {
      add('missing', names[k]!, `${names[k]} が 見えない`);
      continue;
    }
    const right = k !== 'chip1';
    if (right ? b.l < half - 0.5 || b.r > vw + 0.5 : b.l < -0.5 || b.r > half + 0.5) add('half', names[k]!, `${names[k]} が その人の 半分に おさまらない`);
    if (b.t < -0.5 || b.b > vh + 0.5) add('offscreen', names[k]!, `${names[k]} が 画面の 上下に はみ出す`);
    for (const sel of right ? crowd2 : crowd1) {
      const o = await boxOf(page, sel);
      if (o && overlap(b, o)) add('overlap', `${names[k]}/${sel}`, `${names[k]} が ${sel} に かかる`);
    }
  }
  const r2 = ['chip2', 'panel2', 'ring2'] as const;
  for (let i = 0; i < r2.length; i++)
    for (let j = i + 1; j < r2.length; j++) {
      const a = items[r2[i]!];
      const b = items[r2[j]!];
      if (a && b && overlap(a, b)) add('overlap', `${names[r2[i]!]}/${names[r2[j]!]}`, '2P の 表示どうしが 重なる');
    }
  return out;
}

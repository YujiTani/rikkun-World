import { expect, type Page } from '@playwright/test';
import { GADGET_TUNING } from '../../src/content/items/gadgetTuning';
import type { DuoVec3 } from '../../src/duo/types';
import { createTimeSettings } from '../../src/time/config';
import { installFakePads, openDuoHud, setFakePad, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 5e（docs/design/COOP-1.md 1.16 §3.7 (f)・§12.0、AC170・AC173）: 2P の ふとんの お知らせの UI 検査の 部品。実装の 前に 書いた。
 * 2 つ: ① ひるに 2P が ふとんを 使った「よる に ねようね」（`duo-gadget-note-p2`）② よるに 1P が ふとんで まち、ねて いない 2P の 半分に「おともだちが いっしょに ねたがっているよ」（`duo-sleep-ask-p2`）。
 * 5e の E2E は 0 本（ユニットだけ）。ここは UI 検査（ui-gate の 'duo-gadget-note'）だけ。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（口・目印。仕様 §12.0 の とおり）----
 *   data-testid="duo-gadget-note-p2"   ひる・あさに 2P が ふとんを 使った とき 2P の 半分に 出る「よる に ねようね」。`GADGET_TUNING.futon.noticeSeconds` の あいだ 見える。出ていない ときは ないか hidden。
 *                                      1P の 文（#sleep-notice）は 今の まま 1P が 使った ときだけ。ねむりの 暗さ（#sleep-fade）は 画面ぜんたいで 1 つの まま。
 *   data-testid="duo-sleep-ask-p1"／"duo-sleep-ask-p2"   ねて いない 人の 半分の「おともだちが いっしょに ねたがっているよ」（AC173）。待っている 人が いて・もう 1 人が 「2 人」で まだ ねて いない・ゆうがた／よる の あいだ 見える。
 *                                      出ていない ときは ないか hidden。待っている 人の 半分には 出ない。文字は ひらがなだけ。
 *   `duo.sleep()`（DuoHook）            { ready, waiting, sleeping, stepsLeft, ask: Array<1|2>, dim: Array<{ who, value }> }。ふとんの ようす（見るだけ）。
 *   2P の パッド（番号 1）: ZL〔6〕＝ secondary（ふとんを ねらって 押す）。1P は `input.press('secondary')`。
 */

export const PAD_ZL = 6;
const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}

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
const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** その人の 前（+x に 2 マス）に ふとんを 1 つ 置いて ねらう。まわりは 空気、下は 石。ふとんの マスを 返す */
async function placeFuton(page: Page, who: 1 | 2): Promise<DuoVec3> {
  const cell: DuoVec3 = await page.evaluate((who) => {
    const h = (window as any).__rikkun;
    const p = h.duo.pos(who);
    const c = { x: Math.floor(p.x) + 2, y: Math.floor(p.y), z: Math.floor(p.z) };
    h.world.fill(c.x - 1, c.y, c.z - 1, c.x + 1, c.y + 2, c.z + 1, 'air');
    h.world.fill(c.x - 1, c.y - 1, c.z - 1, c.x + 1, c.y - 1, c.z + 1, 'stone');
    h.world.setBlock(c.x, c.y, c.z, 'futon');
    h.duo.aimAt(who, c);
    h.step(2);
    return c;
  }, who);
  const t = await page.evaluate((who) => (window as any).__rikkun.duo.target(who) as { block: DuoVec3; id: string } | null, who);
  if (!t || JSON.stringify(t.block) !== JSON.stringify(cell)) throw new Error(`${who}P が ふとんを ねらえて いない（${JSON.stringify(t)}・${JSON.stringify(cell)}）`);
  return cell;
}

/**
 * 2P が ひるに ふとんを ねらって ZL を 押した 直後の 画面（「よる に ねようね」が 2P の 半分に 出ている）。ステップは これ以上 進めない（freeze で 3 つの 大きさを 撮る）。
 * ふとんは 2P の 前（+x に 2 マス）に 1 つ。まわりは 空気。妖怪は 出さない。
 */
export async function openDuoGadgetNote(page: Page): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('animalAutoSpawn', false);
    h.time.set(0); // ひる（ふとんは ゆうがた・よるだけ）
  });
  await placeFuton(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.time.get().phase as string)).toBe('day');
  await setFakePad(page, 1, { buttons: [PAD_ZL] });
  await stepN(page, 3);
  await setFakePad(page, 1, {});
  await stepN(page, 3);
}

/**
 * 2 人で よるに、1P が ふとんを ねらって ZL を 押して「まち」に 入った 直後の 画面（ねて いない 2P の 半分に「おともだちが いっしょに ねたがっているよ」が 出る）。
 * ステップは これ以上 進めない（freeze）。偽パッドは 2 本（2P の パッドが あるので 2P は 「2 人」に 数えられる）。2P は ふとんに ZL を 押さない。
 */
export async function openDuoSleepAsk(page: Page): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await page.evaluate((night) => {
    const h = (window as any).__rikkun;
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('animalAutoSpawn', false);
    h.time.set(night);
  }, nightTick());
  await placeFuton(page, 1);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('secondary');
    h.step(1);
    h.input.release('secondary');
    h.step(3);
  });
}

/** よる（ゆうがた・よるの 間）の 1 日の 中の 時刻（ステップ）。数は 時間の 設定から */
function nightTick(): number {
  const t = createTimeSettings();
  return t.dayTicks + t.duskTicks + 500;
}

/**
 * AC170 の 検査（3 つの 大きさごとに 呼ぶ）。空 = 合格。
 *  - 2P の 文（duo-gadget-note-p2）が 見え、2P の 半分（右。まん中の 線から 半分の はばの 5% 以上）の 中に おさまり、画面の 上下に はみ出さない。
 *  - 1P の 文（#sleep-notice）は 出ていない（2P が 使った）。ねむりは はじまらず（sleeping false）、暗さ（#sleep-fade）も 出ない。
 *  - 2P の 文は 2P の ホットバー・ハート・レベル表示・たいきゅうの お知らせ・距離メーター・矢印に かからない。
 *  - 画面は 左右の まま（view が split）。
 */
export async function duoGadgetNoteIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const gap = half * 0.05;

  const note2 = await boxOf(page, tid('duo-gadget-note-p2'));
  if (!note2) add('missing', 'duo-gadget-note-p2', '2P の「よる に ねようね」が 見えない');
  else {
    if (note2.l < half + gap - 0.5 || note2.r > vw + 0.5) add('half', 'duo-gadget-note-p2', `文 ${note2.l.toFixed(0)}〜${note2.r.toFixed(0)} が 2P の 半分（${(half + gap).toFixed(0)}〜${vw}）に おさまらない`);
    if (note2.t < -0.5 || note2.b > vh + 0.5) add('offscreen', 'duo-gadget-note-p2', '文が 画面の 上下に はみ出す');
    for (const sel of [tid('duo-hotbar-p2'), tid('duo-hearts-p2'), tid('duo-levelbar-p2'), '#wear-hint-p2', '#wear-log-p2', tid('duo-meter'), tid('duo-arrow-p1'), tid('duo-arrow-p2')]) {
      const o = await boxOf(page, sel);
      if (o && overlap(note2, o)) add('overlap', `duo-gadget-note-p2/${sel.replace(/\[data-testid="|"\]/g, '')}`, `2P の 文が ${sel} に かかる`);
    }
  }
  if (await boxOf(page, '#sleep-notice')) add('place', 'sleep-notice', '1P の 文が 出ている（2P が 使った だけ）');
  if (await boxOf(page, '#sleep-fade')) add('fade', 'sleep-fade', 'ひるに 使った のに ねむりの 暗さが 出ている');
  const st = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return { view: h.duo.state().view as string, sleeping: h.sleep.get().sleeping as boolean, notice1: h.sleep.get().notice as string | null };
  });
  if (st.view !== 'split') add('view', 'duo-state', `ようすは split のはず（${st.view}）`);
  if (st.sleeping) add('sleep', 'sleep.get', 'ひるに 使った のに ねむりが はじまっている');
  if (st.notice1 !== null) add('notice', 'sleep.get', `1P の 文が のこって いる（${st.notice1}）`);
  return out;
}

/**
 * AC173 の 検査（3 つの 大きさごとに 呼ぶ。openDuoSleepAsk の 画面）。空 = 合格。
 *  - 2P の 札（duo-sleep-ask-p2）が 見え、2P の 半分（右。まん中の 線から 半分の はばの 5% 以上）の 中に おさまり、半分の はばの 80% を こえず、画面の 上下に はみ出さない。
 *  - 2P の ホットバー・ハート・レベル表示・たいきゅうの お知らせ・距離メーター・矢印・「ちょっと まってね」（duo-wait-p1）・畑や にわとりの チップに かからない。
 *  - 待っている 1P の 半分には 札（duo-sleep-ask-p1）が 出ない。ねむりは はじまっていない。
 *  - `duo.sleep()` が { ready 2・waiting 1・sleeping false・ask [2]・dim [{ who 1・value sleepWaitDim }] }。画面は 左右の まま。
 */
export async function duoSleepAskIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const gap = half * 0.05;

  const ask2 = await boxOf(page, tid('duo-sleep-ask-p2'));
  if (!ask2) add('missing', 'duo-sleep-ask-p2', '2P の「おともだちが いっしょに ねたがっているよ」が 見えない');
  else {
    if (ask2.l < half + gap - 0.5 || ask2.r > vw + 0.5) add('half', 'duo-sleep-ask-p2', `札 ${ask2.l.toFixed(0)}〜${ask2.r.toFixed(0)} が 2P の 半分（${(half + gap).toFixed(0)}〜${vw}）に おさまらない`);
    if (ask2.w > half * 0.8 + 0.5) add('size', 'duo-sleep-ask-p2', `札の はば ${ask2.w.toFixed(0)} が 半分の はばの 80%（${(half * 0.8).toFixed(0)}）を こえる`);
    if (ask2.t < -0.5 || ask2.b > vh + 0.5) add('offscreen', 'duo-sleep-ask-p2', '札が 画面の 上下に はみ出す');
    const crowd = [tid('duo-hotbar-p2'), tid('duo-hearts-p2'), tid('duo-levelbar-p2'), '#wear-hint-p2', '#wear-log-p2', tid('duo-meter'), tid('duo-arrow-p1'), tid('duo-arrow-p2'), tid('duo-wait-p1'), tid('duo-farm-hint-p2'), tid('duo-animal-hint-p2')];
    for (const sel of crowd) {
      const o = await boxOf(page, sel);
      if (o && overlap(ask2, o)) add('overlap', `duo-sleep-ask-p2/${sel.replace(/\[data-testid="|"\]/g, '')}`, `札が ${sel} に かかる`);
    }
  }
  if (await boxOf(page, tid('duo-sleep-ask-p1'))) add('place', 'duo-sleep-ask-p1', '待っている 1P の 半分に 札が 出ている');
  const st = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return { view: h.duo.state().view as string, sleep: h.duo.sleep() as { ready: number; waiting: 1 | 2 | null; sleeping: boolean; ask: Array<1 | 2>; dim: Array<{ who: 1 | 2; value: number }> } };
  });
  if (st.view !== 'split') add('view', 'duo-state', `ようすは split のはず（${st.view}）`);
  if (st.sleep.ready !== 2) add('sleep', 'duo.sleep', `ready は 2 のはず（${st.sleep.ready}）`);
  if (st.sleep.waiting !== 1) add('sleep', 'duo.sleep', `waiting は 1 のはず（${st.sleep.waiting}）`);
  if (st.sleep.sleeping) add('sleep', 'duo.sleep', '1 人だけで ねむりが はじまっている');
  if (JSON.stringify(st.sleep.ask) !== '[2]') add('sleep', 'duo.sleep', `ask は [2] のはず（${JSON.stringify(st.sleep.ask)}）`);
  const d = st.sleep.dim[0];
  if (st.sleep.dim.length !== 1 || !d || d.who !== 1 || Math.abs(d.value - GADGET_TUNING.futon.sleepWaitDim) > 1e-9) add('sleep', 'duo.sleep', `dim は [{ who 1, value sleepWaitDim }] のはず（${JSON.stringify(st.sleep.dim)}）`);
  return out;
}

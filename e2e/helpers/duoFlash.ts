import { expect, type Page } from '@playwright/test';
import { DUO_TUNING } from '../../src/duo/tuning';
import { legendWorld, RAIJIN, spawnAt } from './legend';
import { installFakePads } from './duoUi';
import type { DuoUiIssue } from './duoUi';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)「まぶしい 光」・§12.0・AC106）の UI 検査の 部品。UI 検査ゲート（e2e/ui-gate.spec.ts の 'duo-flash-p1'／'duo-flash-p2'）が 使う。
 *
 * ---- 開発への つなぎ目の 約束（DOM の data-testid。仕様 §12.0 の とおり）----
 *   duo-flash-p1 / duo-flash-p2   その人の 半分の うすい 光の 重ね（HTML）。その人の 雷・虹の 絵が 出ている あいだ だけ 見える（opacity > 0）。
 *                                 出ていない ときは ないか hidden（display:none／opacity 0）。
 *                                 位置: その人の 半分（1P = 左半分、2P = 右半分）の 中だけ（もう 1 人の 半分には はみ出さない）。半分の 90% 以上を おおう。
 *                                 opacity は 0 より 大きく DUO_TUNING.flash.alpha 以下。マウス・パッドを じゃましない（pointer-events: none）。
 *                                 もう 1 人の 半分の duo-flash は 見えない。
 */

/** 2 人で 平らな 地面に 立ち、who が 雷神剣を ため → はなす。その人の 雷の 光が 見える コマで とまる（ゲームは 一時停止のまま） */
export async function openDuoFlash(page: Page, who: 1 | 2): Promise<void> {
  const floorY = await legendWorld(page, undefined, '?nosave=1&duo=dev');
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await page.evaluate(() => (window as any).__rikkun.step(40));
  const pos = (await page.evaluate((who) => (window as any).__rikkun.duo.pos(who), who))!;
  const cell = { x: Math.floor(pos.x), y: floorY, z: Math.floor(pos.z) - 8 };
  await page.evaluate(({ who, item }) => (window as any).__rikkun.duo.give(who, item, 1), { who, item: RAIJIN });
  await spawnAt(page, 'karakasa', cell.x + 0.5, floorY + 1, cell.z + 0.5, 400);
  await page.evaluate(({ who, cell }) => (window as any).__rikkun.duo.aimAt(who, cell), { who, cell });
  await page.evaluate(() => (window as any).__rikkun.step(2));
  const shown = await page.evaluate((who) => {
    const h = (window as any).__rikkun;
    const press = (on: boolean) => {
      if (who === 1) on ? h.input.press('primary') : h.input.release('primary');
      else {
        const b = (window as any).__pads[1].buttons[7];
        b.pressed = on;
        b.touched = on;
        b.value = on ? 1 : 0;
      }
    };
    const flash = () => {
      const el = document.querySelector(`[data-testid="duo-flash-p${who}"]`) as HTMLElement | null;
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0;
    };
    let released = false;
    press(true);
    for (let i = 0; i < 600; i++) {
      const l = h.duo.legend(who);
      if (!released && l && l.charge && l.charge.ready) {
        press(false);
        released = true;
      }
      h.shadow.advance(1);
      if (released && flash()) return true;
    }
    press(false);
    return false;
  }, who);
  expect(shown, `duo-flash-p${who} が 出る コマまで 進めた`).toBe(true);
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
  opacity: number;
  pointerEvents: string;
}

const readBox = (page: Page, tid: string): Promise<Box | null> =>
  page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`) as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, opacity: Number(cs.opacity), pointerEvents: cs.pointerEvents };
  }, tid);

/** AC106: who の 光は その人の 半分の 中だけ・半分の 9 割 以上を おおう・うすい・じゃましない。もう 1 人の 半分には 出ない。空 = 合格 */
export async function duoFlashIssues(page: Page, who: 1 | 2): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const mine = `duo-flash-p${who}`;
  const other = `duo-flash-p${who === 1 ? 2 : 1}`;
  const st = await page.evaluate(() => (window as any).__rikkun.duo.state());
  if (st.view !== 'split') add('view', 'duo-state', `光の あいだも 左右の まま（state().view = ${st.view}）`);
  if (st.fullPass !== 0) add('fullPass', 'duo-state', `全面の 光の 道で 描いて いる（fullPass = ${st.fullPass}）`);

  const m = await readBox(page, mine);
  if (!m) {
    add('missing', mine, `${mine} が 見えない`);
  } else {
    const lo = who === 1 ? 0 : half;
    const hi = who === 1 ? half : vw;
    if (m.l < lo - 2 || m.r > hi + 2) add('place', mine, `その人の 半分（${lo}〜${hi}）の 外に はみ出す（${m.l.toFixed(0)}〜${m.r.toFixed(0)}）`);
    if (m.t < -2 || m.b > vh + 2) add('place', mine, `画面の 上下から はみ出す（${m.t.toFixed(0)}〜${m.b.toFixed(0)}）`);
    if (m.w < half * 0.9 || m.h < vh * 0.9) add('size', mine, `半分の 9 割 以上を おおわない（${m.w.toFixed(0)}×${m.h.toFixed(0)}）`);
    if (!(m.opacity > 0 && m.opacity <= DUO_TUNING.flash.alpha + 0.001)) add('opacity', mine, `うすい 光に なって いない（opacity ${m.opacity}、上限 ${DUO_TUNING.flash.alpha}）`);
    if (m.pointerEvents !== 'none') add('pointer', mine, `pointer-events が none でない（${m.pointerEvents}）`);
  }
  if (await readBox(page, other)) add('other', other, `出した 人でない 半分にも 光が 出て いる`);
  return out;
}

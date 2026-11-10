import { expect, type Page } from '@playwright/test';
import type { CropKind, CropStage, FarmAim, FarmHintKind } from '../../src/contracts';
import type { DuoVec3 } from '../../src/duo/types';
import { standOnGround } from './aim';
import { installFakePads, openDuoHud, setFakePad, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 5a（docs/design/COOP-1.md 1.14 §3.7 (a)(b)・§12.0、AC115・AC125・AC126）: 2P の 畑の E2E／UI 検査の 部品。実装の 前に 書いた。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（口・目印。仕様 §12.0 の とおり）----
 *   duo.farmHint(who)      … その人の 半分に 出ている 畑の 合図（'till' | 'full' | 'fill' | 'bucket' | null）。2P が いなければ who 2 は null。ふつうの URL でも 効く。
 *   duo.farmAim(who)       … その人の 作物の しるしの 中身（`farm.hud()` と 同じ 形 `FarmAim`）。ねらって いなければ null。1P は `farm.hud()` と 同じ。
 *   farm.events() の 1 こ 1 こに 省ける `by`（2P が 起こした 物は `by: 2`。1P の 物には ない）。
 *   data-testid="duo-farm-hint-p2"   2P の 半分の 合図の チップ。出ていない ときは ないか hidden。1P の チップは 今の まま（#farm-hint）。
 *   data-testid="duo-farm-aim-p2"    2P の 作物の しるし。出ていない ときは ないか hidden。1P の しるしは 今の まま（#farm-aim）。
 *   2 人の とき、1P の #farm-hint・#farm-aim は 1P の 半分（左）の 中。2P の 物は 2P の 半分（右）の 中。
 *   2P の パッド（番号 1）: ZR〔7〕＝ primary（ほる・収穫）・ZL〔6〕＝ secondary（置く・水・たねまき…）。
 */

export const PAD_ZR = 7;
export const PAD_ZL = 6;

export const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

/** 偽パッドを 2 本 入れて 2P を 参加させ、ステップを 少し 進める（`?duo=dev`・世界は 止めて 進める） */
export async function startDuoFarm(page: Page): Promise<void> {
  await page.goto('/?nosave=1&duo=dev');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.step(2);
  });
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await stepN(page, 30);
}

/**
 * 1P を、マス cell の 高さ top（0〜1。0.5 = 横の まんなか）に ねらわせる。
 * 1P の ねらいの 線は 目では なく 肩の 点 S（`camera.get().shoulder`。右へ ずれ、向きで うごく）から 出る ので、
 * `duo.aimAt(1, …)`（目から 計算）では ずれて 当たらない。2P は 目から なので `duo.aimAt(2, …)` で よい。
 * S から 向きを 求め、ステップを 進めて S を 取りなおす のを くりかえす（数回で そろう）。
 */
async function aimFromShoulder1(page: Page, cell: DuoVec3, top: number): Promise<void> {
  await page.evaluate(
    ({ cell, top }) => {
      const h = (window as any).__rikkun;
      for (let i = 0; i < 6; i++) {
        const s = h.camera.get().shoulder as DuoVec3;
        const dx = cell.x + 0.5 - s.x;
        const dy = cell.y + top - s.y;
        const dz = cell.z + 0.5 - s.z;
        h.player.set({ yaw: (Math.atan2(dx, -dz) * 180) / Math.PI, pitch: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI });
        h.step(1);
      }
      h.step(1);
    },
    { cell, top },
  );
}

/**
 * その人の 前（+x に 2 マス）に はたけと 作物を 1 つ 作り、その人が ねらう。作物の マスを 返す。
 * 作物の マスは 目の 高さ（足もとの 1 つ 上）。はたけは その 下。まわりは 空気（ねらいが 作物に 当たる ように）。
 */
export async function placeCrop(page: Page, who: 1 | 2, o: { kind?: CropKind; stage?: CropStage } = {}): Promise<DuoVec3> {
  const cell: DuoVec3 = await page.evaluate(
    ({ who, kind, stage }) => {
      const h = (window as any).__rikkun;
      const p = h.duo.pos(who);
      const c = { x: Math.floor(p.x) + 2, y: Math.floor(p.y) + 1, z: Math.floor(p.z) };
      h.world.fill(c.x - 1, c.y - 1, c.z - 1, c.x + 1, c.y + 1, c.z + 1, 'air');
      h.world.setBlock(c.x, c.y - 1, c.z, 'dirt');
      if (!h.farm.till(c.x, c.y - 1, c.z)) throw new Error('はたけに できなかった');
      if (!h.farm.plant(c.x, c.y - 1, c.z, kind)) throw new Error('作物を まけなかった');
      if (!h.farm.setStage(c.x, c.y, c.z, stage)) throw new Error('段を かえられなかった');
      if (who === 2) {
        h.duo.aimAt(2, c);
        h.step(2);
      }
      return c;
    },
    { who, kind: o.kind ?? 'tomato', stage: o.stage ?? 3 },
  );
  if (who === 1) await aimFromShoulder1(page, cell, 0.5);
  const t = await page.evaluate((who) => (window as any).__rikkun.duo.target(who) as { block: DuoVec3; id: string } | null, who);
  if (!t || JSON.stringify(t.block) !== JSON.stringify(cell)) throw new Error(`${who}P が 作物を ねらえて いない（${JSON.stringify(t)}・${JSON.stringify(cell)}）`);
  return cell;
}

export const farmAimOf = (page: Page, who: 1 | 2): Promise<FarmAim | null> => page.evaluate((who) => (window as any).__rikkun.duo.farmAim(who) as FarmAim | null, who);
export const farmHintOf = (page: Page, who: 1 | 2): Promise<FarmHintKind | null> => page.evaluate((who) => (window as any).__rikkun.duo.farmHint(who) as FarmHintKind | null, who);
export const countOf = (page: Page, who: 1 | 2, item: string): Promise<number> => page.evaluate(({ who, item }) => (window as any).__rikkun.duo.count(who, item) as number, { who, item });

/** 2P の パッドの ボタンを 1 回 押して はなす（押している 3 ステップ ＋ はなして 3 ステップ） */
export async function tapPad(page: Page, button: number): Promise<void> {
  await setFakePad(page, 1, { buttons: [button] });
  await stepN(page, 3);
  await setFakePad(page, 1, {});
  await stepN(page, 3);
}

// ===================================================================== UI 検査（AC125・AC126）

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

/**
 * 2 人とも 畑を ねらい、合図の チップが 2 つ 出ている 画面（ui-gate の 'duo-farm'）。ステップは これ以上 進めない（チップは 120 ステップで 消える ので freeze で 3 つの 大きさを 撮る）。
 *   1P: から の バケツを もって はたけの 上を ねらい 右クリック → 合図 'bucket'（1P の 半分）
 *   2P: から の じょうろを もって 作物を ねらい ZL → 合図 'fill'（2P の 半分）
 * 2P は 作物を ねらい（しるしは みのった 作物）、1P は 作物の はたけの 上を ねらう（しるしは はたけ）。
 */
export async function openDuoFarm(page: Page): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  const c1 = await placeCrop(page, 1);
  await placeCrop(page, 2);
  await aimFromShoulder1(page, { x: c1.x, y: c1.y - 1, z: c1.z }, 0.5); // 1P は はたけ（作物の した）を ねらう（バケツの 合図は 畑の 上で 出る。ユニットの AC121 と そろえる）
  const soil = await page.evaluate(() => (window as any).__rikkun.duo.target(1)?.block ?? null);
  if (JSON.stringify(soil) !== JSON.stringify({ x: c1.x, y: c1.y - 1, z: c1.z })) throw new Error(`1P が はたけを ねらえて いない（${JSON.stringify(soil)}・${JSON.stringify(c1)}）`);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.duo.give(1, 'bucket', 1);
    h.duo.give(2, 'watering_can', 1);
    h.input.press('secondary');
    h.input.release('secondary');
    h.step(3);
  });
  await tapPad(page, PAD_ZL);
  await stepN(page, 3);
}

/**
 * AC125・AC126 の 検査（3 つの 大きさごとに 呼ぶ）。空 = 合格。
 *  - 2P の チップ（duo-farm-hint-p2）と 2P の しるし（duo-farm-aim-p2）は 2P の 半分（右。まん中の 線から 半分の はばの 5% 以上）の 中に おさまり、画面から はみ出さない。
 *  - 1P の チップ（#farm-hint）と しるし（#farm-aim）は 1P の 半分（左）の 中に おさまる。
 *  - 2P の チップ・しるしは 2P の ホットバー・ハート・レベル表示・たいきゅうの お知らせ・距離メーター・矢印に かからない（1P の 物は 1P の 側の 同じ 物に かからない）。
 *  - 同じ 人の チップと しるしは 重ならない。
 *  - `duo.farmHint(2)` が 'fill'、`duo.farmHint(1)` が 'bucket'。`duo.farmAim(2)` が 出ている しるしの 中身（みのった 作物: ripe）。
 */
export async function duoFarmIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const gap = half * 0.05;

  const chip2 = await boxOf(page, tid('duo-farm-hint-p2'));
  const aim2 = await boxOf(page, tid('duo-farm-aim-p2'));
  const chip1 = await boxOf(page, '#farm-hint');
  const aim1 = await boxOf(page, '#farm-aim');
  if (!chip2) add('missing', 'duo-farm-hint-p2', '2P の 合図の チップが 見えない');
  if (!aim2) add('missing', 'duo-farm-aim-p2', '2P の 作物の しるしが 見えない');
  if (!chip1) add('missing', 'farm-hint', '1P の 合図の チップが 見えない');
  if (!aim1) add('missing', 'farm-aim', '1P の 作物の しるしが 見えない');

  const inRight = (name: string, b: Box | null) => {
    if (!b) return;
    if (b.l < half + gap - 0.5 || b.r > vw + 0.5) add('half', name, `${name} ${b.l.toFixed(0)}〜${b.r.toFixed(0)} が 2P の 半分（${(half + gap).toFixed(0)}〜${vw}）に おさまらない`);
    if (b.t < -0.5 || b.b > vh + 0.5) add('offscreen', name, `${name} が 画面の 上下に はみ出す`);
  };
  const inLeft = (name: string, b: Box | null) => {
    if (!b) return;
    if (b.l < -0.5 || b.r > half - gap + 0.5) add('half', name, `${name} ${b.l.toFixed(0)}〜${b.r.toFixed(0)} が 1P の 半分（0〜${(half - gap).toFixed(0)}）に おさまらない`);
    if (b.t < -0.5 || b.b > vh + 0.5) add('offscreen', name, `${name} が 画面の 上下に はみ出す`);
  };
  inRight('duo-farm-hint-p2', chip2);
  inRight('duo-farm-aim-p2', aim2);
  inLeft('farm-hint', chip1);
  inLeft('farm-aim', aim1);

  const crowd2 = [tid('duo-hotbar-p2'), tid('duo-hearts-p2'), tid('duo-levelbar-p2'), '#wear-hint-p2', '#wear-log-p2', tid('duo-meter'), tid('duo-arrow-p1'), tid('duo-arrow-p2')];
  const crowd1 = [tid('duo-hotbar-p1'), tid('duo-hearts-p1'), tid('duo-levelbar-p1'), '#wear-hint', '#wear-log', tid('duo-meter'), tid('duo-arrow-p1'), tid('duo-arrow-p2')];
  for (const [name, b, crowd] of [
    ['duo-farm-hint-p2', chip2, crowd2],
    ['duo-farm-aim-p2', aim2, crowd2],
    ['farm-hint', chip1, crowd1],
    ['farm-aim', aim1, crowd1],
  ] as const) {
    if (!b) continue;
    for (const sel of crowd) {
      const o = await boxOf(page, sel);
      if (o && overlap(b, o)) add('overlap', `${name}/${sel.replace(/\[data-testid="|"\]/g, '')}`, `${name} が ${sel} に かかる`);
    }
  }
  if (chip2 && aim2 && overlap(chip2, aim2)) add('overlap', 'duo-farm-hint-p2/duo-farm-aim-p2', '2P の チップと しるしが 重なる');
  if (chip1 && aim1 && overlap(chip1, aim1)) add('overlap', 'farm-hint/farm-aim', '1P の チップと しるしが 重なる');
  if (chip1 && chip2 && overlap(chip1, chip2)) add('overlap', 'farm-hint/duo-farm-hint-p2', '左右の チップが 重なる');

  const st = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return { view: h.duo.state().view as string, hint1: h.duo.farmHint(1) as string | null, hint2: h.duo.farmHint(2) as string | null, aim2: h.duo.farmAim(2) as { ripe?: boolean } | null, hud: h.farm.hud() as { ripe?: boolean } | null, aim1: h.duo.farmAim(1) };
  });
  if (st.view !== 'split') add('view', 'duo-state', `ようすは split のはず（${st.view}）`);
  if (st.hint2 !== 'fill') add('hint', 'duo.farmHint(2)', `2P の 合図は fill のはず（${st.hint2}）`);
  if (st.hint1 !== 'bucket') add('hint', 'duo.farmHint(1)', `1P の 合図は bucket のはず（${st.hint1}）`);
  if (!st.aim2 || st.aim2.ripe !== true) add('aim', 'duo.farmAim(2)', `2P の しるしは みのった 作物のはず（${JSON.stringify(st.aim2)}）`);
  if (JSON.stringify(st.aim1) !== JSON.stringify(st.hud)) add('aim', 'duo.farmAim(1)', '1P の しるしは farm.hud() と 同じのはず');
  return out;
}

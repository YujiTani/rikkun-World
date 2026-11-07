import type { Page } from '@playwright/test';
import { openDuoHud, installFakePads, setFakePad, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 4d-1（docs/design/COOP-1.md 1.13 §3.6 (a)・§12.0、AC99・AC100）: 2P の パリィの E2E／UI 検査の 部品。実装の 前に 書いた。
 * 数（ready・guard・ゆっくりの ステップ数・倍率）は 決め打ちせず ゲーム（window.__rikkun）の `settings.get` に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（口・目印。仕様 §12.0 の とおり）----
 *   `duo.parry(who)`            … その人の `parry.state()`（phase・frame・buffered・slowLeft・timeScale・glowLeft・jingasa）。2P が いなければ who 2 は null。
 *   `duo.timeScale()`           … Game に わたしている 時間の 倍率。どちらかの パリィの ゆっくりが のこって いる あいだ 0.25（4d-0 の `parryScales` の 小さい 方）。
 *   `duo.camDistance(who)`      … その人の カメラの 今の きょり（4d-0）。パリィの よせ（4d-1）は 2P が 成功した とき `duo.camDistance(2)` だけ ちぢむ。
 *   `data-testid="duo-parry-edge-p1"`／`"duo-parry-edge-p2"` … その人の 半分の 青白い ふち。出ている あいだ（glowLeft > 0・「動きを へらす」でない）だけ 見える。
 *       出ていない ときは 要素が ない か hidden／display:none／opacity 0。その人の 半分の 中に おさまる。`pointer-events: none`（押せる 物を ふさがない）。
 *   2P の パッド（番号 1）: 右の 面ボタン〔standard の 1〕＝ run（Shift）・ZR〔7〕＝ primary。遊びの 画面では 1 は run（もちもの画面の 中だけ closeMenu）。
 *   2P の 順番: 2P の パリィの 入力 → 妖怪の 当たり は 1P と 同じ（同じ ステップの 中で 入力が 先。`shared.preYokai` で 妖怪の 更新の 前に 入れる）。
 *       E2E は 受けの はじめの F（ready の つぎ）を ねらう ので、2P の 入力が 1 コマ おそいと 構えの F（おしい = 半分）に なり、「2P の ダメージ 0」で 落ちる。
 */

export const PAD_RUN = 1;
export const PAD_ZR = 7;

const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

export interface ParryNums {
  ready: number;
  guard: number;
  slowTicks: number;
  slowScale: number;
}

/** パリィの 数（ゲームに 聞く） */
export async function parryNums(page: Page): Promise<ParryNums> {
  return page.evaluate(() => {
    const s = (window as any).__rikkun.settings;
    const t = s.get('parryTicks') as { ready: number; guard: number };
    const slow = s.get('parrySlow') as { ticks: number; scale: number };
    return { ready: t.ready, guard: t.guard, slowTicks: slow.ticks, slowScale: slow.scale };
  });
}

/**
 * 2 人で 参加して、2P を 1P から はなして 立たせ、2P に 刀を 持たせる。偽パッドは 2 本（番号 1 が 2P）。
 * 妖怪は 勝手に 出ない。2P は 北東（+x）を 向いている。ちかくに 1P は いない（妖怪は 近い 方の 2P を ねらう）。
 */
export async function openDuoParry(page: Page): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('animalAutoSpawn', false);
    const p1 = h.duo.pos(1);
    const x = p1.x;
    const z = p1.z - 40;
    const fy: number = h.world.groundHeight(Math.floor(x), Math.floor(z));
    h.world.fill(Math.floor(x) - 6, fy, Math.floor(z) - 6, Math.floor(x) + 6, fy, Math.floor(z) + 6, 'stone');
    h.world.fill(Math.floor(x) - 6, fy + 1, Math.floor(z) - 6, Math.floor(x) + 6, fy + 12, Math.floor(z) + 6, 'air');
    h.duo.place(2, { x, y: fy + 1, z });
    h.duo.give(2, 'katana', 1);
    h.step(30);
  });
}

/** 2P の 前（+x）に 妖怪を 1 体（ai なし・体力 多め）。2P は その 妖怪の 方を 向く。id を 返す */
export async function spawnInFront2P(page: Page, kind = 'karakasa', d = 1.5): Promise<number> {
  return page.evaluate(
    ({ kind, d }) => {
      const h = (window as any).__rikkun;
      const p = h.duo.pos(2);
      const id = h.yokai.spawn(kind, p.x + d, p.y, p.z, { ai: false }) as number;
      h.yokai.setHp(id, 400);
      h.duo.aimAt(2, { x: Math.floor(p.x + d), y: Math.floor(p.y), z: Math.floor(p.z) });
      h.step(1);
      return id;
    },
    { kind, d },
  );
}

/** 当たるまでの ステップ数だけ 先に しらべる（置いて 攻撃させて すぐ 消す。ステップは 進めない） */
export async function probeHit2P(page: Page, kind = 'karakasa', d = 1.5): Promise<number> {
  return page.evaluate(
    ({ kind, d }) => {
      const h = (window as any).__rikkun;
      const p = h.duo.pos(2);
      const id = h.yokai.spawn(kind, p.x + d, p.y, p.z, { ai: false }) as number;
      const r = h.yokai.attackNow(id) as { hitInSteps: number } | null;
      h.yokai.clear();
      return r ? r.hitInSteps : -1;
    },
    { kind, d },
  );
}

/** 2P の パッドで run ＋ ZR を 1 ステップ 押して、ZR だけ はなす（run は 押したまま） */
export async function pressParry2P(page: Page): Promise<void> {
  await setFakePad(page, 1, { buttons: [PAD_RUN, PAD_ZR] });
  await stepN(page, 1);
  await setFakePad(page, 1, { buttons: [PAD_RUN] });
}

/**
 * 妖怪の 攻撃の 当たりが パリィの F に なる ように 2P が 押す（1P の e2e/helpers/parry.ts の parryAtF と 同じ 考え方）。
 * F > hitInSteps の ときは パリィを 先に 押してから 攻撃させる。終わりは 当たった ステップの おわり。run は 押したまま（呼ぶ 側で はなす）。
 */
export async function parry2PAtF(page: Page, id: number, hitInSteps: number, F: number): Promise<void> {
  if (F <= hitInSteps) {
    await page.evaluate((id) => (window as any).__rikkun.yokai.attackNow(id), id);
    await stepN(page, hitInSteps - F);
    await pressParry2P(page);
    await stepN(page, F - 1);
  } else {
    await pressParry2P(page);
    await stepN(page, F - 1 - hitInSteps);
    await page.evaluate((id) => (window as any).__rikkun.yokai.attackNow(id), id);
    await stepN(page, hitInSteps);
  }
}

/** 受けの はじめの F（ready の つぎ）。1 コマ おそいと おしいに なる ので、順番を くずした 実装は ここで 落ちる */
export const firstGuardF = (n: ParryNums): number => n.ready + 1;

/** 2P が パリィに 成功した 直後の 画面（ふちは 濃い まま。UI 検査用。3 つの 大きさで ステップを 進めずに 撮る） */
export async function openDuoParryEdge(page: Page): Promise<void> {
  await openDuoParry(page);
  const n = await parryNums(page);
  const hit = await probeHit2P(page);
  const id = await spawnInFront2P(page);
  await parry2PAtF(page, id, hit, firstGuardF(n));
  await stepN(page, 2); // 成功の 次の ステップから ゆっくり・ふち
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}

/** 見えている 要素だけ（display:none・visibility:hidden・opacity 0・大きさ 0 は null） */
const shownBox = (page: Page, tid: string): Promise<(Box & { pointerEvents: string }) | null> =>
  page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`) as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (el.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, pointerEvents: cs.pointerEvents };
  }, tid);

/**
 * AC100 の 検査: 2P が 成功した 直後は 2P の 半分（右）に だけ 青い ふち（`duo-parry-edge-p2`）が 出て、その 半分の 中に おさまり ふちどる（大きさ）。
 * 1P の 半分の ふち（`duo-parry-edge-p1`）は 出ない。ふちは 押せる 物を ふさがない（pointer-events: none）。空 = 合格。
 */
export async function duoParryEdgeIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const e2 = await shownBox(page, 'duo-parry-edge-p2');
  if (!e2) add('missing', 'duo-parry-edge-p2', '2P の ふちが 見えない（成功の あと）');
  else {
    if (e2.l < half - 1 || e2.r > vw + 1 || e2.t < -1 || e2.b > vh + 1) add('half', 'duo-parry-edge-p2', `ふち ${e2.l.toFixed(0)}〜${e2.r.toFixed(0)} が 2P の 半分（${half.toFixed(0)}〜${vw}）に おさまらない`);
    if (e2.w < half * 0.9 || e2.h < vh * 0.9) add('size', 'duo-parry-edge-p2', 'ふちが 半分を ふちどる 大きさに ない（半分の 9 割より 小さい）');
    if (e2.pointerEvents !== 'none') add('pointer', 'duo-parry-edge-p2', `pointer-events が none でない（${e2.pointerEvents}）`);
  }
  if (await shownBox(page, 'duo-parry-edge-p1')) add('place', 'duo-parry-edge-p1', '1P の ふちが 出ている（2P が パリィした だけ）');
  const split = await page.evaluate(() => (window as any).__rikkun.duo.state().view as string);
  if (split !== 'split') add('view', 'duo-state', `ようすは split のはず（${split}）`);
  return out;
}

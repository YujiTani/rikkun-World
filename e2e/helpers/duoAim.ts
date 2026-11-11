import { expect, type Page } from '@playwright/test';
import { installFakePads, openDuoHud, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 5f-1（docs/design/COOP-1.md 1.16 §3.7 (g) ①・§9.13・§12.0、AC174〜AC177）: 2 人の アクションヒント・＋マークまわりの E2E／UI 検査の 部品。実装の 前に 書いた。
 * UI 検査ゲート（e2e/ui-gate.spec.ts の 'duo-aim-hud'）と e2e/duoActionHint.spec.ts が 使う。数・座標は 決め打ちせず ゲーム（window.__rikkun）に 聞く。
 *
 * ---- 開発への つなぎ目の 約束（口・目印）----
 *   `duo.actionHint(who)`      … その人の 半分の ヒント（`ActionHintLines & { pad: 'mouse' | 'pad' }`）。出ていない・2P が いない → null。1P は 2 人の あいだも 1 人の ときと 同じ 形。
 *   `data-testid="duo-action-hint-p1"`／`"duo-action-hint-p2"`
 *        … その人の 半分の ＋マークの すぐ下の ヒント（2 人の ときの 1P の ヒントは 今の `#action-hint` を 使い回して よい）。出ていない ときは ないか hidden。
 *          その人の 半分の 中に おさまり（まん中の 線に またがらない）、＋マークの 下（top が ＋の まん中より 下）。pad: 'pad' の 札には マウスの 絵 `.action-hint__mouse` を 出さない。
 *   `[data-hint-pad]`（ヒントの 中。pad: 'pad' の 札ごとに 1 つ）… 肩ボタンの 小さな 絵。属性の 値＝ 面の 名前（'r2'・'l2' ...）、中の 字＝ `hintFaceLabels` の 答え（ZR／ZL ...）。はば・高さとも 24px 以上。
 *   `data-testid="duo-crosshair-p1"`／`"duo-crosshair-p2"` … 各半分の ＋マーク（24px）。中心が その 半分の まん中（半分の はば・高さの 中央 ±2px）。2 人の あいだ 画面の まん中に ＋は 1 つも 出ない。
 *   `data-testid="duo-notice-signal-p1"`／`"-p2"`（おしらせの 印）・`"duo-aim-stance-p1"`／`"-p2"`（構えの しるし）・`"duo-tech-lock-p1"`／`"-p2"`（技の ロック）
 *        … 1 人の ときの `#notice-signal`・`#aim-stance`・`#tech-lock` と 同じ 物を 半分ごとに（1 人の ときの id は そのまま）。出ていない ときは ないか hidden。
 *          その人の ＋マークに ついて いく（構えは ＋の 右、おしらせは ＋の 右下、ロックは ＋に 重なる）。
 */

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}

/** 見えている 要素の 外接の 四角。ない・hidden・大きさ 0 は null */
export const visibleBox = (page: Page, sel: string): Promise<Box | null> =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el || el.hidden) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  }, sel);

export const tid = (name: string): string => `[data-testid="${name}"]`;

const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

/** who の 前（+x）に ブロックを 1 つ 作り、その人に item を 持たせて、ねらわせる（置く・ほるの ヒントが 出る） */
export async function aimWithItem(page: Page, who: 1 | 2, item: string, dx = 2): Promise<void> {
  await page.evaluate(
    ({ who, item, dx }) => {
      const h = (window as any).__rikkun;
      const p = h.duo.pos(who);
      const c = { x: Math.floor(p.x) + dx, y: Math.floor(p.y) + 1, z: Math.floor(p.z) };
      h.world.fill(c.x - 1, c.y - 1, c.z - 1, c.x + 1, c.y + 1, c.z + 1, 'air');
      h.world.fill(c.x, c.y, c.z, c.x, c.y, c.z, 'dirt');
      h.duo.give(who, item, 5);
      h.duo.aimAt(who, c);
    },
    { who, item, dx },
  );
}

/**
 * 2 人で 参加して、1P は 土を 持って ブロックを ねらい（ヒントは ＋ほる・おく）、2P は 刀を 持って ブロックを ねらう（ヒント ＋構えの しるし）。
 * 2P の 足もとは 1P から 少し はなす。パッドは 偽物 2 本（番号 1 が 2P）。ゲームは 一時停止のまま
 */
export async function openDuoAimHud(page: Page): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('animalAutoSpawn', false);
    const p1 = h.duo.pos(1);
    h.duo.place(2, { x: p1.x, y: p1.y, z: p1.z + 6 });
  });
  await stepN(page, 10);
  await aimWithItem(page, 1, 'dirt');
  await aimWithItem(page, 2, 'katana');
  await stepN(page, 4);
  const [h1, h2] = await page.evaluate(() => {
    const d = (window as any).__rikkun.duo;
    return [d.actionHint(1), d.actionHint(2)];
  });
  expect(h1, '1P の ヒントが 出ている').not.toBeNull();
  expect(h2, '2P の ヒントが 出ている').not.toBeNull();
}

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/**
 * AC176・AC177・AC175: 2 人の とき（3 つの 大きさごとに 呼ぶ）。
 * ＋マークは 各半分の まん中・ヒントは ＋の 下で 半分の 中・構えの しるしは ＋の 右・どれも まん中の 線に またがらず、
 * ホットバー・ハート・レベル表示・距離メーターに かからない。パッドの 絵は 24px 以上で、2P の 札に マウスの 絵は ない。空 = 合格
 */
export async function duoAimHudIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const mid = Math.floor(vw / 2);
  const range = (who: 1 | 2): [number, number] => (who === 1 ? [0, mid] : [mid, vw]);

  const st = await page.evaluate(() => (window as any).__rikkun.duo.state());
  if (st.view !== 'split') add('view', 'duo-state', `左右に わかれて いない（view = ${st.view}）`);

  // 画面の まん中に ＋が 1 つも ない（まん中の 線の 上の 古い #crosshair）
  const old = await visibleBox(page, '#crosshair');
  if (old && old.l < mid && old.r > mid) add('crosshair', '#crosshair', '2 人の あいだ 画面の まん中に ＋が 残っている');

  const hudBoxes: [string, Box | null][] = [];
  for (const who of [1, 2] as const) {
    for (const part of ['hotbar', 'hearts', 'levelbar'] as const) hudBoxes.push([`duo-${part}-p${who}`, await visibleBox(page, tid(`duo-${part}-p${who}`))]);
  }
  hudBoxes.push(['duo-meter', await visibleBox(page, tid('duo-meter'))]);

  for (const who of [1, 2] as const) {
    const [lo, hi] = range(who);
    const cross = await visibleBox(page, tid(`duo-crosshair-p${who}`));
    const hint = await visibleBox(page, tid(`duo-action-hint-p${who}`));
    const stance = await visibleBox(page, tid(`duo-aim-stance-p${who}`));
    const notice = await visibleBox(page, tid(`duo-notice-signal-p${who}`));
    const lock = await visibleBox(page, tid(`duo-tech-lock-p${who}`));

    if (!cross) {
      add('missing', `duo-crosshair-p${who}`, `${who}P の ＋マークが 見えない`);
    } else {
      if (!near((cross.l + cross.r) / 2, (lo + hi) / 2, 2) || !near((cross.t + cross.b) / 2, vh / 2, 2)) {
        add('place', `duo-crosshair-p${who}`, `${who}P の ＋が その 半分の まん中に ない（中心 ${((cross.l + cross.r) / 2).toFixed(0)},${((cross.t + cross.b) / 2).toFixed(0)}）`);
      }
      if (cross.w < 23 || cross.h < 23) add('size', `duo-crosshair-p${who}`, `＋マークが 24px より 小さい（${cross.w.toFixed(0)}×${cross.h.toFixed(0)}）`);
    }

    const inHalf = (name: string, b: Box | null) => {
      if (!b) return;
      if (b.l < lo - 1 || b.r > hi + 1) add('half', name, `その人の 半分（${lo}〜${hi}）の 外に はみ出す（${b.l.toFixed(0)}〜${b.r.toFixed(0)}）`);
      if (b.l < mid && b.r > mid) add('split-line', name, '分割の 線に またがる');
      if (b.t < -1 || b.b > vh + 1) add('offscreen', name, '画面の 上下から はみ出す');
      for (const [hn, hb] of hudBoxes) {
        if (!hb) continue;
        if (b.l < hb.r && b.r > hb.l && b.t < hb.b && b.b > hb.t) add('overlap', `${name}/${hn}`, `${hn} に かかる`);
      }
    };

    if (!hint) {
      add('missing', `duo-action-hint-p${who}`, `${who}P の ヒントが 見えない`);
    } else {
      inHalf(`duo-action-hint-p${who}`, hint);
      if (cross && hint.t < (cross.t + cross.b) / 2) add('order', `duo-action-hint-p${who}`, 'ヒントが ＋マークの 下に ない');
      if (cross && !near((hint.l + hint.r) / 2, (cross.l + cross.r) / 2, 2)) add('place', `duo-action-hint-p${who}`, 'ヒントが ＋マークの 真下に ならんで いない');
      if (cross && hint.t - cross.b > 80) add('gap', `duo-action-hint-p${who}`, 'ヒントが ＋マークから はなれすぎ');
    }
    inHalf(`duo-aim-stance-p${who}`, stance);
    inHalf(`duo-notice-signal-p${who}`, notice);
    inHalf(`duo-tech-lock-p${who}`, lock);
    if (stance && cross && stance.l < cross.r) add('order', `duo-aim-stance-p${who}`, '構えの しるしが ＋の 右に ない');
    if (notice && cross && (notice.l < (cross.l + cross.r) / 2 || notice.t < (cross.t + cross.b) / 2)) add('order', `duo-notice-signal-p${who}`, 'おしらせの 印が ＋の 右下に ない');
    if (lock && cross && !near((lock.l + lock.r) / 2, (cross.l + cross.r) / 2, 2)) add('place', `duo-tech-lock-p${who}`, '技の ロックが ＋に 重なって いない');
  }

  // 2P の 構えの しるし（刀を 持っている）は 出ている
  if (!(await visibleBox(page, tid('duo-aim-stance-p2')))) add('missing', 'duo-aim-stance-p2', '2P は 刀を 持っている のに 構えの しるしが 見えない');

  // パッドの 絵: 24px 以上・面の 名前入り。2P の 札に マウスの 絵は ない
  for (const who of [1, 2] as const) {
    const info = await page.evaluate(
      ({ who }) => {
        const root = document.querySelector(`[data-testid="duo-action-hint-p${who}"]`) as HTMLElement | null;
        if (!root) return null;
        const vis = (e: Element) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
        };
        const pads = [...root.querySelectorAll('[data-hint-pad]')].filter(vis).map((e) => {
          const r = e.getBoundingClientRect();
          return { face: e.getAttribute('data-hint-pad') ?? '', text: (e.textContent ?? '').trim(), w: r.width, h: r.height };
        });
        const mice = [...root.querySelectorAll('.action-hint__mouse')].filter(vis).length;
        return { pads, mice };
      },
      { who },
    );
    if (!info) continue;
    const pad = await page.evaluate((who) => (window as any).__rikkun.duo.actionHint(who)?.pad as string | undefined, who);
    if (pad === 'pad') {
      if (info.pads.length === 0) add('pad-art', `duo-action-hint-p${who}`, 'パッドの 札なのに 肩ボタンの 絵（[data-hint-pad]）が ない');
      for (const p of info.pads) {
        if (p.w < 24 || p.h < 24) add('pad-size', `duo-action-hint-p${who}`, `肩ボタンの 絵 ${p.face} が 24px より 小さい（${p.w.toFixed(0)}×${p.h.toFixed(0)}）`);
        if (p.text === '') add('pad-label', `duo-action-hint-p${who}`, `肩ボタンの 絵 ${p.face} に 面の 名前が ない`);
      }
      if (info.mice > 0) add('mouse-art', `duo-action-hint-p${who}`, 'パッドの 札に マウスの 絵が 出ている');
    }
  }
  return out;
}

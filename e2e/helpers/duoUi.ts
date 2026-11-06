import type { Page } from '@playwright/test';
import { standOnGround } from './aim';

/**
 * COOP-1 作業 1（#395。docs/design/COOP-1.md §3.1・§9.4・AC12・AC13）の UI 検査の 部品。UI 検査ゲート（e2e/ui-gate.spec.ts の 'duo-hud'）が 使う。
 * 作業 2 で ルーペ・分割の 画面を 足すときは ここに `openDuoLoupe`・`openDuoSplit` と 検査を 足す（AC24・AC33・AC33b）。
 *
 * ---- 開発への つなぎ目の 約束（DOM の data-testid。仕様に 名前が ないので ここで 決めた）----
 *   duo-hotbar-p1 / duo-hotbar-p2   1P・2P の ホットバーの 外わく（2 人のとき だけ ある。1 人のときは 出さない）
 *   duo-hearts-p1 / duo-hearts-p2   1P・2P の ハート
 *   duo-meter                       距離メーターの 外わく。属性 data-tier="0|1|2"（色の 段。`duo.state().tier` と 同じ）
 *   duo-meter-bar                   メーターの 棒。見える 長さ（getBoundingClientRect().width）が `duo.state().meter` に 比例する。色は 段で かわる
 *   duo-meter-mark                  真ん中の 印「｜」（24 マス = 棒の 真ん中）
 * 2 人のときの ホットバーは 半分の はばの 90% 以下に 縮める（§3.1）。
 */

export interface DuoUiIssue {
  kind: string;
  /** 数字を ふくまない 目印（known.json と くらべる） */
  target: string;
  detail: string;
}

/** 2 人で 遊んでいる HUD を 出す（?duo=dev で 参加させる）。ロックして ポーズ */
export async function openDuoHud(page: Page): Promise<void> {
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
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.duo.join();
    h.step(30);
  });
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}

const boxOf = (page: Page, tid: string): Promise<Box | null> =>
  page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  }, tid);

const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** 2P を 1P の 真上 d マスの 空中に 置いて 1 コマ 進め、メーターを 読む（真上 = 地面の 読みこみに 関係なく 距離だけ 決まる） */
async function readMeterAt(page: Page, d: number) {
  return page.evaluate(async (d) => {
    const h = (window as any).__rikkun;
    const p1 = h.duo.pos(1);
    h.duo.place(2, { x: p1.x, y: p1.y + d, z: p1.z });
    h.step(1);
    const s = h.duo.state();
    const bar = document.querySelector('[data-testid="duo-meter-bar"]') as HTMLElement | null;
    const meter = document.querySelector('[data-testid="duo-meter"]') as HTMLElement | null;
    return {
      distance: s.distance as number,
      meter: s.meter as number,
      tier: s.tier as number,
      domTier: meter?.getAttribute('data-tier') ?? null,
      width: bar ? bar.getBoundingClientRect().width : -1,
      color: bar ? getComputedStyle(bar).backgroundColor : '',
    };
  }, d);
}

/**
 * AC12・AC13 の 検査（3 つの 大きさごとに 呼ぶ）。見つけた くずれを 返す（空 = 合格）。
 * 終わったら 2P を 1P の 右 2 マスに 戻す（スクショと 次の 大きさの ため）。
 */
export async function duoHudIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;

  // ---- AC12: ホットバー・ハート ----
  const hb1 = await boxOf(page, 'duo-hotbar-p1');
  const hb2 = await boxOf(page, 'duo-hotbar-p2');
  const ht1 = await boxOf(page, 'duo-hearts-p1');
  const ht2 = await boxOf(page, 'duo-hearts-p2');
  const mt = await boxOf(page, 'duo-meter');
  for (const [name, b] of [['duo-hotbar-p1', hb1], ['duo-hotbar-p2', hb2], ['duo-hearts-p1', ht1], ['duo-hearts-p2', ht2], ['duo-meter', mt]] as const) {
    if (!b) add('missing', name, `${name} が 見えない`);
  }
  if (hb1 && hb2) {
    const lineGap = half * 0.05; // まん中の 線から 半分の 幅の 5% 以上
    if (hb1.w > half * 0.9 + 0.5) add('too-wide', 'duo-hotbar-p1', `1P ホットバー ${hb1.w.toFixed(1)}px が 半分 ${half}px の 90% を こえる`);
    if (hb2.w > half * 0.9 + 0.5) add('too-wide', 'duo-hotbar-p2', `2P ホットバー ${hb2.w.toFixed(1)}px が 半分 ${half}px の 90% を こえる`);
    if (hb1.l < -0.5 || hb1.r > half - lineGap + 0.5) add('half', 'duo-hotbar-p1', `1P ホットバー ${hb1.l.toFixed(0)}〜${hb1.r.toFixed(0)} が 左半分（〜${(half - lineGap).toFixed(0)}）に おさまらない`);
    if (hb2.r > vw + 0.5 || hb2.l < half + lineGap - 0.5) add('half', 'duo-hotbar-p2', `2P ホットバー ${hb2.l.toFixed(0)}〜${hb2.r.toFixed(0)} が 右半分（${(half + lineGap).toFixed(0)}〜）に おさまらない`);
    if (overlap(hb1, hb2)) add('overlap', 'duo-hotbar-p1/p2', '左右の ホットバーが 重なる');
    if (hb1.b > vh + 0.5 || hb2.b > vh + 0.5) add('offscreen', 'duo-hotbar', 'ホットバーが 画面の 下に はみ出す');
  }
  if (hb1 && ht1 && overlap(hb1, ht1)) add('overlap', 'duo-hotbar-p1/duo-hearts-p1', '1P の ホットバーと ハートが 重なる');
  if (hb2 && ht2 && overlap(hb2, ht2)) add('overlap', 'duo-hotbar-p2/duo-hearts-p2', '2P の ホットバーと ハートが 重なる');
  if (ht1 && ht2 && overlap(ht1, ht2)) add('overlap', 'duo-hearts-p1/p2', '左右の ハートが 重なる');
  if (ht1 && (ht1.l < -0.5 || ht1.r > half + 0.5)) add('half', 'duo-hearts-p1', '1P の ハートが 左半分から はみ出す');
  if (ht2 && (ht2.r > vw + 0.5 || ht2.l < half - 0.5)) add('half', 'duo-hearts-p2', '2P の ハートが 右半分から はみ出す');
  if (mt) {
    for (const [name, b] of [['duo-hotbar-p1', hb1], ['duo-hotbar-p2', hb2], ['duo-hearts-p1', ht1], ['duo-hearts-p2', ht2]] as const) {
      if (b && overlap(mt, b)) add('overlap', `duo-meter/${name}`, `距離メーターと ${name} が 重なる`);
    }
    if (mt.t > vh * 0.2) add('place', 'duo-meter', '距離メーターが 上の 中央に ない');
    if (Math.abs((mt.l + mt.r) / 2 - half) > vw * 0.02) add('place', 'duo-meter', '距離メーターが 左右の まん中に ない');
  }

  // ---- AC13: メーターの 長さ・色の 段 ----
  const at48 = await readMeterAt(page, 48);
  const at24 = await readMeterAt(page, 24);
  const at12 = await readMeterAt(page, 12);
  const at80 = await readMeterAt(page, 80);
  if (at48.width > vw * 0.3 + 1) add('meter', 'duo-meter-bar', `いちばん 長い とき ${at48.width.toFixed(0)}px が 画面の 幅の 30% を こえる`);
  for (const r of [at12, at24, at48, at80]) {
    if (Math.abs(r.meter - Math.min(1, r.distance / 48)) > 0.02) add('meter', 'duo-meter-state', `meter ${r.meter} が 距離 ${r.distance} に 比例しない`);
    if (at48.width > 0 && Math.abs(r.width / at48.width - r.meter) > 0.04) add('meter', 'duo-meter-bar', `棒の 長さの 比 ${(r.width / at48.width).toFixed(2)} が meter ${r.meter.toFixed(2)} と 合わない`);
  }
  if (Math.abs(at80.width - at48.width) > 1) add('meter', 'duo-meter-bar', '48 マスより 遠くても 長さは 止まる');
  const mark = await boxOf(page, 'duo-meter-mark');
  if (!mark) add('missing', 'duo-meter-mark', '真ん中の 印が 見えない');

  const lo = await readMeterAt(page, 8);
  const mid = await readMeterAt(page, 18);
  const hi = await readMeterAt(page, 30);
  for (const [want, r] of [[0, lo], [1, mid], [2, hi]] as const) {
    if (r.tier !== want) add('tier', 'duo-state', `距離 ${r.distance} の 色の 段は ${want} のはず（state().tier = ${r.tier}）`);
    if (r.domTier !== String(r.tier)) add('tier', 'duo-meter', `data-tier ${r.domTier} が state().tier ${r.tier} と ちがう`);
  }
  if (new Set([lo.color, mid.color, hi.color]).size !== 3) add('tier', 'duo-meter-bar', `棒の 色が 3 つの 段で 別々に ならない（${lo.color} / ${mid.color} / ${hi.color}）`);

  // 戻す
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const p1 = h.duo.pos(1);
    h.duo.place(2, { x: p1.x + 2, y: p1.y, z: p1.z });
    h.step(2);
  });
  return out;
}

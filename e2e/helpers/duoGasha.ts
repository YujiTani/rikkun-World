import type { Page } from '@playwright/test';
import { RELEASE } from '../../src/gasha/releaseTuning';
import { openDuoHud, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)「体力ゲージ」・§12.0 の 画面の 目印（4d）・AC112）: 2 人の ときの がしゃどくろの 体力ゲージの UI 検査の 部品。実装の 前に 書いた。
 * ui-gate の 'duo-gasha-hp'（e2e/ui-gate.spec.ts）が 使う。
 *
 * ---- 開発への つなぎ目の 約束（目印は 仕様 §12.0 の とおり）----
 *   data-testid="gasha-hp-p1"   2 人の ときの 1P の 半分の ゲージ。1P の `#gashaBigHp` に つける（1 人の ときも 同じ 要素。testid は 2P が いる あいだ だけで よい）
 *   data-testid="gasha-hp-p2"   2P の 半分の ゲージ（2 つ目。id なし）。どちらも 出ていない ときは ないか hidden（display:none など）
 *   ゲージは その人の 半分の 中に おさまり（まん中の 線から 半分の はばの 5% 以上 はなれる）、距離メーター（duo-meter。上 12%）・時計（#clock）・矢印・ハート・ホットバー・レベル表示に かからない。
 *   2 人の ゲージは たがいに 重ならない。画面の 外に はみ出さない。
 */

interface Box { l: number; t: number; r: number; b: number; w: number; h: number }

const boxOf = (page: Page, sel: string): Promise<Box | null> =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  }, sel);
const tid = (id: string) => `[data-testid="${id}"]`;
const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/**
 * 2 人で 遊んで いて、がしゃどくろが 2 人とも barShowDistance（100 マス）より 近くに いる 画面を 出す。
 * 1P の 前 60 マスに 出す（2P は 1P の 右 2 マス）。しらべは checkEverySec ごと なので 数ステップ 進める。
 */
export async function openDuoGashaHp(page: Page): Promise<void> {
  await openDuoHud(page);
  const ok = await page.evaluate(async () => (await (window as any).__rikkun.gasha.spawn({ distance: 60, angleDeg: 0 })) as boolean);
  if (!ok) throw new Error('がしゃどくろを 出せなかった');
  await page.evaluate((n) => (window as any).__rikkun.step(n), Math.ceil(RELEASE.spawn.checkEverySec * 60) + 30);
}

/** 3 つの 大きさごとに 呼ぶ。見つけた くずれを 返す（空 = 合格） */
export async function duoGashaHpIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;
  const lineGap = half * 0.05;
  const g1 = await boxOf(page, tid('gasha-hp-p1'));
  const g2 = await boxOf(page, tid('gasha-hp-p2'));
  if (!g1) add('missing', 'gasha-hp-p1', '1P の 半分の ゲージが 見えない');
  if (!g2) add('missing', 'gasha-hp-p2', '2P の 半分の ゲージが 見えない');
  if (g1) {
    if (g1.l < -0.5 || g1.r > half - lineGap + 0.5) add('half', 'gasha-hp-p1', `1P の ゲージ ${g1.l.toFixed(0)}〜${g1.r.toFixed(0)} が 左半分（〜${(half - lineGap).toFixed(0)}）に おさまらない`);
    if (g1.t < -0.5 || g1.b > vh + 0.5) add('offscreen', 'gasha-hp-p1', '1P の ゲージが 画面の 上下に はみ出す');
  }
  if (g2) {
    if (g2.r > vw + 0.5 || g2.l < half + lineGap - 0.5) add('half', 'gasha-hp-p2', `2P の ゲージ ${g2.l.toFixed(0)}〜${g2.r.toFixed(0)} が 右半分（${(half + lineGap).toFixed(0)}〜）に おさまらない`);
    if (g2.t < -0.5 || g2.b > vh + 0.5) add('offscreen', 'gasha-hp-p2', '2P の ゲージが 画面の 上下に はみ出す');
  }
  if (g1 && g2 && overlap(g1, g2)) add('overlap', 'gasha-hp-p1/p2', '左右の ゲージが 重なる');
  const others = ['duo-meter', 'duo-hearts-p1', 'duo-hearts-p2', 'duo-hotbar-p1', 'duo-hotbar-p2', 'duo-levelbar-p1', 'duo-levelbar-p2', 'duo-arrow-p1', 'duo-arrow-p2'].map(tid).concat('#clock');
  for (const [name, g] of [['gasha-hp-p1', g1], ['gasha-hp-p2', g2]] as const) {
    if (!g) continue;
    for (const sel of others) {
      const b = await boxOf(page, sel);
      if (b && overlap(g, b)) add('overlap', `${name}/${sel.replace(/\[data-testid="|"\]/g, '')}`, `${name} が ${sel} に かかる`);
    }
  }
  return out;
}

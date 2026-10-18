import type { Page } from '@playwright/test';

/**
 * 実績の おしらせ（画面の 上の 帯。WEAPON-7 §2.6 (1)・O8）を 待つ 共通の 道具。
 * 「とじる」は なくなった（`achievements.close()` は ない）。おしらせは 240 ステップで 自動で きえるので、
 * 見たい ときは `achievements.modal().leftSteps` ぶん ステップを すすめて きえるのを 待つ。ゲームは 止まらない。
 */

/** ページの 中で 使う 文字（`page.evaluate` の 中の `h` を わたして 呼ぶ）。きえるまで 進める（上限 `max` ステップ） */
export const DRAIN_TOAST = `(h, max = 2400) => {
  let n = 0;
  while (n < max) {
    const m = h.achievements.modal();
    if (!m || !m.open) break;
    const k = Math.max(1, m.leftSteps | 0);
    h.step(k);
    n += k;
  }
  return n;
}`;

/** おしらせが きえるまで 進める。戻りは 進めた ステップ（出て いなければ 0） */
export async function waitToastGone(page: Page, max = 2400): Promise<number> {
  return page.evaluate(
    ({ f, max }) => (0, eval)(f)((window as any).__rikkun, max) as number,
    { f: DRAIN_TOAST, max },
  );
}

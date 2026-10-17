import type { Page } from '@playwright/test';

/**
 * CSS のアニメーション・トランジション（開く・ふわっと出る・押した動き）が ぜんぶ おわるのを待つ。
 * ずっと くりかえす動き（点滅など）は 待たない。
 * 機械の速さにたよらないよう、時間の上限は テスト全体にまかせる（timeout: 0）。
 * root を渡すと、その要素の中だけを見る（selector）。
 */
export async function waitAnimationsDone(page: Page, root?: string): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const scope: Document | Element | null = sel ? document.querySelector(sel) : document;
      if (!scope) return true;
      const list = sel ? (scope as Element).getAnimations({ subtree: true }) : document.getAnimations();
      return list.every((a) => {
        const it = a.effect?.getComputedTiming().iterations;
        if (it === Infinity) return true;
        return a.playState === 'finished' || a.playState === 'idle';
      });
    },
    root ?? null,
    { timeout: 0 },
  );
}

/**
 * 画面が n 回 描き直される（requestAnimationFrame が n 回 回る）のを待つ。
 * 「ゲームが止まっている」ことを、ゲームのループが何回か回ったあとで確かめるときに使う。
 * 本当の時間の長さではなく、回数で待つ（機械が遅くても同じ意味になる）。
 */
export async function waitFrames(page: Page, n = 5): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const tick = () => {
          if (--left <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    n,
  );
}

/**
 * selector に合う要素の 位置・大きさが、続けて frames 回の描き直しのあいだ 変わらなくなるのを待つ。
 * ゲーム側が「動きが終わった」と教えてくれない動き（カメラが引ききる、など）に使う。
 * 時間の上限は テスト全体にまかせる。
 */
export async function waitLayoutStable(page: Page, selector: string, frames = 3): Promise<void> {
  await page.waitForFunction(
    ({ sel, need }) => {
      const w = window as unknown as { __stab?: { key: string; n: number } };
      const key = Array.from(document.querySelectorAll(sel))
        .map((e) => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height].map((v) => v.toFixed(2)).join(',');
        })
        .join('|');
      const prev = w.__stab;
      w.__stab = { key, n: prev && prev.key === key ? prev.n + 1 : 0 };
      return w.__stab.n >= need;
    },
    { sel: selector, need: frames },
    { timeout: 0, polling: 'raf' },
  );
}

/**
 * スクショの前: 一時停止中の step で たまった描画が 画面に出て（2 回 描き直し）、
 * CSS の動きが おわるのを待つ。決まった時間は 待たない。
 */
export async function settleForShot(page: Page): Promise<void> {
  await waitFrames(page, 2);
  await waitAnimationsDone(page);
}

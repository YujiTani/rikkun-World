import type { Page } from '@playwright/test';
import { openAnimals } from './animals';

/**
 * LIVE-3（お肉）の E2E の準備（docs/design/LIVE-3.md §6・§6.1）。`openAnimals(page)` の あとに ページの 中で `window.__L` として 使う。
 *
 *   __L.farm(n?, o?)       床・小屋 1 つ（既定 (20,20)）・そだてた 大人 n わ（`raised` true）。{ cid, c, f, ids }
 *   __L.stand(c, f)        もん と 反対がわ の さく を 外から ねらう（LIVE-2 の あつめる と 同じ 場所）。ねらえたら true
 *   __L.rc(c, f)           stand ＋ 右クリック 1 回（押して はなす。2 ステップ）
 *   __L.menu()             `ui.coopMenu()`
 *   __L.press(b, id?)      `ui.coopMenuPress(b, id)`
 *   __L.choose(c, f, id)   右クリック → おにく に する → カード → いただきます（押した ステップ が 0 ステップ目）。メニューの 状態を 返す
 *   __L.go(n)              n ステップ 進める（1 ステップごとに 音 の 記録を ためる。`__L.snd`）
 *   __L.snd                ためた 音の 名前
 *   __L.panel()            メニュー の DOM（`[data-testid="coop-menu"]`）。無ければ null
 *   __L.text(sel)          その DOM の 文字・ルビ の 外の 漢字・行の 数・はみ出し
 *   __L.fill()             持ち物 を ぜんぶ ふさぐ
 *   __L.hp(n)              体力 を n に する
 *
 * 約束（仕様 §6.1 に DOM の 名前が 無い ので テスト が 決めた。開発は これに そろえる）:
 *   メニュー の 外わく `[data-testid="coop-menu"]`・右上 の × `[data-testid="coop-close"]`・ページ 2 の カード `[data-testid="coop-card"]`
 *   演出 の 一言 `#itadakimasu`（試作 の まま）
 *
 * 数え方: 「押した ステップ」＝ 0 ステップ目（ボタン を 押した 直後。`step` を 呼ぶ 前）。`go(n)` の あとが n ステップ目。
 */
export async function openLive3(page: Page, query = '?nosave=1'): Promise<void> {
  await openAnimals(page, query);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const A = (window as any).__A;
    const L: any = {
      snd: [] as string[],
      farm(n = 1, o: any = {}) {
        A.base(o.half ?? 40);
        const cid = A.coop(o.x ?? 20, o.z ?? 20);
        const c = A.cinfo(cid);
        const ids: number[] = [];
        for (let i = 0; i < n; i++) {
          const opts: any = { stage: 'adult', raised: true };
          if (o.macho?.includes(i)) opts.breed = 'macho';
          ids.push(A.kid(c, opts, (i % 3) - 1, Math.floor(i / 3) - 1 || 1));
        }
        return { cid, c, f: A.face(c), ids };
      },
      stand(c: any, f: any) {
        h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
        h.step(2);
        return A.aimBlock(c.x - f.fx * 2, c.y, c.z - f.fz * 2);
      },
      rc(c: any, f: any) {
        const aimed = L.stand(c, f);
        h.animals.events();
        A.tap();
        return aimed;
      },
      menu() {
        return h.ui.coopMenu();
      },
      press(b: string, id?: number) {
        return h.ui.coopMenuPress(b, id);
      },
      choose(c: any, f: any, id: number) {
        L.rc(c, f);
        L.press('meat');
        L.press('card', id);
        h.animals.events();
        h.audio.sfx();
        L.snd = [];
        L.press('ok');
        return L.menu();
      },
      go(n: number) {
        for (let i = 0; i < n; i++) {
          h.step(1);
          for (const s of A.sfx()) L.snd.push(s);
        }
      },
      fill() {
        const n = h.inventory.get().slots.length;
        for (let i = 0; i < n; i++) h.inventory.setSlot(i, { item: 'stone', count: 64 });
        h.step(1);
      },
      hp(n: number) {
        h.combat.setHp(n);
        h.step(1);
      },
      /** 1 ステップ ごとに `fn` を 呼びながら n ステップ 進める */
      each(n: number, fn: (i: number) => void) {
        for (let i = 1; i <= n; i++) {
          h.step(1);
          for (const s of A.sfx()) L.snd.push(s);
          fn(i);
        }
      },
      panel() {
        const el = document.querySelector('[data-testid="coop-menu"]') as HTMLElement | null;
        if (!el) return null;
        const rc = (e: Element) => {
          const q = e.getBoundingClientRect();
          return { l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width, h: q.height };
        };
        const buttons = Array.from(el.querySelectorAll('button'))
          .filter((b) => !b.matches('[data-testid="coop-close"]') && (b as HTMLElement).offsetParent !== null)
          .map((b) => ({ text: (b as HTMLElement).innerText.replace(/\s+/g, ''), ...rc(b), fs: parseFloat(getComputedStyle(b).fontSize), disabled: (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true' }));
        const cards = Array.from(el.querySelectorAll('[data-testid="coop-card"]')).map((c) => rc(c));
        return {
          text: el.innerText.replace(/\s+/g, ''),
          bare: L.bare(el),
          panel: rc(el),
          vw: innerWidth,
          vh: innerHeight,
          scrollX: el.scrollWidth - el.clientWidth,
          scrollY: el.scrollHeight - el.clientHeight,
          buttons,
          cards,
          lines: L.lines(el),
        };
      },
      /** ルビ の 外 に ある 漢字 の 文字列 */
      bare(root: Element) {
        const out: string[] = [];
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = w.nextNode())) if (/[一-鿿]/.test(n.textContent ?? '') && !n.parentElement?.closest('ruby')) out.push(n.textContent!);
        return out;
      },
      /** 文字の 箱 の 上の 位置が はなれて いる 数（ふりがな rt は のぞく）で 行を 数える */
      lines(el: Element) {
        const cs = getComputedStyle(el);
        const tops: number[] = [];
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = tw.nextNode())) {
          if (!(n.textContent ?? '').trim() || n.parentElement?.closest('rt')) continue;
          const rg = document.createRange();
          rg.selectNodeContents(n);
          for (const r of Array.from(rg.getClientRects())) if (r.width > 0) tops.push(r.top);
        }
        tops.sort((x, y) => x - y);
        const gap = parseFloat(cs.fontSize) * 0.6;
        let lines = tops.length ? 1 : 0;
        for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > gap) lines++;
        return lines;
      },
      /** セレクタ の 要素 の 文字・漢字・行・はみ出し */
      text(sel: string) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el || el.hidden) return null;
        const q = el.getBoundingClientRect();
        return {
          text: el.innerText.replace(/\s+/g, ''),
          bare: L.bare(el),
          lines: L.lines(el),
          over: Math.max(0, q.right - innerWidth, q.bottom - innerHeight, -q.left, -q.top),
          pe: getComputedStyle(el).pointerEvents,
        };
      },
    };
    (window as any).__L = L;
  });
}

/** 画面に 出して は いけない 言葉（仕様 §3.1） */
export const BAD_WORDS = ['ころす', 'しぬ', 'しめる', '小屋', '子', '大人', '肉'] as const;

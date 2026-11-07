import type { Page } from '@playwright/test';
import { NINJA_GEAR, SAMURAI_GEAR } from '../../src/craft/config';
import { findUnrubiedKanji } from '../../src/ui/text';
import { openDuoHud, setFakePad, installFakePads, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 4a（docs/design/COOP-1.md §3.3・§9.8・§12.0、AC75・AC76・AC81）: 2 人用 もちもの・クラフト画面の E2E／UI 検査の 部品。実装の 前に 書いた。
 *
 * ---- 開発への つなぎ目の 約束（目印は 仕様 §12.0 の とおり。ここでは E2E が 頼る 所だけ）----
 *   duo-inv-p1 / duo-inv-p2     2 人用の 画面の ルート。`data-layout="duo"`・`data-page`（items・craft・furnace・tansu）。1P の 物は `#inventory-screen` と 同じ 要素。
 *   duo-inv-tab-items / -craft  上の タブ（ボタン。高さ 56 以上）。duo-inv-close = ✕（56×56 以上）。duo-quit = 2P の「ながおし で やめる」（高さ 56 以上）。
 *   data-pad-focus="true"       2P の えらんでいる 物（2P の パネルの 中に ちょうど 1 つ）。`duo.inv(2).focus` と 同じ 物。
 *   `.inv-slot[data-index]`（もちものの マス）・`.cp-tile[data-id]`（レシピ）・`.cp-detail .cp-press`（つくる ボタン）は 1 人の 全面と 同じ 目印・class。
 *   `duo.sample(who)`（新しい 口・`?duo=dev` だけ）: その 人の もちものを 見本で いっぱいに する（2 人用 画面の「いちばん 多い とき」を UI 検査で 見る ため）。→ 仕様 §12.0 に 足す。
 *   COOP-1 4b（1.10 §12.0）: `duo.equip(who, head, body, arms?, legs?)`（`?duo=dev` だけ）と `duo.armor(who)`（その 人の ArmorSnapshot。2P が いなければ who 2 は null）。
 *   2 人用 画面の「もちもの」ページには そうびの マス 4 つ（`.equip-slot[data-slot]`。1P と 同じ EquipPanel）が 見え、着ている 物は `data-item` が つく。
 *   パッドの ボタン（standard）: 下 0 = confirm・右 1 = closeMenu・左 2 = もちもの画面を 開く（2P）・十字 12 上・13 下・14 左・15 右。
 */

export const PAD = { confirm: 0, close: 1, inventory: 2, up: 12, down: 13, left: 14, right: 15 } as const;
export type PadDir = 'up' | 'down' | 'left' | 'right';

export interface InvSnap {
  open: boolean;
  page: 'items' | 'craft' | 'furnace' | 'tansu' | null;
  focus: string | null;
}

export const invOf = (page: Page, who: 1 | 2): Promise<InvSnap> => page.evaluate((who) => (window as any).__rikkun.duo.inv(who) as InvSnap, who);
export const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

/** 偽パッドの ボタンを 1 回 押して はなす（押している 3 ステップ ＋ はなして 3 ステップ） */
export async function tapPad(page: Page, index: number, button: number): Promise<void> {
  await setFakePad(page, index, { buttons: [button] });
  await stepN(page, 3);
  await setFakePad(page, index, {});
  await stepN(page, 3);
}

/** 1P の キー（E）で もちもの画面を ひらく／とじる（`toggleInventory`） */
export async function tapE(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
    h.step(3);
  });
}

/** 目印の 名前（`duo.inv(who).focus` の 名前）から 2P の パネルの 中の 要素を さがす 手がかり */
function selectorOf(goal: string): string {
  if (goal.startsWith('tab:')) return `[data-testid="duo-inv-tab-${goal.slice(4)}"]`;
  if (goal.startsWith('tile:')) return `.cp-tile[data-id="${goal.slice(5)}"]`;
  if (goal.startsWith('slot:')) return `.inv-slot[data-index="${goal.slice(5)}"]`;
  if (goal === 'craft') return '.cp-detail .cp-press';
  if (goal === 'quit') return '[data-testid="duo-quit"]';
  if (goal === 'close') return '[data-testid="duo-inv-close"]';
  throw new Error(`知らない 目印: ${goal}`);
}

/**
 * 2P の パッドの 十字だけで、2P の えらびを goal まで 動かす（`duo.inv(2).focus` が goal に なるまで）。
 * 向きは 今の えらびと 行き先の 画面の 位置から きめる（角度・座標を 決め打ちしない）。1 回 押して 動かなければ もう 1 つの 軸を ためす。
 */
export async function padSteer(page: Page, goal: string, index = 1): Promise<void> {
  const sel = selectorOf(goal);
  for (let n = 0; n < 40; n++) {
    const focus = (await invOf(page, 2)).focus;
    if (focus === goal) return;
    const d = await page.evaluate((sel) => {
      const root = document.querySelector('[data-testid="duo-inv-p2"]');
      const to = root?.querySelector(sel)?.getBoundingClientRect();
      const from = root?.querySelector('[data-pad-focus="true"]')?.getBoundingClientRect();
      if (!to || !from) return null;
      return { dx: to.left + to.width / 2 - (from.left + from.width / 2), dy: to.top + to.height / 2 - (from.top + from.height / 2) };
    }, sel);
    if (!d) throw new Error(`2P の えらびか 行き先（${goal}）が 見つからない`);
    const horiz: PadDir = d.dx < 0 ? 'left' : 'right';
    const vert: PadDir = d.dy < 0 ? 'up' : 'down';
    const order: PadDir[] = Math.abs(d.dx) >= Math.abs(d.dy) ? [horiz, vert] : [vert, horiz];
    let moved = false;
    for (const dir of order) {
      await tapPad(page, index, PAD[dir]);
      if ((await invOf(page, 2)).focus !== focus) {
        moved = true;
        break;
      }
    }
    if (!moved) throw new Error(`十字で ${focus} から ${goal} へ 行けない`);
  }
  throw new Error(`40 回 押しても ${goal} に 着かない`);
}

// ---------------------------------------------------------------------------------------------
// UI 検査（AC81）: 2 人とも 開いた 画面

export type InvScreenPage = 'items' | 'craft';

/**
 * 2 人とも もちもの画面を 開いた 画面を 出す（いちばん 多い とき: 見本で いっぱい・お知らせと メーターが 出ている）。
 * 1P は E、2P は パッド。page = 'craft' なら 1P は タブを クリック、2P は 十字と confirm で「つくる」の ページに する。
 */
export async function openDuoInv(page: Page, which: InvScreenPage): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  // いちばん 多い とき: そうびも 4 マス ぜんぶ 着せる（4b。名前の 長い 侍・忍びの 装備）。1P は 忍び、2P は 侍
  await page.evaluate(
    ({ g1, g2 }) => {
      const h = (window as any).__rikkun;
      h.duo.sample(1);
      h.duo.sample(2);
      h.duo.equip(1, g1.head, g1.body, g1.arms, g1.legs);
      h.duo.equip(2, g2.head, g2.body, g2.arms, g2.legs);
      h.step(2);
    },
    { g1: NINJA_GEAR, g2: SAMURAI_GEAR },
  );
  await tapE(page);
  await tapPad(page, 1, PAD.inventory);
  if (which === 'craft') {
    await page.getByTestId('duo-inv-p1').getByTestId('duo-inv-tab-craft').click();
    await padSteer(page, 'tab:craft');
    await tapPad(page, 1, PAD.confirm);
  }
  await stepN(page, 6);
}

interface PanelInfo {
  who: 1 | 2;
  box: { l: number; t: number; r: number; b: number } | null;
  layout: string | null;
  page: string | null;
  html: string;
  scrollOverflow: boolean;
  transformed: string[];
  slots: number[];
  buttons: Array<{ id: string; w: number; h: number }>;
  tabFont: number[];
  tileColumns: number;
  hasHud: string[];
  /** そうびの マス（`.equip-slot`）。見える 物の はばと、着ている 物の 絵（data-item）の あるなし */
  equip: Array<{ slot: string; w: number; filled: boolean }>;
}

/**
 * AC81 の 検査: 1024×700・1280×800・1440×900 の どれでも、2 人とも 開いた 画面が その人の 半分の 中（§9.8）に 入り、はみ出さない・重ならない・ちぢめない。
 * 空 = 合格。見つけた くずれを 返す。
 */
export async function duoInvIssues(page: Page, which: InvScreenPage): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const small = vw <= 1100; // 1024（マス 47.6・レシピ 3 列）。1280・1440 は マス 56 以上・レシピ 4 列
  const info: PanelInfo[] = await page.evaluate((which) => {
    const read = (who: 1 | 2): PanelInfo => {
      const root = document.querySelector<HTMLElement>(`[data-testid="duo-inv-p${who}"]`);
      const empty: PanelInfo = { who, box: null, layout: null, page: null, html: '', scrollOverflow: false, transformed: [], slots: [], buttons: [], tabFont: [], tileColumns: 0, hasHud: [], equip: [] };
      if (!root) return empty;
      const r = root.getBoundingClientRect();
      const visible = (e: Element) => {
        const b = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const transformed: string[] = [];
      for (const e of [root, ...Array.from(root.children), ...Array.from(root.children).flatMap((c) => Array.from(c.children))]) {
        const t = getComputedStyle(e).transform;
        const m = /^matrix\(([^,]+),/.exec(t);
        if (t !== 'none' && m && Math.abs(Number(m[1]) - 1) > 0.001) transformed.push(`${(e as HTMLElement).className || e.tagName}: ${t}`);
      }
      const frame = (root.querySelector('.inv-frame') as HTMLElement | null) ?? (root.firstElementChild as HTMLElement | null) ?? root;
      const slots = Array.from(root.querySelectorAll<HTMLElement>('.inv-slot[data-index]')).filter(visible).map((e) => e.getBoundingClientRect().width);
      const btnSel = ['[data-testid^="duo-inv-tab-"]', '[data-testid="duo-inv-close"]', '[data-testid="duo-quit"]', ...(which === 'craft' ? ['.cp-detail .cp-press'] : [])].join(',');
      const buttons = Array.from(root.querySelectorAll<HTMLElement>(btnSel)).filter(visible).map((e) => ({ id: e.getAttribute('data-testid') ?? e.className, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }));
      const tabFont = Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="duo-inv-tab-"]')).filter(visible).map((e) => parseFloat(getComputedStyle(e).fontSize));
      const lefts = new Set(Array.from(root.querySelectorAll<HTMLElement>('.cp-tile')).filter(visible).map((e) => Math.round(e.getBoundingClientRect().left)));
      const hud = ['duo-hotbar-p', 'duo-hearts-p', 'duo-levelbar-p'].flatMap((p) => [1, 2].map((n) => `${p}${n}`));
      const hasHud = hud.filter((id) => {
        const e = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        if (!e || !visible(e)) return false;
        const b = e.getBoundingClientRect();
        return b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom;
      });
      const equip = Array.from(root.querySelectorAll<HTMLElement>('.equip-slot')).filter(visible).map((e) => ({ slot: e.dataset.slot ?? '', w: e.getBoundingClientRect().width, filled: !!e.dataset.item }));
      return {
        who,
        box: { l: r.left, t: r.top, r: r.right, b: r.bottom },
        layout: root.getAttribute('data-layout'),
        page: root.getAttribute('data-page'),
        html: root.innerHTML,
        scrollOverflow: frame.scrollWidth > frame.clientWidth + 1 || frame.scrollHeight > frame.clientHeight + 1,
        transformed,
        slots,
        buttons,
        tabFont,
        tileColumns: lefts.size,
        hasHud,
        equip,
      };
    };
    return [read(1), read(2)];
  }, which);

  const keepOut = ['[data-testid="duo-meter"]', '[data-testid="duo-split-line"]', '#clock'];
  for (const p of info) {
    const name = `duo-inv-p${p.who}`;
    if (!p.box) {
      add('missing', name, `${name} が 見えない`);
      continue;
    }
    if (p.layout !== 'duo') add('layout', name, `data-layout が duo でない（${p.layout}）`);
    if (p.page !== which) add('layout', name, `data-page が ${which} でない（${p.page}）`);
    // その人の 半分の 中（左右 8px・まん中の 線 4px のふちから 8px。§9.8）
    const lo = p.who === 1 ? 7.5 : vw / 2 + 2 + 7.5;
    const hi = p.who === 1 ? vw / 2 - 2 - 7.5 : vw - 7.5;
    if (p.box.l < lo - 0.5 || p.box.r > hi + 0.5) add('place', name, `半分の 置き場（${lo.toFixed(1)}〜${hi.toFixed(1)}）から はみ出す（${p.box.l.toFixed(1)}〜${p.box.r.toFixed(1)}）`);
    if (p.box.t < vh * 0.12 - 1) add('place', name, `上 12%（メーター・お知らせ）に かかる（上 ${p.box.t.toFixed(1)} < ${(vh * 0.12).toFixed(1)}）`);
    if (p.box.b > vh - 8 + 0.5) add('place', name, `下 8px の あきを こえる（下 ${p.box.b.toFixed(1)}）`);
    if (p.scrollOverflow) add('scroll', name, 'パネルぜんたいが スクロールする（スクロールは レシピ・たんすの 中だけ）');
    for (const t of p.transformed) add('shrink', name, `ちぢめている（transform ${t}）`);
    // マス・ボタン・字
    const minSlot = small ? 47.5 : 55.5;
    for (const w of p.slots) if (w < minSlot) add('size', name, `マスの はば ${w.toFixed(1)} が ${minSlot} より 小さい`);
    for (const b of p.buttons) if (b.h < 55.5) add('size', name, `${b.id} の 高さ ${b.h.toFixed(1)} が 56 より 小さい`);
    for (const b of p.buttons) if (b.id === 'duo-inv-close' && b.w < 55.5) add('size', name, `✕ の はば ${b.w.toFixed(1)} が 56 より 小さい`);
    for (const f of p.tabFont) if (f < 15.9) add('font', name, `タブの 字 ${f}px が 16px より 小さい`);
    if (which === 'items') {
      // 4b（AC83）: 2 人とも「もちもの」に そうびの マス 4 つが 見え、着せた 4 つの 絵が 出る。マスの 大きさは もちものの マスと 同じ 下限
      const worn: Record<string, unknown> | null = await page.evaluate((who) => (window as any).__rikkun.duo.armor(who), p.who);
      const wornCount = worn ? (['head', 'body', 'arms', 'legs'] as const).filter((k) => worn[k] != null).length : 0;
      if (wornCount !== 4) add('layout', name, `duo.armor(${p.who}) に 着せた 4 つが 入っていない（${wornCount}）`);
      if (p.equip.length !== 4) add('missing', name, `そうびの マスが 4 つ 見えない（${p.equip.length}）`);
      for (const e of p.equip) if (e.w < minSlot) add('size', name, `そうびの マス ${e.slot} の はば ${e.w.toFixed(1)} が ${minSlot} より 小さい`);
      const filled = p.equip.filter((e) => e.filled).length;
      if (filled !== wornCount) add('layout', name, `着ている ${wornCount} つの うち 絵が 出ている マスは ${filled}`);
    }
    if (which === 'craft') {
      const want = small ? 3 : 4;
      if (p.tileColumns !== want) add('layout', name, `レシピの 列が ${p.tileColumns}（${want} 列の はず）`);
    }
    if (p.hasHud.length > 0) add('overlap', name, `ホットバー・ハート・レベルの 棒に かかる／出たまま: ${p.hasHud.join(', ')}`);
    // 漢字は ふりがな
    const bad = findUnrubiedKanji(p.html);
    if (bad.length > 0) add('kanji', name, `ふりがなの ない 漢字: ${bad.join(' ')}`);
    // メーター・まん中の 線に かからない
    for (const id of keepOut) {
      const o = await page.evaluate((sel) => {
        const e = document.querySelector<HTMLElement>(sel);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
      }, id);
      if (o && p.box.l < o.r && o.l < p.box.r && p.box.t < o.b && o.t < p.box.b) add('overlap', name, `${id} に かかる`);
    }
  }
  // 1P と 2P が 重ならない
  const [a, b] = info;
  if (a?.box && b?.box && a.box.l < b.box.r && b.box.l < a.box.r) add('overlap', 'duo-inv-p1', '1P と 2P の パネルが 重なる');
  // 矢印が 開いた パネルの 上に 出ない こと（AC87）は、2P を 遠くに 置く openDuoArrowPanel（duoArrowPanelIssues）が 見る。ここは 近い 場面で duo.arrow が いつも null なので 見ない
  return out;
}

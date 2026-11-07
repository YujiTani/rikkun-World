import { RepeatCounter } from './sliderRepeat';

export type FocusDir = 'up' | 'down' | 'left' | 'right';

export interface FocusBox {
  id: string;
  l: number;
  t: number;
  w: number;
  h: number;
  /** まとまり（data-focus-group）。同じ まとまりが 方向に あれば、そちらを 先に えらぶ */
  group?: string;
}

/** 矩形の中心から、方向にある一番近い項目。まとまりの中を先に、なければ全体から */
export function pickNext(boxes: readonly FocusBox[], current: string | null, dir: FocusDir): string | null {
  if (boxes.length === 0) return null;
  const cur = current ? boxes.find((b) => b.id === current) : undefined;
  if (!cur) return boxes[0]!.id;
  if (cur.group !== undefined) {
    const inGroup = pickFrom(boxes.filter((b) => b.group === cur.group), cur, dir);
    if (inGroup) return inGroup.id;
  }
  return (pickFrom(boxes, cur, dir) ?? cur).id;
}

/** 2 つの はば（始まり l・長さ w）の 重ならない 分。重なって いれば 0 */
function gap(l1: number, w1: number, l2: number, w2: number): number {
  return Math.max(0, l2 - (l1 + w1), l1 - (l2 + w2));
}

/** 同じ 点数の ときは 中心が 近い 物（COOP-1 4a。0.5px までは 同点） */
const TIE = 0.5;

function pickFrom(boxes: readonly FocusBox[], cur: FocusBox, dir: FocusDir): FocusBox | null {
  const cx = cur.l + cur.w / 2;
  const cy = cur.t + cur.h / 2;
  const horizontal = dir === 'left' || dir === 'right';
  let best: FocusBox | null = null;
  let bestScore = Infinity;
  let bestNear = Infinity;
  /** 同じ 行（たてが 重なる）の 左右だけを 見る 1 回目。なければ 今までの 決まりで もう 1 回 */
  for (let pass = horizontal ? 0 : 1; pass < 2 && !best; pass++) {
    for (const b of boxes) {
      if (b.id === cur.id) continue;
      const x = b.l + b.w / 2;
      const y = b.t + b.h / 2;
      const dx = x - cx;
      const dy = y - cy;
      if (dir === 'left' && dx >= -4) continue;
      if (dir === 'right' && dx <= 4) continue;
      if (dir === 'up' && dy >= -4) continue;
      if (dir === 'down' && dy <= 4) continue;
      const primary = horizontal ? Math.abs(dx) : Math.abs(dy);
      let secondary: number;
      if (horizontal) {
        const sameRow = gap(cur.t, cur.h, b.t, b.h) === 0;
        if (pass === 0) {
          if (!sameRow) continue;
          secondary = 0;
        } else {
          // 今までの 決まり。ただし 真上・真下に 重なる 物（はばの 広い ボタンと その 上の マス）は よこの 仲間では ないので 行かない
          if (gap(cur.l, cur.w, b.l, b.w) === 0) continue;
          secondary = Math.abs(dy);
          if (secondary > primary * 1.25 && secondary > 80) continue;
        }
      } else {
        // 上下: 横の ずれは 2 つの はばの 重ならない 分（はばの 広い ボタンへも まっすぐ 行ける）
        secondary = gap(cur.l, cur.w, b.l, b.w);
        if (secondary > primary * 1.25 && secondary > 80) continue;
      }
      const score = primary + secondary * 2;
      const near = horizontal ? Math.abs(dy) : Math.abs(dx);
      if (score < bestScore - TIE || (score <= bestScore + TIE && near < bestNear)) {
        bestScore = score;
        bestNear = near;
        best = b;
      }
    }
  }
  return best;
}

function visible(el: HTMLElement): boolean {
  if (el.closest('[hidden]')) return false;
  if (el.getAttribute('disabled') !== null) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function menuItems(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, [data-menu-item]')].filter(visible);
}

export function boxOf(el: HTMLElement, i: number): FocusBox {
  const r = el.getBoundingClientRect();
  const g = el.closest<HTMLElement>('[data-focus-group]');
  const box: FocusBox = { id: String(i), l: r.left, t: r.top, w: r.width, h: r.height };
  if (g) box.group = g.dataset.focusGroup || 'g';
  return box;
}

function currentIndex(items: HTMLElement[]): number {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return -1;
  const direct = items.indexOf(active);
  if (direct >= 0) return direct;
  return items.findIndex((el) => el.contains(active));
}

function moveFocus(root: ParentNode, dir: FocusDir): void {
  const items = menuItems(root);
  if (items.length === 0) return;
  const i = currentIndex(items);
  const boxes = items.map(boxOf);
  const next = pickNext(boxes, i >= 0 ? String(i) : null, dir);
  const n = next === null ? 0 : Number(next);
  items[n]?.focus();
}

function stepRange(input: HTMLInputElement, dir: 'left' | 'right'): void {
  const step = Number(input.dataset.padStep ?? input.step);
  const add = Number.isFinite(step) && step > 0 ? step : 0.1;
  const min = Number(input.min);
  const max = Number(input.max);
  const cur = Number(input.value);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 1;
  const v = Math.round(Math.min(hi, Math.max(lo, cur + (dir === 'right' ? add : -add))) * 1000) / 1000;
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** つまみの行では 左右で値を変える。それ以外はフォーカス移動 */
export function handleMenuDir(root: ParentNode, dir: FocusDir): void {
  const active = document.activeElement as HTMLElement | null;
  const row = active?.closest('[data-slider-row]') as HTMLElement | null;
  if (row && root.contains(row) && (dir === 'left' || dir === 'right')) {
    const input = row.querySelector<HTMLInputElement>('input[type="range"]');
    if (input) {
      stepRange(input, dir);
      return;
    }
  }
  moveFocus(root, dir);
}

/** 十字の 押しっぱなしで つまみを くりかえし 動かす（だんだん 速く）。回数の 計算は sliderRepeat.ts */
export class SliderRepeat {
  private counter = new RepeatCounter();
  reset(): void {
    this.counter.reset();
  }
  /** 押しっぱなしの 間 毎ステップ 呼ぶ。つまみの 行に いないときは 何もしない */
  tick(root: ParentNode, dir: 'left' | 'right', dt: number): void {
    const active = document.activeElement as HTMLElement | null;
    const row = active?.closest('[data-slider-row]') as HTMLElement | null;
    const input = row && root.contains(row) ? row.querySelector<HTMLInputElement>('input[type="range"]') : null;
    if (!input) {
      this.reset();
      return;
    }
    for (let n = this.counter.step(dt); n > 0; n--) stepRange(input, dir);
  }
}

export function clickFocused(root: ParentNode): void {
  const items = menuItems(root);
  if (items.length === 0) return;
  const i = currentIndex(items);
  if (i >= 0) items[i]!.click();
  else items[0]!.focus();
}

/** 今 操作するメニュー。上に乗っている確認を優先する */
export function activeMenuRoot(): HTMLElement | null {
  const pick = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
  const dialogs = ['[data-testid="return-title-dialog"]', '[data-testid="reset-binds-dialog"]'];
  for (const sel of dialogs) {
    const el = pick(sel);
    if (el && !el.hidden) return el;
  }
  const settings = pick('[data-testid="settings-panel"]');
  if (settings && !settings.hidden) return settings;
  const inv = document.getElementById('inventory-screen');
  if (inv && !inv.hidden) return inv;
  const book = pick('.bk-layer');
  if (book && book.offsetParent !== null) return book;
  const overlay = pick('.play-overlay');
  if (overlay && !overlay.hidden) return overlay;
  return null;
}

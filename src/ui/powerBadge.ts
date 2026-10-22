import type { ItemStack } from '../contracts';
import './powerBadge.css';

/**
 * WEAPON-7 PR3: 1 本ごとに つよさが ちがう 武器（虹）の マスに、つよさの 数を 右下に 小さく 出す。
 * 要素は 1 マスに 1 つ だけ 作って 使いまわす。
 */
const els = new WeakMap<HTMLElement, HTMLSpanElement>();

/** [最小, 最大] の つよさを もつ 武器で 1 本ごとの つよさが ない とき 出す 既定（`legendPowerOf`）。main が 入れる */
let powerFallback: ((item: string) => number | null) | null = null;
export function setPowerFallback(fn: ((item: string) => number | null) | null): void {
  powerFallback = fn;
}

export function paintPower(root: HTMLElement, stack: ItemStack | null): void {
  const p = stack && stack.count > 0 ? (typeof stack.power === 'number' ? stack.power : (powerFallback?.(stack.item) ?? null)) : null;
  let el = els.get(root);
  if (p === null) {
    el?.remove();
    delete root.dataset.power;
    return;
  }
  if (!el) {
    el = document.createElement('span');
    el.className = 'slot-power';
    el.setAttribute('aria-hidden', 'true');
    els.set(root, el);
  }
  if (el.parentElement !== root) root.append(el);
  const t = String(p);
  if (el.textContent !== t) el.textContent = t;
  root.dataset.power = t;
}

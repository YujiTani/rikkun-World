import type { ItemStack } from '../contracts';
import './powerBadge.css';

/**
 * WEAPON-7 PR3: 1 本ごとに つよさが ちがう 武器（虹）の マスに、つよさの 数を 右下に 小さく 出す。
 * 要素は 1 マスに 1 つ だけ 作って 使いまわす。
 */
const els = new WeakMap<HTMLElement, HTMLSpanElement>();

export function paintPower(root: HTMLElement, stack: ItemStack | null): void {
  const p = stack && stack.count > 0 && typeof stack.power === 'number' ? stack.power : null;
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

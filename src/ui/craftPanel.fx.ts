/** もちもの画面の「つくる」「やく」のちいさな DOM の道具（作る・ふるえる・飛ぶ・位置を測る） */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.append(e);
  return e;
}

/** ふるえる（Web Animations。使えない環境では何もしない） */
export function shake(e: HTMLElement): void {
  if (typeof e.animate !== 'function') return;
  e.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 220 },
  );
}

/** 画面の 2 点のあいだを絵が飛ぶ */
export function fly(icon: string, from: DOMRect, to: DOMRect, ms: number, parent: HTMLElement, shrink = 0.5): void {
  if (typeof parent.animate !== 'function') return;
  const img = el('img', 'craft-fly', parent);
  img.src = icon;
  img.alt = '';
  const a = img.animate(
    [
      { transform: `translate(${from.left + from.width / 2 - 16}px, ${from.top + from.height / 2 - 16}px) scale(1)`, opacity: 1 },
      { transform: `translate(${to.left + to.width / 2 - 16}px, ${to.top + to.height / 2 - 16}px) scale(${shrink})`, opacity: 0.9 },
    ],
    { duration: ms, easing: 'ease-in' },
  );
  a.onfinish = () => img.remove();
}

export const rectOf = (e: Element): Rect => {
  const r = e.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

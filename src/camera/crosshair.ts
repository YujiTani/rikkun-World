/** 画面中央の「＋」の印（DOM）。見下ろしのときは setVisible(false)。 */
export function createCrosshair(parent: HTMLElement): { el: HTMLElement; setVisible(v: boolean): void } {
  const el = document.createElement('div');
  el.id = 'crosshair';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:50%;top:50%;width:24px;height:24px;transform:translate(-50%,-50%);pointer-events:none;z-index:5;';
  const bar = (css: string) => {
    const b = document.createElement('div');
    b.style.cssText = `position:absolute;background:#fff;box-shadow:0 0 2px #000;${css}`;
    return b;
  };
  el.append(bar('left:11px;top:0;width:2px;height:24px;'), bar('top:11px;left:0;height:2px;width:24px;'));
  parent.appendChild(el);
  return {
    el,
    setVisible(v: boolean) {
      el.style.display = v ? '' : 'none';
    },
  };
}

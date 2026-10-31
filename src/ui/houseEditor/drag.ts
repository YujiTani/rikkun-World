// HOUSE-1B 見本を ドラッグ・wheel（トラックパッドの 2 本ゆびの スクロール）で まわす（AC50・AC57）と、さわる 前だけ 出る 手の 印「くるっ」。
// よこ 1 px ＝ 0.5°・たて 1 px ＝ 0.5° は 見本（house/preview/view.ts）が 受けもつ。ここは 画面の 出来事を 見本へ わたすだけ。
// 動きを へらす 設定でも ドラッグは できる（また 回り出すのが 無いだけ）。ドラッグ中に 見本の 外へ 出ても はなすまで まわせる（pointer capture）。
import type { Preview3D } from '../../house/preview/preview';
import { el } from './dom';
import { ICONS } from './icons';

/** wheel の deltaMode が 行・ページ の とき px に 直す 倍率（0 ＝ px） */
const WHEEL_PX = [1, 16, 400] as const;

/**
 * 見本の 穴 view に 手の 印を 足し、ドラッグ・wheel を つなぐ。手の 印は view に .is-touched が つくと 消える（EditorView が 見本の touched に あわせる）。
 * onPress ＝ 見本を 押した／wheel した とき（置いた 家具の えらびを はずす）。
 * 返す 関数 ＝ 進行中の ドラッグを 取りやめる（エディターを とじる とき。はなした のと 同じ 片づけ）
 */
export function bindDrag(view: HTMLElement, preview: () => Preview3D, onPress: () => void): () => void {
  const hint = el('div', 'ed-view__hint', ICONS.swipe);
  hint.dataset.testid = 'editor-hand-mark';
  hint.setAttribute('role', 'img');
  hint.setAttribute('aria-label', 'くるっ');
  hint.title = 'くるっ';
  view.append(hint);

  let id: number | null = null;
  let lx = 0;
  let ly = 0;
  view.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    onPress();
    if (!preview().press()) return;
    id = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
    view.classList.add('is-drag');
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* 取れなくても ドラッグは できる（見本の 外へ 出ると 止まる だけ） */
    }
  });
  /** ドラッグを おわる（はなした・取りやめ）。見本の 手を はなし、ポインターの つかみも ほどく */
  const finish = (): void => {
    const held = id;
    if (held === null) return;
    id = null;
    view.classList.remove('is-drag');
    preview().release();
    try {
      view.releasePointerCapture(held);
    } catch {
      /* もう はなれて いる */
    }
  };
  view.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    if (e.buttons === 0) return finish(); // はなした のを 受けとり そこねた（ウインドウの 外など）: 動かさず おわる
    preview().drag(e.clientX - lx, e.clientY - ly);
    lx = e.clientX;
    ly = e.clientY;
  });
  const end = (e: PointerEvent): void => {
    if (e.pointerId === id) finish();
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('lostpointercapture', end);
  // wheel（2 本ゆびの スクロール）: ページが うごかない ように とめる。(よこ ＋ たて) の 動きを よこの ドラッグと 同じに
  view.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      onPress();
      const k = WHEEL_PX[e.deltaMode] ?? 1;
      preview().wheel(e.deltaX * k, e.deltaY * k);
    },
    { passive: false },
  );
  return finish;
}

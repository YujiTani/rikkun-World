// HOUSE-1B 試作: 見本を ドラッグで まわす（マウス・トラックパッドの ドラッグ・ゆびの ドラッグ・2 本ゆびの スクロール）。
// よこ ＝ 家の まわりを まわる、たて ＝ 見おろす 角度。動きを へらす 設定でも きく（さわった 向きに すぐ かわる だけで、自動の 回りは しない）。
// さわる 前は 見本の すみに 小さな「手の しるし」（手が よこに ゆらゆら）を 出し、さわったら（押す・2 本ゆびの スクロール）消す。
import { el } from './dom';
import { ICONS } from './icons';
import type { Preview3D } from './preview';

/** 見本の 穴 view に 手の しるしを 足し、ドラッグを つなぐ。しるしは view に .is-touched が つくと 消える（はじめに もどす ときは untouch） */
export function bindDrag(view: HTMLElement, preview: Preview3D): void {
  view.append(el('div', 'ed-view__hint', ICONS.swipe));
  let id: number | null = null;
  let lx = 0;
  let ly = 0;
  view.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    view.classList.add('is-touched');
    id = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
    view.classList.add('is-drag');
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* 取れなくても ドラッグは できる（はみ出すと 止まる だけ） */
    }
  });
  view.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    preview.dragBy(e.clientX - lx, e.clientY - ly);
    lx = e.clientX;
    ly = e.clientY;
  });
  const end = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    id = null;
    view.classList.remove('is-drag');
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('lostpointercapture', end);
  // 2 本ゆびの スクロール（ページが うごかない ように とめる）。ふつうの 向き ＝ ゆびを うごかす 向きに 見本が うごく
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.classList.add('is-touched');
    const k = e.deltaMode === 1 ? 16 : 1;
    preview.dragBy(-e.deltaX * k, -e.deltaY * k);
  }, { passive: false });
}

/** 見本の しるしを また 出す（エディターを 開きなおした・ぜんぶ けした とき。見本の 向きも はじめに もどる） */
export function untouchViews(root: ParentNode): void {
  for (const v of root.querySelectorAll('.ed-view.is-touched')) v.classList.remove('is-touched');
}

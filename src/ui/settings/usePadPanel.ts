/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§3.2）: せっていの「つかう コントローラー」タブの 中身。
 * 決まりごと（待ち・＋ の 確認・光る）は PadPicker が 持つ。ここは 画面に 出すだけ。
 * パッドの 一覧・光る・＋ の 確認は DuoPadRouter.getPads と 同じ 所から 読む。
 */
import type { DuoPadRouter } from '../../input/gamepad/duoPads';
import { PadPicker, type PadButtonView, type PickCancel, type PickNotice } from './padPicker';
import './usePadPanel.css';

export interface UsePadPanel {
  readonly el: HTMLElement;
  /** タブが 見えている あいだだけ true にする（false にすると 待ちも やめる） */
  setActive(on: boolean): void;
  /** 固定ステップ 1 回ぶん（active = true）か、世界が 止まっている あいだの 経過 秒（active = false）。1P の パッドで 待ちを やめたら true（その 回は フォーカスを 動かさない） */
  pump(active: boolean, dt: number): boolean;
  /** 見た目だけ 直す（毎フレーム） */
  paint(): void;
  pending(): boolean;
  cancel(reason: PickCancel): void;
  notice(): PickNotice | null;
  isNone(): boolean;
}

const NOTICE_HELP: Record<PickNotice, string> = { decided: 'ui:useDecided', swapped: 'ui:useSwapped', timeout: 'ui:useTimeout' };
/** ヘルプ帯の 文の キー（お知らせが 出ている とき・0 本の とき・ふだん） */
export function useHelpKey(notice: PickNotice | null, none: boolean): string {
  return notice ? NOTICE_HELP[notice] : none ? 'ui:useNone' : 'ui:useIdle';
}

const WHO = [1, 2] as const;
const PLUS_SVG =
  '<svg class="up-plus" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor"/></svg>';

function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export function createUsePadPanel(router: DuoPadRouter, onChange: () => void): UsePadPanel {
  const picker = new PadPicker({
    getPads: () => router.getPads(),
    choice: () => router.effectiveChoice(),
    commit: (c) => void router.setChoice(c),
    padIndex: (who) => router.padIndex(who),
    setPicking: (i) => router.setPicking(i),
  });

  const el = document.createElement('div');
  el.className = 'up-root';
  el.dataset.testid = 'ctrl-panel-use';
  el.hidden = true;
  el.innerHTML =
    `<h3 class="up-head">だれが どれを つかう？</h3>` +
    `<div class="up-rows">` +
    WHO.map(
      (w) =>
        `<div class="up-row" data-who="${w}" data-testid="use-row-p${w}" data-help="ui:useRowP${w}">` +
        `<span class="up-badge" aria-hidden="true">${w}P</span><span class="up-tag" hidden></span><span class="up-btns"></span></div>`,
    ).join('') +
    `</div>` +
    `<div class="up-none" data-testid="use-none" hidden><p class="up-none-main">コントローラーを つないでね</p><p class="up-none-sub">つないだら ボタンを おしてね</p></div>` +
    `<p class="up-note" data-testid="use-note"></p>`;

  const rows = WHO.map((w) => el.querySelector<HTMLElement>(`[data-who="${w}"]`)!);
  const noneEl = el.querySelector<HTMLElement>('[data-testid="use-none"]')!;
  const rowsEl = el.querySelector<HTMLElement>('.up-rows')!;
  const noteEl = el.querySelector<HTMLElement>('[data-testid="use-note"]')!;
  const NOTE_IDLE = 'キーボードと マウスは いつも 1P だよ';
  let active = false;
  /** 今 ボタンを 作っている パッドの 番号(名前は 並びで きまるので 番号だけ くらべる) */
  const sigIdx: number[] = [];
  let sigValid = false;
  const tagEls: HTMLElement[] = [];
  const btnEls: HTMLElement[][] = [[], []];
  let lastNotice: PickNotice | null = null;
  let noteKey = '';

  const rebuild = (who: 1 | 2, views: readonly PadButtonView[]): void => {
    const box = rows[who - 1]!.querySelector<HTMLElement>('.up-btns')!;
    box.replaceChildren();
    btnEls[who - 1] = [];
    views.forEach((v, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'up-btn';
      b.dataset.testid = `use-p${who}-c${n + 1}`;
      b.dataset.padIndex = String(v.index);
      b.setAttribute('data-menu-item', '');
      b.innerHTML = `<span>${v.name}</span><span class="up-check" aria-hidden="true">✓</span>`;
      b.addEventListener('click', () => {
        picker.start(who, v.index);
        paint();
        onChange();
      });
      box.append(b);
      btnEls[who - 1]!.push(b);
    });
  };

  function paint(): void {
    if (!active) return;
    const none = picker.isNone();
    noneEl.hidden = !none;
    rowsEl.hidden = none;
    const first = picker.buttons(1);
    let changed = !sigValid || sigIdx.length !== first.length;
    for (let n = 0; !changed && n < first.length; n++) if (sigIdx[n] !== first[n]!.index) changed = true;
    if (changed) {
      sigIdx.length = first.length;
      first.forEach((v, n) => (sigIdx[n] = v.index));
      sigValid = true;
    }
    const pend = picker.pending();
    WHO.forEach((who, r) => {
      const views = picker.buttons(who);
      if (changed) rebuild(who, views);
      const row = rows[r]!;
      setAttr(row, 'data-waiting', pend && pend.who === who ? 'true' : null);
      const tag = tagEls[r] ?? (tagEls[r] = row.querySelector<HTMLElement>('.up-tag')!);
      const hasChosen = views.some((v) => v.chosen);
      const noPad = !hasChosen && router.effectiveChoice()[who === 1 ? 'p1' : 'p2'] === null;
      tag.hidden = !noPad;
      if (noPad) tag.textContent = who === 1 ? 'コントローラーなし（キーボードだけ）' : 'コントローラーなし';
      const btns = btnEls[r]!;
      views.forEach((v, n) => {
        const b = btns[n];
        if (!b) return;
        setAttr(b, 'aria-pressed', v.chosen ? 'true' : null);
        setAttr(b, 'data-pending', v.pending ? 'true' : null);
        setAttr(b, 'data-lit', v.lit ? 'true' : null);
        setAttr(b, 'data-lit-color', v.lit ? picker.litColor(v.index) : null);
      });
    });
    // 下の 1 行: ふだんの ひとこと と 待ちの 文を 入れかえる
    const key = pend ? `wait:${pend.who}:${pend.index}` : 'idle';
    if (key !== noteKey) {
      noteKey = key;
      if (pend) {
        const name = picker.buttons(pend.who).find((v) => v.index === pend.index)?.name ?? '';
        noteEl.innerHTML = `${PLUS_SVG}<span>${name} の ＋を おしてね</span>`;
        noteEl.dataset.who = String(pend.who);
      } else {
        noteEl.textContent = NOTE_IDLE;
        delete noteEl.dataset.who;
      }
    }
    if (picker.notice() !== lastNotice) {
      lastNotice = picker.notice();
      onChange();
    }
  }

  return {
    el,
    setActive(on) {
      if (on === active) return;
      if (!on) picker.cancel('mouse');
      active = on;
      el.hidden = !on;
      if (on) {
        sigValid = false;
        noteKey = '';
        paint();
      }
    },
    pump(isActive, dt) {
      if (!active) return false;
      if (isActive) picker.step();
      else picker.advanceTime(dt);
      paint();
      return picker.endedByPad();
    },
    paint,
    pending: () => picker.pending() !== null,
    cancel: (reason) => {
      picker.cancel(reason);
      paint();
    },
    notice: () => picker.notice(),
    isNone: () => picker.isNone(),
  };
}

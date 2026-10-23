// START-1: スタートメニューの 画面（HTML。仕様 §3）。動きは startModel.ts。ここは 描いて、押された ものを 渡すだけ。
// 漢字は 使わない（ひらがな・カタカナ・数字・絵文字）ので ruby() は いらない。
import './startMenu.css';
import { markUrl } from '../ui/medalArt';
import type { StrengthLevel } from '../yokai/stats';
import type { StartButton, StartModel, StartViewState } from './startModel';

export interface StartMenuView {
  /** startModel の onChange から 呼ぶ（画面を 合わせる） */
  render(): void;
  /** まどを 1 回 ゆらす（10 けた目） */
  shake(): void;
  /** 画面を 消す（キーの 受けつけも やめる） */
  close(): void;
}

const markImgs = (n: number, cls = 'sm-mk'): string =>
  Array.from({ length: n }, () => `<img class="${cls}" src="${markUrl('karakasa')}" alt="">`).join('');
const weightMarks = (n: number): string => `<span class="sm-w">${'✦'.repeat(n)}</span>`;
const LEVEL_MARKS: Record<StrengthLevel, number> = { easy: 1, normal: 2, hard: 3 };
const LEVEL_LABEL: Record<StrengthLevel, string> = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };

const DIGIT_ORDER = ['1', '2', '3', '4', '5', 'back', '6', '7', '8', '9', '0'] as const;

function faceImg(kind: 'girl' | 'boy'): string {
  // 公開ビルドは 相対パス（GitHub Pages）。読めないときは 絵を 消して 字だけ
  return `<img class="sm-face" src="./models/char/${kind}/face.png" alt="" onerror="this.style.display='none'">`;
}

export function mountStartMenu(model: () => StartModel, parent: HTMLElement = document.body): StartMenuView {
  const root = document.createElement('div');
  root.className = 'sm-root';
  const charRow = model().state().charRow; // ?char=block は キャラの 行を 作らない
  const keys = DIGIT_ORDER.map((k) => `<button type="button" class="sm-btn sm-key" data-testid="start-key-${k}" data-press="key-${k}">${k === 'back' ? '⌫' : k}</button>`).join('');
  root.innerHTML = `
<div class="sm-panel" data-testid="start-menu">
  <h1 class="sm-title">りっくんワールド</h1>
  <button type="button" class="sm-btn sm-main sm-card" data-testid="start-continue" data-press="continue" style="margin-top:16px">
    <span class="l"><span class="sm-ico">▶</span><span class="sm-ico">🏠</span><span>つづきから</span></span>
    <span class="r" data-r><span data-cont-seed>シード</span><span data-cont-marks></span></span>
  </button>
  <button type="button" class="sm-btn sm-begin" data-testid="start-new" data-press="new" style="margin-top:16px">
    <span class="sm-ico">✨</span><span>はじめから</span>
  </button>
  ${
    charRow
      ? `<div class="sm-row" style="margin-top:24px"><span class="sm-lab">キャラ</span>
    <button type="button" class="sm-btn" data-testid="start-char-girl" data-press="char-girl" aria-pressed="false" style="width:204px">${faceImg('girl')}<span>おんなのこ</span></button>
    <button type="button" class="sm-btn" data-testid="start-char-boy" data-press="char-boy" aria-pressed="false" style="width:204px">${faceImg('boy')}<span>おとこのこ</span></button>
  </div>`
      : ''
  }
  <div class="sm-row" style="margin-top:${charRow ? 16 : 24}px"><span class="sm-lab">おもさ</span>
    <button type="button" class="sm-btn" data-g="w" data-testid="start-weight-light" data-press="weight-light" aria-pressed="false">${weightMarks(1)}<span>かるい</span></button>
    <button type="button" class="sm-btn" data-g="w" data-testid="start-weight-normal" data-press="weight-normal" aria-pressed="false">${weightMarks(2)}<span>ふつう</span></button>
    <button type="button" class="sm-btn" data-g="w" data-testid="start-weight-fine" data-press="weight-fine" aria-pressed="false">${weightMarks(3)}<span>きれい</span></button>
  </div>
</div>
<div class="sm-panel" data-testid="start-new-screen" hidden>
  <h1 class="sm-head">あたらしい せかい</h1>
  <div class="sm-row" style="margin-top:16px"><span class="sm-lab">シード</span>
    <div class="sm-seed ph" data-testid="start-seed" data-seed>20261012</div>
    <button type="button" class="sm-btn" data-testid="start-random" data-press="random" style="min-width:172px"><span class="sm-ico">🎲</span><span>ランダム</span></button>
  </div>
  <div class="sm-pad" style="margin-top:12px">${keys}</div>
  <div class="sm-notice" data-testid="start-existing" data-existing style="margin-top:8px" hidden><span class="sm-ico" style="font-size:24px;width:auto">🏠</span><span>この シードの せかいは もう あるよ。つづきから あそぶよ</span></div>
  <div class="sm-row" style="margin-top:16px"><span class="sm-lab">つよさ</span>
    ${(['easy', 'normal', 'hard'] as const)
      .map((l) => `<button type="button" class="sm-btn" data-g="s" data-testid="start-strength-${l}" data-press="strength-${l}" aria-pressed="false">${markImgs(LEVEL_MARKS[l])}<span>${LEVEL_LABEL[l]}</span></button>`)
      .join('')}
  </div>
  <div class="sm-actions" style="margin-top:24px">
    <button type="button" class="sm-btn back" data-testid="start-back" data-press="back"><span class="sm-ico">◀</span><span>もどる</span></button>
    <button type="button" class="sm-btn sm-main" data-testid="start-go" data-press="go"><span class="sm-ico">▶</span><span>スタート</span></button>
  </div>
</div>`;
  parent.appendChild(root);

  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const p1 = q('[data-testid="start-menu"]');
  const p2 = q('[data-testid="start-new-screen"]');
  const btn = (id: string): HTMLButtonElement => q<HTMLButtonElement>(`[data-testid="${id}"]`);
  const seedEl = q('[data-seed]');
  const noticeEl = q('[data-existing]');
  const contR = q('[data-r]');
  const contSeed = q('[data-cont-seed]');
  const contMarks = q('[data-cont-marks]');
  let lastScreen: StartViewState['screen'] | null = null;
  let lastFocus: StartViewState['focus'] | null = null;
  let lastMarks = '';
  let closed = false;

  const setPressed = (id: string, on: boolean): void => btn(id).setAttribute('aria-pressed', String(on));

  function render(): void {
    if (closed) return;
    const s = model().state();
    p1.hidden = s.screen !== 'menu';
    p2.hidden = s.screen !== 'new';
    // 1 枚目
    const cont = btn('start-continue');
    cont.disabled = s.continue === null;
    if (s.continue) {
      contSeed.textContent = `シード ${s.continue.seed}`;
      const marks = `${s.continue.strength}`;
      if (marks !== lastMarks) {
        contMarks.innerHTML = markImgs(LEVEL_MARKS[s.continue.strength], 'sm-mk');
        lastMarks = marks;
      }
    }
    contR.hidden = s.continue === null;
    const nw = btn('start-new');
    nw.classList.toggle('sm-main', s.continue === null);
    nw.classList.toggle('sm-sub', s.continue !== null);
    if (charRow) {
      setPressed('start-char-girl', s.char === 'girl');
      setPressed('start-char-boy', s.char === 'boy');
    }
    setPressed('start-weight-light', s.weight === 'light');
    setPressed('start-weight-normal', s.weight === 'normal');
    setPressed('start-weight-fine', s.weight === 'fine');
    // 2 枚目
    seedEl.textContent = s.seedText === '' ? '20261012' : s.seedText;
    seedEl.classList.toggle('ph', s.seedText === '');
    noticeEl.hidden = !s.existing;
    for (const l of ['easy', 'normal', 'hard'] as const) {
      const b = btn(`start-strength-${l}`);
      b.setAttribute('aria-pressed', String(s.strength === l));
      b.disabled = s.strengthLocked;
    }
    btn('start-go').setAttribute('aria-disabled', String(s.existingChecking));
    // キーボードの 選択（フォーカス）
    if (s.screen !== lastScreen || s.focus !== lastFocus) {
      if (s.screen === 'menu') (s.focus === 'continue' && s.continue ? cont : nw).focus({ preventScroll: true });
      lastScreen = s.screen;
      lastFocus = s.focus;
    }
  }

  // クリック: 押せない 物（disabled）は 下の 要素に 落ちるので、場所で さがして 押した ことに する（dry）
  root.addEventListener('click', (e) => {
    const m = model();
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-press]');
    if (hit) {
      m.press(hit.dataset.press as StartButton);
      return;
    }
    for (const b of root.querySelectorAll<HTMLButtonElement>('button[disabled][data-press]')) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        m.press(b.dataset.press as StartButton);
        return;
      }
    }
  });

  const onKey = (e: KeyboardEvent): void => {
    if (closed || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key) || e.key === 'Backspace' || e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Enter は フォーカスの ある ボタンを 押す（Tab で 移した ときも）。数字・⌫ の ボタンでは スタートの 意味
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-press]');
      const press = target?.dataset.press as StartButton | undefined;
      if (e.key === 'Enter' && press && !press.startsWith('key-')) {
        const st = model().state();
        if (st.screen === 'menu' && st.checking) return; // 調べている あいだは Enter が きかない
        model().press(press);
        return;
      }
      model().key(e.key);
    }
  };
  window.addEventListener('keydown', onKey, true);

  render();
  return {
    render,
    shake() {
      seedEl.classList.remove('sm-shake');
      void seedEl.offsetWidth;
      seedEl.classList.add('sm-shake');
    },
    close() {
      closed = true;
      window.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
}

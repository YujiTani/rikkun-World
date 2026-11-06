/**
 * GAMEPAD-1: コントローラー確認・かんたん割り当て直し（ひらがな）。
 */
import type { GamepadReader } from '../../input/gamepad';
import type { Action } from '../../input/actions';
import type { PadFace } from '../../input/gamepad/mapping';
import './gamepadPanel.css';

const FACE_LABEL: Record<PadFace, string> = {
  faceBottom: 'した',
  faceRight: 'みぎ',
  faceLeft: 'ひだり',
  faceTop: 'うえ',
  l1: 'L',
  r1: 'R',
  l2: 'ZL',
  r2: 'ZR',
  select: '−',
  start: '＋',
  l3: 'L3',
  r3: 'R3',
  dpadUp: '↑',
  dpadDown: '↓',
  dpadLeft: '←',
  dpadRight: '→',
};

const REBINDABLE: PadFace[] = [
  'faceBottom', 'faceRight', 'faceLeft', 'faceTop', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'r3', 'dpadDown', 'dpadLeft',
];

export interface GamepadPanelUi {
  readonly el: HTMLDivElement;
  refresh(): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

export function createGamepadPanel(reader: GamepadReader, parent?: HTMLElement): GamepadPanelUi {
  const el = document.createElement('div');
  el.className = 'gp-root';
  // 開くボタンは「おと」列と同じ ss-open（UI ゲートの部品ルールに合わせる）
  el.innerHTML =
    `<button type="button" class="ss-open gp-open" data-testid="gamepad-open">ゲームパッド</button>` +
    `<div class="gp-panel" data-testid="gamepad-panel" hidden>` +
    `<p class="gp-title">ゲームパッドかくにん</p>` +
    `<div class="gp-row" data-testid="gp-id">つながってる: （なし）</div>` +
    `<div class="gp-row" data-testid="gp-map">mapping: —</div>` +
    `<div class="gp-row">ひだりスティック</div><div class="gp-bar" data-ax="lx"><i></i></div>` +
    `<div class="gp-row">みぎスティック</div><div class="gp-bar" data-ax="rx"><i></i></div>` +
    `<div class="gp-faces" data-testid="gp-faces"></div>` +
    `<div class="gp-btns">` +
    `<button type="button" data-testid="gp-calib">まんなかを おぼえる</button>` +
    `<button type="button" data-testid="gp-reset">もとにもどす</button>` +
    `<button type="button" data-testid="gp-close">とじる</button>` +
    `</div>` +
    `<p class="gp-row">わりあてなおし（おしてから ボタン）</p>` +
    `<div class="gp-btns" data-testid="gp-rebind"></div>` +
    `</div>`;
  const openBtnEl = el.querySelector<HTMLButtonElement>('.gp-open')!;
  const panelEl = el.querySelector<HTMLElement>('.gp-panel')!;
  // おとボタン列へ。なければ parent / body
  const ssButtons = document.querySelector('.ss-buttons');
  if (ssButtons) {
    ssButtons.appendChild(openBtnEl);
  } else {
    el.appendChild(openBtnEl);
    parent?.appendChild(el);
  }
  // パネルは body 直下（案内が隠れても確認画面を残せる）
  document.body.appendChild(panelEl);
  if (!ssButtons) {
    /* el already appended */
  } else if (parent) {
    parent.appendChild(el);
  }

  const panel = panelEl;
  const openBtn = openBtnEl;
  const idEl = panel.querySelector<HTMLElement>('[data-testid="gp-id"]')!;
  const mapEl = panel.querySelector<HTMLElement>('[data-testid="gp-map"]')!;
  const facesEl = panel.querySelector<HTMLElement>('[data-testid="gp-faces"]')!;
  const rebindEl = panel.querySelector<HTMLElement>('[data-testid="gp-rebind"]')!;
  let waiting: PadFace | null = null;
  let raf = 0;

  for (const face of REBINDABLE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = FACE_LABEL[face];
    b.dataset.face = face;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      waiting = face;
      b.textContent = `${FACE_LABEL[face]}…`;
    });
    rebindEl.appendChild(b);
  }

  const setOpen = (on: boolean): void => {
    panel.hidden = !on;
    if (on) tick();
    else if (raf) cancelAnimationFrame(raf);
  };

  const paintBar = (sel: string, v: number): void => {
    const bar = panel.querySelector<HTMLElement>(`.gp-bar[data-ax="${sel}"]`)!;
    const i = bar.querySelector('i')!;
    const a = Math.min(1, Math.abs(v));
    i.style.width = `${a * 100}%`;
    bar.classList.toggle('dead', a < 0.01);
  };

  const tick = (): void => {
    if (panel.hidden) return;
    const s = reader.snapshot();
    if (!s) {
      idEl.textContent = 'つながってる: （なし）';
      mapEl.textContent = 'mapping: —';
      facesEl.textContent = '';
    } else {
      idEl.textContent = `つながってる: ${s.id.slice(0, 80)}`;
      mapEl.textContent = `mapping: ${s.mapping || '（くう）'} / ひょう: ${s.kind}`;
      paintBar('lx', s.axes[0] ?? 0);
      paintBar('rx', s.axes[2] ?? 0);
      facesEl.innerHTML = '';
      for (const [f, on] of Object.entries(s.faces)) {
        const span = document.createElement('span');
        span.className = on ? 'on' : '';
        span.textContent = `${FACE_LABEL[f as PadFace] ?? f}${on ? ' ●' : ''}`;
        facesEl.appendChild(span);
      }
      if (waiting) {
        for (const [f, on] of Object.entries(s.faces)) {
          if (on) {
            const face = waiting;
            waiting = null;
            // いま押された論理面を「わりあてなおし対象」にマップし直すのは複雑なので、
            // 押された face の Action を waiting スロットへコピーするのではなく、
            // waiting に「この物理 face を使う」＝ binds[waiting] は変えず、
            // ユーザーが選んだ「やること」スロットに、押した face と同じ Action を付ける簡易版:
            // → 押した face の現 Action を、選んだ face に複製するのではなく、
            // 選んだ face (waiting) に、デフォルトのその face の Action を付け直すのは無意味。
            // 仕様: 「やること」を選んでからボタンを押す。UI は face ボタン＝やることスロット。
            // 押された物理 face を、そのやること（binds[waiting] の意味）に割り当てる =
            // 他の face から同じ Action を外し、pressed face に Action を付ける。
            const action = reader.getBinds()[face] ?? null;
            // Remap: whatever was on `face` action stays; we bind pressed physical `f` to that action
            // Simpler approach for kids: set binds[pressedFace] = previous action of waiting slot's purpose
            // Actually UI buttons are faces - click "ZR" then press a button to make that button do ZR's action.
            const purpose = action;
            if (purpose) {
              const binds = reader.getBinds();
              for (const [k, v] of Object.entries(binds)) {
                if (v === purpose) reader.setBind(k as PadFace, null);
              }
              reader.setBind(f as PadFace, purpose as Action);
              reader.persistBinds();
            }
            for (const btn of rebindEl.querySelectorAll('button')) {
              const ff = btn.getAttribute('data-face') as PadFace;
              btn.textContent = FACE_LABEL[ff];
            }
            break;
          }
        }
      }
    }
    raf = requestAnimationFrame(tick);
  };

  for (const ev of ['click', 'pointerdown', 'mousedown'] as const) {
    el.addEventListener(ev, (e) => e.stopPropagation());
  }
  openBtn.addEventListener('click', () => setOpen(panel.hidden));
  panel.querySelector('[data-testid="gp-close"]')!.addEventListener('click', () => setOpen(false));
  panel.querySelector('[data-testid="gp-reset"]')!.addEventListener('click', () => {
    reader.resetBinds();
    waiting = null;
  });
  panel.querySelector('[data-testid="gp-calib"]')!.addEventListener('click', () => {
    const s = reader.snapshot();
    if (!s) return;
    reader.calibrateFromAxes(s.axes[0] ?? 0, s.axes[1] ?? 0, s.axes[2] ?? 0, s.axes[3] ?? 0);
  });

  return {
    el,
    refresh: () => { /* tick paints */ },
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => !panel.hidden,
    dispose: () => {
      if (raf) cancelAnimationFrame(raf);
      openBtn.remove();
      panel.remove();
      el.remove();
    },
  };
}

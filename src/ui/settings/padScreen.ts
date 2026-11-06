/**
 * ゲームパッド専用画面。中央の図と、ボタンまでの線。割り当て直しは今までの決まり。
 */
import type { GamepadReader } from '../../input/gamepad';
import type { PadFace } from '../../input/gamepad/mapping';
import { PAD_FACES } from '../../input/gamepad/mapping';
import { assignFaceToAction } from '../../input/gamepad/rebind';
import type { Action } from '../../input/actions';
import { ruby } from '../text';
import { mountChoiceDialog, type DialogStack } from '../menu/choiceDialog';
import { labelOfAction } from './controlRows';
import { padSvg } from './padDiagram';
import './padScreen.css';

export interface PadScreen {
  readonly el: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  isCapturing(): boolean;
  cancelCapture(): void;
  pump(): void;
}

interface Capture {
  action: Action;
  face: PadFace;
  origin: 'pad' | 'pointer';
  seen: Partial<Record<PadFace, boolean>>;
}

/** 左列・右列。図の上から下の順（線が交差しないように） */
const LEFT: PadFace[] = ['l2', 'l1', 'select', 'dpadUp', 'dpadLeft', 'dpadDown', 'dpadRight'];
const RIGHT: PadFace[] = ['r2', 'r1', 'start', 'faceTop', 'faceLeft', 'faceRight', 'faceBottom', 'r3'];

export function createPadScreen(opts: {
  reader: GamepadReader;
  dialogs: DialogStack;
  onBack: () => void;
  /** みる はやさはせっていのカメラタブだけ。ここからはそこを開く */
  onCamera: () => void;
}): PadScreen {
  const el = document.createElement('div');
  el.className = 'pad-screen';
  el.dataset.testid = 'pad-screen';
  el.hidden = true;
  el.innerHTML =
    `<h2 class="set-title">ゲームパッド</h2>` +
    `<p class="pad-warn" data-testid="pad-unknown" hidden>この コントローラーは ボタンの ならびが わからないよ。この えは Switch の ならび。おした ボタンを、ここで きめられるよ。</p>` +
    `<div class="pad-capture" data-testid="bind-capture" hidden>` +
    `<span>ボタンを おしてね</span>` +
    `<button type="button" class="set-text-btn" data-testid="bind-cancel" data-menu-item>やめる</button>` +
    `</div>` +
    `<p class="set-note-line" data-testid="bind-note"></p>` +
    `<div class="pad-stage" data-testid="pad-stage">` +
    `<svg class="pad-wires" data-wires aria-hidden="true"></svg>` +
    `<div class="pad-col" data-col="left"></div>` +
    `<div class="pad-body">${padSvg()}</div>` +
    `<div class="pad-col" data-col="right"></div>` +
    `</div>` +
    `<div class="set-actions">` +
    `<button type="button" class="set-text-btn" data-testid="pad-to-camera" data-menu-item>カメラの はやさ</button>` +
    `</div>` +
    `<h3 class="set-h">${ruby('動作', 'どうさ')}${ruby('確認', 'かくにん')}</h3>` +
    `<section data-testid="settings-diag">` +
    `<div class="set-name" data-testid="gp-id"></div>` +
    `<div class="set-name" data-testid="gp-map"></div>` +
    `<div class="set-name" data-testid="gp-axes"></div>` +
    `<div class="set-name" data-testid="gp-buttons"></div>` +
    `<div class="set-slider" data-slider-row data-menu-item tabindex="0">` +
    `<span>あそび</span>` +
    `<input type="range" min="0.05" max="0.5" step="0.01" data-testid="dead-zone" aria-label="スティックの あそび">` +
    `<span class="set-num" data-testid="dead-value"></span>` +
    `</div>` +
    `<button type="button" class="set-text-btn" data-testid="gp-calib" data-menu-item>まんなかを おぼえる</button>` +
    `</section>` +
    `<div class="set-actions">` +
    `<button type="button" class="set-text-btn" data-testid="binds-reset" data-menu-item>もとにもどす</button>` +
    `<button type="button" class="set-text-btn" data-testid="pad-back" data-menu-item>せっていへ</button>` +
    `</div>`;

  const noteEl = el.querySelector<HTMLElement>('[data-testid="bind-note"]')!;
  const captureEl = el.querySelector<HTMLElement>('[data-testid="bind-capture"]')!;
  const unknownEl = el.querySelector<HTMLElement>('[data-testid="pad-unknown"]')!;
  const leftCol = el.querySelector<HTMLElement>('[data-col="left"]')!;
  const rightCol = el.querySelector<HTMLElement>('[data-col="right"]')!;
  const wires = el.querySelector<SVGSVGElement>('[data-wires]')!;
  const deadInput = el.querySelector<HTMLInputElement>('[data-testid="dead-zone"]')!;
  const deadValue = el.querySelector<HTMLElement>('[data-testid="dead-value"]')!;
  const idEl = el.querySelector<HTMLElement>('[data-testid="gp-id"]')!;
  const mapEl = el.querySelector<HTMLElement>('[data-testid="gp-map"]')!;
  const axesEl = el.querySelector<HTMLElement>('[data-testid="gp-axes"]')!;
  const btnEl = el.querySelector<HTMLElement>('[data-testid="gp-buttons"]')!;
  let capture: Capture | null = null;
  let picked: string | null = null;

  const resetDialog = mountChoiceDialog({
    testId: 'reset-binds-dialog',
    questionHtml: 'ボタンを はじめの 並びに もどす？',
    yesLabel: 'もどす',
    yesTestId: 'reset-yes',
    noTestId: 'reset-no',
    onYes: () => {
      opts.reader.resetBinds();
      resetDialog.close();
      noteEl.textContent = 'はじめの 並びに もどしたよ';
      paintCalls();
    },
  });
  opts.dialogs.add(resetDialog);

  const paintDead = (): void => {
    const v = opts.reader.getSettings().deadZone;
    if (Math.abs(Number(deadInput.value) - v) > 1e-9) deadInput.value = String(v);
    deadValue.textContent = v.toFixed(2);
  };

  const callButton = (face: PadFace | null, id: string, label: string, action: Action | null): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pad-call';
    b.dataset.menuItem = '';
    b.dataset.face = id;
    b.textContent = label;
    if (action) b.dataset.testid = `bind-${action}`;
    else b.dataset.testid = `pad-call-${id}`;
    if (capture?.face === id) b.classList.add('is-wait');
    if (picked === id) b.classList.add('is-pick');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      picked = id;
      paintHot();
      if (!action || !face) {
        noteEl.textContent = face ? 'この ボタンは あきだよ' : 'スティックは そのままだよ';
        paintCalls();
        return;
      }
      beginCapture(action, face, e.isTrusted ? 'pointer' : 'pad');
    });
    return b;
  };

  const paintCalls = (): void => {
    const binds = opts.reader.getBinds();
    leftCol.replaceChildren();
    rightCol.replaceChildren();
    const place = (face: PadFace, col: HTMLElement): void => {
      const action = binds[face] ?? null;
      const label = action ? labelOfAction(action) : 'あき';
      col.append(callButton(face, face, label, action));
    };
    for (const f of LEFT) {
      if (f === 'dpadUp') leftCol.append(callButton(null, 'stickL', 'あるく', null));
      place(f, leftCol);
    }
    for (const f of RIGHT) {
      if (f === 'r3') rightCol.append(callButton(null, 'stickR', 'みる', null));
      place(f, rightCol);
    }
    paintHot();
    requestAnimationFrame(paintLines);
  };

  const paintLines = (): void => {
    const stage = el.querySelector('.pad-stage')!.getBoundingClientRect();
    wires.setAttribute('viewBox', `0 0 ${stage.width} ${stage.height}`);
    wires.replaceChildren();
    if (stage.width < 8) return;
    for (const dot of el.querySelectorAll<SVGCircleElement>('[data-pad-dot]')) {
      const id = dot.dataset.padDot!;
      const call = el.querySelector<HTMLElement>(`.pad-call[data-face="${id}"]`);
      if (!call) continue;
      const a = call.getBoundingClientRect();
      const b = dot.getBoundingClientRect();
      const leftSide = a.left < stage.left + stage.width / 2;
      const x1 = (leftSide ? a.right : a.left) - stage.left;
      const y1 = a.top + a.height / 2 - stage.top;
      const x2 = b.left + b.width / 2 - stage.left;
      const y2 = b.top + b.height / 2 - stage.top;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', picked === id || capture?.face === id ? 'is-on' : '');
      wires.append(line);
    }
  };

  const paintHot = (): void => {
    const s = opts.reader.snapshot();
    for (const part of el.querySelectorAll<SVGElement>('[data-pad-face]')) {
      const id = part.dataset.padFace!;
      const down = !!(s && id in (s.faces) && s.faces[id as PadFace]);
      part.classList.toggle('is-hot', down);
      part.classList.toggle('is-pick', picked === id || capture?.face === id);
    }
    if (!s) {
      idEl.textContent = 'つながってる: （なし）';
      mapEl.textContent = 'mapping: —';
      axesEl.textContent = '';
      btnEl.textContent = '';
      unknownEl.hidden = true;
      return;
    }
    idEl.textContent = `つながってる: ${s.id.slice(0, 80)}`;
    mapEl.textContent = `mapping: ${s.mapping || '（くう）'} / ひょう: ${s.kind}`;
    axesEl.textContent = `じく: ${s.axes.map((n) => n.toFixed(2)).join(' ')}`;
    const pressed = PAD_FACES.filter((f) => s.faces[f]);
    btnEl.textContent = pressed.length ? `おしてる: ${pressed.join(' ')}` : 'おしてる: なし';
    unknownEl.hidden = s.kind !== 'fallback';
  };

  const beginCapture = (action: Action, face: PadFace, origin: 'pad' | 'pointer'): void => {
    const seen: Partial<Record<PadFace, boolean>> = {};
    if (origin === 'pad') {
      const s = opts.reader.snapshot();
      if (s) for (const f of PAD_FACES) seen[f] = !!s.faces[f];
    }
    capture = { action, face, origin, seen };
    picked = face;
    opts.reader.setCapturing(true);
    captureEl.hidden = false;
    noteEl.textContent = '';
    paintCalls();
  };

  const cancelCapture = (): void => {
    capture = null;
    opts.reader.setCapturing(false);
    captureEl.hidden = true;
    paintCalls();
  };

  const pollCapture = (): void => {
    if (!capture) return;
    const s = opts.reader.snapshot();
    if (!s) return;
    for (const f of PAD_FACES) {
      const on = !!s.faces[f];
      const was = !!capture.seen[f];
      capture.seen[f] = on;
      if (!on || was) continue;
      if (capture.origin === 'pad' && f === 'start') {
        cancelCapture();
        noteEl.textContent = 'やめたい';
        return;
      }
      const action = capture.action;
      const { displaced } = assignFaceToAction(opts.reader.getBinds(), f, action);
      opts.reader.setBind(f, action);
      opts.reader.persistBinds();
      noteEl.textContent = displaced ? `${labelOfAction(displaced)} の ボタンを つかったよ` : 'かえたよ';
      cancelCapture();
      return;
    }
  };

  deadInput.addEventListener('input', () => {
    opts.reader.setSettings({ deadZone: Number(deadInput.value) });
    paintDead();
  });
  el.querySelector('[data-testid="binds-reset"]')!.addEventListener('click', () => resetDialog.open());
  el.querySelector('[data-testid="bind-cancel"]')!.addEventListener('click', () => {
    cancelCapture();
    noteEl.textContent = 'やめたい';
  });
  el.querySelector('[data-testid="gp-calib"]')!.addEventListener('click', () => {
    const s = opts.reader.snapshot();
    if (!s) {
      noteEl.textContent = 'コントローラーが ないよ';
      return;
    }
    opts.reader.calibrateFromAxes(s.axes[0] ?? 0, s.axes[1] ?? 0, s.axes[2] ?? 0, s.axes[3] ?? 0);
    noteEl.textContent = 'まんなかを おぼえたよ';
  });
  el.querySelector('[data-testid="pad-back"]')!.addEventListener('click', () => {
    cancelCapture();
    el.hidden = true;
    opts.onBack();
  });
  el.querySelector('[data-testid="pad-to-camera"]')!.addEventListener('click', () => {
    cancelCapture();
    el.hidden = true;
    opts.onCamera();
  });

  return {
    el,
    open() {
      el.hidden = false;
      paintDead();
      paintCalls();
    },
    close() {
      cancelCapture();
      el.hidden = true;
    },
    isOpen: () => !el.hidden,
    isCapturing: () => capture !== null,
    cancelCapture,
    pump() {
      if (el.hidden) return;
      paintHot();
      pollCapture();
    },
  };
}

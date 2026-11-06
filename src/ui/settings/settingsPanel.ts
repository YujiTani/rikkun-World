/**
 * SETTINGS-1: そうさ・みる はやさ・おと・動作確認を 1 つの画面に置く。
 */
import type { GamepadReader } from '../../input/gamepad';
import { GAMEPAD_CONFIG } from '../../input/gamepad/config';
import type { PadFace } from '../../input/gamepad/mapping';
import { PAD_FACES } from '../../input/gamepad/mapping';
import { assignFaceToAction, facesForAction } from '../../input/gamepad/rebind';
import type { Action } from '../../input/actions';
import type { AudioSettings } from '../../fx/audioConfig';
import type { FxSettings } from '../../fx/config';
import { ruby } from '../text';
import { mountSoundKnobs } from '../soundSettings';
import { mountChoiceDialog, type DialogStack } from '../menu/choiceDialog';
import { CONTROL_ROWS, labelOfAction, rowKeys, type ControlRow } from './controlRows';
import { glyphHtml } from './glyphs';
import './settingsPanel.css';

export interface SettingsPanel {
  open(): void;
  close(): void;
  isOpen(): boolean;
  isCapturing(): boolean;
  cancelCapture(): void;
  refreshAudio(): void;
  /** ゲームのステップから呼ぶ（ボタン待ちを取りこぼさない） */
  pump(): void;
  dispose(): void;
}

interface Capture {
  action: Action;
  origin: 'pad' | 'pointer';
  seen: Partial<Record<PadFace, boolean>>;
}

export function createSettingsPanel(
  opts: {
    reader: GamepadReader;
    audio: AudioSettings;
    fx: Pick<FxSettings, 'fxVolume'>;
    onAudio: () => void;
    dialogs: DialogStack;
  },
  anchor?: HTMLElement,
): SettingsPanel {
  const root = document.createElement('div');
  root.className = 'set-root';
  root.dataset.testid = 'settings-panel';
  root.hidden = true;
  root.innerHTML =
    `<div class="set-scrim" data-testid="settings-scrim"></div>` +
    `<div class="set-panel" role="dialog" aria-label="せってい">` +
    `<h2 class="set-title">せってい</h2>` +
    `<h3 class="set-h">そうさ</h3>` +
    `<div class="set-capture" data-testid="bind-capture" hidden>` +
    `<span>ボタンを おしてね</span>` +
    `<button type="button" class="set-text-btn" data-testid="bind-cancel" data-menu-item>やめる</button>` +
    `</div>` +
    `<p class="set-note-line" data-testid="bind-note"></p>` +
    `<div class="set-table" data-testid="settings-controls"></div>` +
    `<div class="set-actions"><button type="button" class="set-text-btn" data-testid="binds-reset" data-menu-item>もとにもどす</button></div>` +
    `<h3 class="set-h">みる はやさ</h3>` +
    `<div class="set-slider" data-slider-row data-menu-item tabindex="0">` +
    `<span>おそい</span>` +
    `<input type="range" min="${GAMEPAD_CONFIG.lookMin}" max="${GAMEPAD_CONFIG.lookMax}" step="0.1" data-testid="look-speed" aria-label="みる はやさ">` +
    `<span>はやい</span>` +
    `<span class="set-num" data-testid="look-value"></span>` +
    `</div>` +
    `<button type="button" class="set-text-btn" data-testid="look-reset" data-menu-item>はやさを もとにもどす</button>` +
    `<h3 class="set-h">おと</h3>` +
    `<div data-testid="settings-sound"></div>` +
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
    `<div class="set-actions"><button type="button" class="set-text-btn" data-testid="settings-close" data-menu-item>とじる</button></div>` +
    `</div>`;
  document.body.appendChild(root);

  const table = root.querySelector<HTMLElement>('[data-testid="settings-controls"]')!;
  const captureEl = root.querySelector<HTMLElement>('[data-testid="bind-capture"]')!;
  const noteEl = root.querySelector<HTMLElement>('[data-testid="bind-note"]')!;
  const lookInput = root.querySelector<HTMLInputElement>('[data-testid="look-speed"]')!;
  const lookValue = root.querySelector<HTMLElement>('[data-testid="look-value"]')!;
  const deadInput = root.querySelector<HTMLInputElement>('[data-testid="dead-zone"]')!;
  const deadValue = root.querySelector<HTMLElement>('[data-testid="dead-value"]')!;
  const idEl = root.querySelector<HTMLElement>('[data-testid="gp-id"]')!;
  const mapEl = root.querySelector<HTMLElement>('[data-testid="gp-map"]')!;
  const axesEl = root.querySelector<HTMLElement>('[data-testid="gp-axes"]')!;
  const btnEl = root.querySelector<HTMLElement>('[data-testid="gp-buttons"]')!;
  const sound = mountSoundKnobs({ audio: opts.audio, fx: opts.fx, onChange: opts.onAudio }, root.querySelector('[data-testid="settings-sound"]')!);

  let capture: Capture | null = null;
  let raf = 0;

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
      paintRows();
    },
  });
  opts.dialogs.add(resetDialog);

  const stop = (e: Event): void => e.stopPropagation();
  root.addEventListener('pointerdown', stop);
  root.addEventListener('click', stop);

  const paintLook = (): void => {
    const v = opts.reader.getSettings().lookSensitivity;
    if (Math.abs(Number(lookInput.value) - v) > 1e-9) lookInput.value = String(v);
    lookValue.textContent = v.toFixed(1);
  };
  const paintDead = (): void => {
    const v = opts.reader.getSettings().deadZone;
    if (Math.abs(Number(deadInput.value) - v) > 1e-9) deadInput.value = String(v);
    deadValue.textContent = v.toFixed(2);
  };

  const paintRows = (): void => {
    const binds = opts.reader.getBinds();
    table.replaceChildren();
    const head = document.createElement('div');
    head.className = 'set-head';
    head.innerHTML = '<span>すること</span><span>キー・マウス</span><span>コントローラー</span>';
    table.append(head);
    let cat = '';
    for (const row of CONTROL_ROWS) {
      if (row.category !== cat) {
        cat = row.category;
        const h = document.createElement('div');
        h.className = 'set-cat';
        h.textContent = cat;
        table.append(h);
      }
      table.append(renderRow(row, binds));
    }
  };

  const renderRow = (row: ControlRow, binds: ReturnType<GamepadReader['getBinds']>): HTMLElement => {
    const line = document.createElement('div');
    line.className = 'set-line';
    const name = document.createElement('span');
    name.className = 'set-name';
    name.textContent = row.label;
    if (row.note) {
      const n = document.createElement('span');
      n.className = 'set-note';
      n.textContent = row.note;
      name.append(n);
    }
    const keys = document.createElement('span');
    keys.className = 'set-keys';
    keys.textContent = rowKeys(row);
    line.append(name, keys);
    if (row.rebind && row.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'set-bind';
      b.dataset.action = row.action;
      b.dataset.testid = `bind-${row.action}`;
      b.dataset.menuItem = '';
      const faces = facesForAction(binds, row.action);
      b.innerHTML = faces.length ? faces.map(glyphHtml).join('') : 'なし';
      if (capture?.action === row.action) b.classList.add('is-wait');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        beginCapture(row.action!, e.isTrusted ? 'pointer' : 'pad');
      });
      line.append(b);
    } else {
      const s = document.createElement('span');
      s.className = 'set-fixed';
      s.textContent = row.fixedPad ?? '—';
      line.append(s);
    }
    return line;
  };

  const beginCapture = (action: Action, origin: 'pad' | 'pointer'): void => {
    const seen: Partial<Record<PadFace, boolean>> = {};
    if (origin === 'pad') {
      const s = opts.reader.snapshot();
      if (s) for (const f of PAD_FACES) seen[f] = !!s.faces[f];
    }
    capture = { action, origin, seen };
    opts.reader.setCapturing(true);
    captureEl.hidden = false;
    noteEl.textContent = '';
    paintRows();
  };

  const cancelCapture = (): void => {
    capture = null;
    opts.reader.setCapturing(false);
    captureEl.hidden = true;
    paintRows();
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

  const paintDiag = (): void => {
    const s = opts.reader.snapshot();
    if (!s) {
      idEl.textContent = 'つながってる: （なし）';
      mapEl.textContent = 'mapping: —';
      axesEl.textContent = '';
      btnEl.textContent = '';
      return;
    }
    idEl.textContent = `つながってる: ${s.id.slice(0, 80)}`;
    mapEl.textContent = `mapping: ${s.mapping || '（くう）'} / ひょう: ${s.kind}`;
    const ax = s.axes.map((n) => n.toFixed(2)).join(' ');
    axesEl.textContent = `じく: ${ax}`;
    const pressed = PAD_FACES.filter((f) => s.faces[f]).map((f) => f);
    btnEl.textContent = pressed.length ? `おしてる: ${pressed.join(' ')}` : 'おしてる: なし';
  };

  const pump = (): void => {
    if (root.hidden) return;
    paintDiag();
    pollCapture();
  };
  const loop = (): void => {
    pump();
    if (!root.hidden) raf = requestAnimationFrame(loop);
  };
  const setOpen = (on: boolean): void => {
    root.hidden = !on;
    if (!on) cancelCapture();
    if (on) {
      paintRows();
      paintLook();
      paintDead();
      sound.refresh();
      loop();
    } else if (raf) cancelAnimationFrame(raf);
  };

  lookInput.addEventListener('input', () => {
    opts.reader.setSettings({ lookSensitivity: Number(lookInput.value) });
    paintLook();
  });
  deadInput.addEventListener('input', () => {
    opts.reader.setSettings({ deadZone: Number(deadInput.value) });
    paintDead();
  });
  root.querySelector('[data-testid="look-reset"]')!.addEventListener('click', () => {
    opts.reader.setSettings({ lookSensitivity: GAMEPAD_CONFIG.lookSensitivity });
    paintLook();
  });
  root.querySelector('[data-testid="binds-reset"]')!.addEventListener('click', () => resetDialog.open());
  root.querySelector('[data-testid="bind-cancel"]')!.addEventListener('click', () => {
    cancelCapture();
    noteEl.textContent = 'やめたい';
  });
  root.querySelector('[data-testid="settings-close"]')!.addEventListener('click', () => setOpen(false));
  root.querySelector('[data-testid="settings-scrim"]')!.addEventListener('click', () => setOpen(false));
  root.querySelector('[data-testid="gp-calib"]')!.addEventListener('click', () => {
    const s = opts.reader.snapshot();
    if (!s) {
      noteEl.textContent = 'コントローラーが ないよ';
      return;
    }
    opts.reader.calibrateFromAxes(s.axes[0] ?? 0, s.axes[1] ?? 0, s.axes[2] ?? 0, s.axes[3] ?? 0);
    noteEl.textContent = 'まんなかを おぼえたよ';
  });

  const panel = anchor?.querySelector('.po-panel');
  let host: HTMLElement | null = panel?.querySelector('.po-menu-row') ?? null;
  if (panel && !host) {
    host = document.createElement('div');
    host.className = 'po-menu-row';
    panel.appendChild(host);
  }
  if (!host) host = anchor ?? null;
  if (host) {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'po-book po-extra';
    openBtn.dataset.testid = 'settings-open';
    openBtn.textContent = 'せってい';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(root.hidden);
    });
    openBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.appendChild(openBtn);
  }

  paintLook();
  paintDead();
  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => !root.hidden,
    isCapturing: () => capture !== null,
    cancelCapture,
    refreshAudio: () => sound.refresh(),
    pump,
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      root.remove();
    },
  };
}

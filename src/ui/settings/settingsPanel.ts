/**
 * せってい: キー・マウスの見本と、おと。コントローラーの変更はゲームパッド画面。
 */
import type { GamepadReader } from '../../input/gamepad';
import { GAMEPAD_CONFIG } from '../../input/gamepad/config';
import type { AudioSettings } from '../../fx/audioConfig';
import type { FxSettings } from '../../fx/config';
import { mountSoundKnobs } from '../soundSettings';
import { ruby } from '../text';
import type { DialogStack } from '../menu/choiceDialog';
import { CONTROL_ROWS, rowKeys, type ControlRow } from './controlRows';
import { createPadScreen } from './padScreen';
import './settingsPanel.css';

export interface SettingsPanel {
  open(): void;
  close(): void;
  isOpen(): boolean;
  isCapturing(): boolean;
  cancelCapture(): void;
  refreshAudio(): void;
  pump(): void;
  dispose(): void;
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

  const general = document.createElement('div');
  general.className = 'set-panel';
  general.dataset.testid = 'settings-general';
  general.innerHTML =
    `<h2 class="set-title">せってい</h2>` +
    `<div class="set-tabs" role="tablist" aria-label="せってい">` +
    `<button type="button" class="set-tab" role="tab" id="tab-sound" data-testid="tab-sound" data-menu-item aria-selected="true" aria-controls="panel-sound">${ruby('音', 'おと')}</button>` +
    `<button type="button" class="set-tab" role="tab" id="tab-camera" data-testid="tab-camera" data-menu-item aria-selected="false" aria-controls="panel-camera">カメラ</button>` +
    `<button type="button" class="set-tab" role="tab" id="tab-controls" data-testid="tab-controls" data-menu-item aria-selected="false" aria-controls="panel-controls">コントローラー</button>` +
    `</div>` +
    `<div id="panel-sound" class="set-tabpanel" role="tabpanel" data-testid="panel-sound" aria-labelledby="tab-sound">` +
    `<div data-testid="settings-sound"></div>` +
    `</div>` +
    `<div id="panel-camera" class="set-tabpanel" role="tabpanel" data-testid="panel-camera" aria-labelledby="tab-camera" hidden>` +
    `<h3 class="set-h">みる はやさ</h3>` +
    `<p class="set-lead">みぎスティックを たおす はやさ。おしこみではない。</p>` +
    `<div class="set-slider" data-slider-row data-menu-item tabindex="0">` +
    `<span>おそい</span>` +
    `<input type="range" min="${GAMEPAD_CONFIG.lookMin}" max="${GAMEPAD_CONFIG.lookMax}" step="0.1" data-testid="look-speed" aria-label="みる はやさ">` +
    `<span>はやい</span>` +
    `<span class="set-num" data-testid="look-value"></span>` +
    `</div>` +
    `<button type="button" class="set-text-btn" data-testid="look-reset" data-menu-item>はやさを もとにもどす</button>` +
    `</div>` +
    `<div id="panel-controls" class="set-tabpanel" role="tabpanel" data-testid="panel-controls" aria-labelledby="tab-controls" hidden>` +
    `<div class="set-tabs set-subtabs" role="tablist" aria-label="コントローラー">` +
    `<button type="button" class="set-tab" role="tab" data-testid="ctrl-tab-keys" data-menu-item aria-selected="true">キーボード/マウス</button>` +
    `<button type="button" class="set-tab" role="tab" data-testid="ctrl-tab-pad" data-menu-item aria-selected="false">ゲームパッド</button>` +
    `</div>` +
    `<div data-testid="ctrl-panel-keys">` +
    `<p class="set-lead">キーボードと マウスの そうさ。</p>` +
    `<div class="set-table set-table-keys" data-testid="settings-controls"></div>` +
    `</div>` +
    `<div data-testid="ctrl-panel-pad" hidden></div>` +
    `</div>` +
    `<div class="set-actions"><button type="button" class="set-text-btn" data-testid="settings-close" data-menu-item>とじる</button></div>`;

  const soundPanel = general.querySelector<HTMLElement>('[data-testid="panel-sound"]')!;
  const cameraPanel = general.querySelector<HTMLElement>('[data-testid="panel-camera"]')!;
  const tabSound = general.querySelector<HTMLButtonElement>('[data-testid="tab-sound"]')!;
  const tabCamera = general.querySelector<HTMLButtonElement>('[data-testid="tab-camera"]')!;
  const lookInput = general.querySelector<HTMLInputElement>('[data-testid="look-speed"]')!;
  const lookValue = general.querySelector<HTMLElement>('[data-testid="look-value"]')!;
  const controlsPanel = general.querySelector<HTMLElement>('[data-testid="panel-controls"]')!;
  const tabControls = general.querySelector<HTMLButtonElement>('[data-testid="tab-controls"]')!;
  const keysPanel = general.querySelector<HTMLElement>('[data-testid="ctrl-panel-keys"]')!;
  const padHost = general.querySelector<HTMLElement>('[data-testid="ctrl-panel-pad"]')!;
  const subKeys = general.querySelector<HTMLButtonElement>('[data-testid="ctrl-tab-keys"]')!;
  const subPad = general.querySelector<HTMLButtonElement>('[data-testid="ctrl-tab-pad"]')!;
  type Tab = 'sound' | 'camera' | 'controls';
  let tab: Tab = 'sound';
  let sub: 'keys' | 'pad' = 'keys';

  const paintLook = (): void => {
    const v = opts.reader.getSettings().lookSensitivity;
    if (Math.abs(Number(lookInput.value) - v) > 1e-9) lookInput.value = String(v);
    lookValue.textContent = v.toFixed(1);
  };
  const showSub = (next: 'keys' | 'pad'): void => {
    sub = next;
    keysPanel.hidden = next !== 'keys';
    padHost.hidden = next !== 'pad';
    subKeys.setAttribute('aria-selected', String(next === 'keys'));
    subPad.setAttribute('aria-selected', String(next === 'pad'));
    subKeys.classList.toggle('is-on', next === 'keys');
    subPad.classList.toggle('is-on', next === 'pad');
    if (next === 'pad' && tab === 'controls') pad.open();
    else pad.close();
  };
  const showTab = (next: Tab): void => {
    tab = next;
    const tabs: [Tab, HTMLButtonElement, HTMLElement][] = [
      ['sound', tabSound, soundPanel],
      ['camera', tabCamera, cameraPanel],
      ['controls', tabControls, controlsPanel],
    ];
    for (const [id, btn, panel] of tabs) {
      panel.hidden = id !== next;
      btn.setAttribute('aria-selected', String(id === next));
      btn.classList.toggle('is-on', id === next);
    }
    if (next === 'camera') paintLook();
    showSub(sub);
  };

  const pad = createPadScreen({
    reader: opts.reader,
    dialogs: opts.dialogs,
    onCamera: () => {
      showTab('camera');
      tabCamera.focus();
    },
  });
  padHost.append(pad.el);

  const scrim = document.createElement('div');
  scrim.className = 'set-scrim';
  scrim.dataset.testid = 'settings-scrim';
  root.append(scrim, general);
  document.body.appendChild(root);

  const table = general.querySelector<HTMLElement>('[data-testid="settings-controls"]')!;
  const sound = mountSoundKnobs(
    { audio: opts.audio, fx: opts.fx, onChange: opts.onAudio },
    general.querySelector('[data-testid="settings-sound"]')!,
  );
  let raf = 0;

  const paintKeys = (): void => {
    table.replaceChildren();
    const head = document.createElement('div');
    head.className = 'set-head';
    head.innerHTML = '<span>すること</span><span>キー・マウス</span>';
    table.append(head);
    const cols = document.createElement('div');
    cols.className = 'set-keys-cols';
    let cat = '';
    let grid: HTMLElement | null = null;
    for (const row of CONTROL_ROWS) {
      if (row.category !== cat || !grid) {
        cat = row.category;
        const block = document.createElement('div');
        block.className = 'set-keys-cat';
        const h = document.createElement('div');
        h.className = 'set-cat';
        h.textContent = cat;
        grid = document.createElement('div');
        grid.className = 'set-keys-grid';
        block.append(h, grid);
        cols.append(block);
      }
      grid.append(keyRow(row));
    }
    table.append(cols);
  };

  const stop = (e: Event): void => e.stopPropagation();
  root.addEventListener('pointerdown', stop);
  root.addEventListener('click', stop);

  const loop = (): void => {
    pad.pump();
    if (!root.hidden) raf = requestAnimationFrame(loop);
  };

  const setOpen = (on: boolean): void => {
    root.hidden = !on;
    if (!on) {
      pad.close();
      if (raf) cancelAnimationFrame(raf);
      return;
    }
    showTab(tab);
    paintKeys();
    sound.refresh();
    paintLook();
    loop();
  };

  const topTabs: [Tab, HTMLButtonElement][] = [['sound', tabSound], ['camera', tabCamera], ['controls', tabControls]];
  for (const [id, b] of topTabs) b.addEventListener('click', () => showTab(id));
  const arrowTabs = <T,>(list: [T, HTMLButtonElement][], pick: (id: T) => void): void => {
    list.forEach(([id, b], i) => {
      b.addEventListener('focus', () => pick(id));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length]![1].focus();
      });
    });
  };
  arrowTabs(topTabs, showTab);
  const subTabs: ['keys' | 'pad', HTMLButtonElement][] = [['keys', subKeys], ['pad', subPad]];
  for (const [id, b] of subTabs) b.addEventListener('click', () => showSub(id));
  arrowTabs(subTabs, showSub);
  lookInput.addEventListener('input', () => {
    opts.reader.setSettings({ lookSensitivity: Number(lookInput.value) });
    paintLook();
  });
  general.querySelector('[data-testid="look-reset"]')!.addEventListener('click', () => {
    opts.reader.setSettings({ lookSensitivity: GAMEPAD_CONFIG.lookSensitivity });
    paintLook();
  });

  general.querySelector('[data-testid="settings-close"]')!.addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));

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

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => !root.hidden,
    isCapturing: () => pad.isCapturing(),
    cancelCapture: () => pad.cancelCapture(),
    refreshAudio: () => sound.refresh(),
    pump: () => pad.pump(),
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      root.remove();
    },
  };
}

function keyRow(row: ControlRow): HTMLElement {
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
  return line;
}

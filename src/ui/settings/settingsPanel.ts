/**
 * せってい: キー・マウスの見本と、おと。コントローラーの変更はゲームパッド画面。
 */
import type { GamepadReader } from '../../input/gamepad';
import type { AudioSettings } from '../../fx/audioConfig';
import type { FxSettings } from '../../fx/config';
import { mountSoundKnobs } from '../soundSettings';
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
    `<div class="set-actions">` +
    `<button type="button" class="set-text-btn" data-testid="pad-open" data-menu-item>ゲームパッド</button>` +
    `</div>` +
    `<h3 class="set-h">おと</h3>` +
    `<div data-testid="settings-sound"></div>` +
    `<h3 class="set-h">キー・マウス</h3>` +
    `<p class="set-lead">キーボードとマウスのそうさ。コントローラーは「ゲームパッド」。</p>` +
    `<div class="set-table set-table-keys" data-testid="settings-controls"></div>` +
    `<div class="set-actions"><button type="button" class="set-text-btn" data-testid="settings-close" data-menu-item>とじる</button></div>`;

  const pad = createPadScreen({
    reader: opts.reader,
    dialogs: opts.dialogs,
    onBack: () => {
      general.hidden = false;
    },
  });

  const scrim = document.createElement('div');
  scrim.className = 'set-scrim';
  scrim.dataset.testid = 'settings-scrim';
  root.append(scrim, general, pad.el);
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
    let cat = '';
    for (const row of CONTROL_ROWS) {
      if (row.category !== cat) {
        cat = row.category;
        const h = document.createElement('div');
        h.className = 'set-cat';
        h.textContent = cat;
        table.append(h);
      }
      table.append(keyRow(row));
    }
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
      general.hidden = false;
      if (raf) cancelAnimationFrame(raf);
      return;
    }
    general.hidden = false;
    paintKeys();
    sound.refresh();
    loop();
  };

  general.querySelector('[data-testid="pad-open"]')!.addEventListener('click', () => {
    general.hidden = true;
    pad.open();
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

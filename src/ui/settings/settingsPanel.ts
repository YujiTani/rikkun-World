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
import { helpFor } from './helpText';
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
    `<div class="set-headrow">` +
    `<button type="button" class="set-text-btn set-back" data-testid="settings-back" data-help="ui:back" data-menu-item hidden>もどる</button>` +
    `<h2 class="set-title" data-title>${ruby('設定', 'せってい')}</h2>` +
    `<button type="button" class="set-text-btn set-close" data-testid="settings-close" data-help="ui:close" data-menu-item>とじる</button>` +
    `</div>` +
    // 1 だん目: 音・カメラ・コントローラー（コントローラーを おすと 2 だん目へ）
    `<div data-screen="top">` +
    `<div class="set-tabs" role="tablist" aria-label="せってい">` +
    `<button type="button" class="set-tab" role="tab" id="tab-sound" data-testid="tab-sound" data-help="ui:tabSound" data-menu-item aria-selected="true" aria-controls="panel-sound">${ruby('音', 'おと')}</button>` +
    `<button type="button" class="set-tab" role="tab" id="tab-camera" data-testid="tab-camera" data-help="ui:tabCamera" data-menu-item aria-selected="false" aria-controls="panel-camera">カメラ</button>` +
    `<button type="button" class="set-tab" id="tab-controls" data-testid="tab-controls" data-help="ui:tabControls" data-menu-item>コントローラー</button>` +
    `</div>` +
    `<div data-help-slot></div>` +
    `<div id="panel-sound" class="set-tabpanel" role="tabpanel" data-testid="panel-sound" aria-labelledby="tab-sound">` +
    `<div data-testid="settings-sound"></div>` +
    `</div>` +
    `<div id="panel-camera" class="set-tabpanel" role="tabpanel" data-testid="panel-camera" aria-labelledby="tab-camera" hidden>` +
    `<h3 class="set-h">みる はやさ</h3>` +
    `<p class="set-lead">みぎスティックを たおす はやさ。おしこみではない。</p>` +
    `<div class="set-slider" data-help="ui:lookSpeed" data-slider-row data-menu-item tabindex="0">` +
    `<span>おそい</span>` +
    `<input type="range" min="${GAMEPAD_CONFIG.lookMin}" max="${GAMEPAD_CONFIG.lookMax}" step="0.1" data-testid="look-speed" aria-label="みる はやさ">` +
    `<span>はやい</span>` +
    `<span class="set-num" data-testid="look-value"></span>` +
    `</div>` +
    `<button type="button" class="set-text-btn" data-testid="look-reset" data-help="ui:lookReset" data-menu-item>はやさを もとにもどす</button>` +
    `</div>` +
    `</div>` +
    // 2 だん目: キーボード/マウス・ゲームパッド（ゲームパッドを おすと 3 だん目へ）
    `<div data-screen="controls" hidden>` +
    `<div class="set-tabs" role="tablist" aria-label="コントローラー">` +
    `<button type="button" class="set-tab is-on" role="tab" data-testid="ctrl-tab-keys" data-help="ui:tabKeys" data-menu-item aria-selected="true">キーボード/マウス</button>` +
    `<button type="button" class="set-tab" data-testid="ctrl-tab-pad" data-help="ui:tabPad" data-menu-item>ゲームパッド</button>` +
    `</div>` +
    `<div data-help-slot></div>` +
    `<div data-testid="ctrl-panel-keys">` +
    `<p class="set-lead">キーボードと マウスの そうさ。</p>` +
    `<div class="set-table set-table-keys" data-testid="settings-controls"></div>` +
    `</div>` +
    `</div>` +
    // 3 だん目: ゲームパッド（フィールド・もちもの・クラフト）
    `<div data-screen="pad" data-testid="ctrl-panel-pad" hidden></div>`;

  const soundPanel = general.querySelector<HTMLElement>('[data-testid="panel-sound"]')!;
  const cameraPanel = general.querySelector<HTMLElement>('[data-testid="panel-camera"]')!;
  const tabSound = general.querySelector<HTMLButtonElement>('[data-testid="tab-sound"]')!;
  const tabCamera = general.querySelector<HTMLButtonElement>('[data-testid="tab-camera"]')!;
  const lookInput = general.querySelector<HTMLInputElement>('[data-testid="look-speed"]')!;
  const lookValue = general.querySelector<HTMLElement>('[data-testid="look-value"]')!;
  const tabControls = general.querySelector<HTMLButtonElement>('[data-testid="tab-controls"]')!;
  const padHost = general.querySelector<HTMLElement>('[data-testid="ctrl-panel-pad"]')!;
  const subKeys = general.querySelector<HTMLButtonElement>('[data-testid="ctrl-tab-keys"]')!;
  const subPad = general.querySelector<HTMLButtonElement>('[data-testid="ctrl-tab-pad"]')!;
  const backBtn = general.querySelector<HTMLButtonElement>('[data-testid="settings-back"]')!;
  const titleEl = general.querySelector<HTMLElement>('[data-title]')!;
  const screens = {
    top: general.querySelector<HTMLElement>('[data-screen="top"]')!,
    controls: general.querySelector<HTMLElement>('[data-screen="controls"]')!,
    pad: padHost,
  };
  type Screen = keyof typeof screens;
  const TITLES: Record<Screen, string> = { top: ruby('設定', 'せってい'), controls: 'コントローラー', pad: 'ゲームパッド' };
  /** 1 だん目で えらんでいる中身（コントローラーは 中身ではなく 2 だん目への入り口） */
  type Tab = 'sound' | 'camera';
  let tab: Tab = 'sound';
  let screen: Screen = 'top';

  const paintLook = (): void => {
    const v = opts.reader.getSettings().lookSensitivity;
    if (Math.abs(Number(lookInput.value) - v) > 1e-9) lookInput.value = String(v);
    lookValue.textContent = v.toFixed(1);
  };
  const showTab = (next: Tab): void => {
    tab = next;
    soundPanel.hidden = next !== 'sound';
    cameraPanel.hidden = next !== 'camera';
    tabSound.setAttribute('aria-selected', String(next === 'sound'));
    tabCamera.setAttribute('aria-selected', String(next === 'camera'));
    tabSound.classList.toggle('is-on', next === 'sound');
    tabCamera.classList.toggle('is-on', next === 'camera');
    if (next === 'camera') paintLook();
    showHelp(null);
  };
  /** 画面を 1 だん切りかえる。タブの段は 1 つだけ見える */
  const goTo = (next: Screen): void => {
    screen = next;
    for (const k of Object.keys(screens) as Screen[]) screens[k].hidden = k !== next;
    backBtn.hidden = next === 'top';
    titleEl.innerHTML = TITLES[next];
    if (next === 'pad') pad.open();
    else pad.close();
    placeHelp();
  };

  // ---- ヘルプの帯: タブの下の 決まった所に 1 つだけ。当たった・フォーカスした物の説明、なにもなければ その画面の説明
  const helpBand = document.createElement('p');
  helpBand.className = 'set-help';
  helpBand.dataset.testid = 'settings-help';
  helpBand.setAttribute('role', 'status');
  const defaultHelp = (): string =>
    screen === 'top' ? (tab === 'sound' ? 'ui:tabSound' : 'ui:tabCamera') : screen === 'controls' ? 'ui:tabControls' : pad.mode() === 'menu' ? 'ui:tabMenu' : 'ui:tabPad';
  const showHelp = (key: string | null): void => {
    helpBand.innerHTML = helpFor(key ?? defaultHelp());
  };
  function placeHelp(): void {
    const host = screen === 'pad' ? pad.el : screens[screen];
    host.querySelector('[data-help-slot]')?.append(helpBand);
    showHelp(null);
  }
  const helpKeyOf = (t: EventTarget | null): string | null => (t instanceof Element ? t.closest('[data-help]')?.getAttribute('data-help') ?? null : null);
  general.addEventListener('pointerover', (e) => showHelp(helpKeyOf(e.target)));
  general.addEventListener('pointerout', (e) => {
    if (!helpKeyOf(e.relatedTarget)) showHelp(null);
  });
  general.addEventListener('focusin', (e) => showHelp(helpKeyOf(e.target)));
  general.addEventListener('focusout', (e) => {
    if (!helpKeyOf(e.relatedTarget)) showHelp(null);
  });

  const pad = createPadScreen({
    reader: opts.reader,
    dialogs: opts.dialogs,
    onCamera: () => {
      goTo('top');
      showTab('camera');
      tabCamera.focus();
    },
    onMode: () => showHelp(null),
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
  for (const [id, key] of [['sound-master', 'volMaster'], ['sound-bgm', 'volBgm'], ['sound-fx', 'volFx']] as const) {
    general.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.closest('label')?.setAttribute('data-help', `ui:${key}`);
  }
  general.querySelector('.ss-check')?.setAttribute('data-help', 'ui:mute');
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
    goTo('top');
    showTab(tab);
    paintKeys();
    sound.refresh();
    paintLook();
    loop();
  };

  tabSound.addEventListener('click', () => showTab('sound'));
  tabCamera.addEventListener('click', () => showTab('camera'));
  tabControls.addEventListener('click', () => goTo('controls'));
  subPad.addEventListener('click', () => goTo('pad'));
  subKeys.addEventListener('click', () => goTo('controls'));
  backBtn.addEventListener('click', () => goTo(screen === 'pad' ? 'controls' : 'top'));
  /** 同じ段のタブは 左右で 移せる。音・カメラは えらんだだけで 中身が かわる */
  const arrowTabs = (list: HTMLButtonElement[], onFocus?: (b: HTMLButtonElement) => void): void => {
    list.forEach((b, i) => {
      if (onFocus) b.addEventListener('focus', () => onFocus(b));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length]!.focus();
      });
    });
  };
  arrowTabs([tabSound, tabCamera, tabControls], (b) => {
    if (b === tabSound) showTab('sound');
    else if (b === tabCamera) showTab('camera');
  });
  arrowTabs([subKeys, subPad]);
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
    openBtn.innerHTML = ruby('設定', 'せってい');
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

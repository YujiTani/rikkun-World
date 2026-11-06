/**
 * ゲームパッドの中身（せっていの「コントローラー」→「ゲームパッド」タブにはめこむ）。
 * 中央の図・ボタンのまとまりの四角・四角から札までの折れ線・[ことば | ボタン] の札。
 * タブは「あそぶ とき」と「もちもの・クラフト」。割り当て直しは「あそぶ とき」だけ。
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
import { badgeHtml } from './padBadge';
import { MENU_LABELS, PAD_GROUPS, playLabels, type PadLabel } from './padGroups';
import { placeSide, sideHeight, type LayoutParams } from './padLayout';
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
  /** 札の持ち主（いちばん上の面）。図でここを光らせる */
  faces: readonly PadFace[];
  key: string;
  origin: 'pad' | 'pointer';
  seen: Partial<Record<PadFace, boolean>>;
}

type Mode = 'play' | 'menu';

/** 札 1 まいの高さ・すきま（px）。押せる大きさ 44px 以上 */
const ROW_H = 44;
const ROW_GAP = 2;
const STACK_GAP = 8;
/** 線が曲がる位置を、札の列のふちから何 px にするか */
const RUN = 36;

export function createPadScreen(opts: {
  reader: GamepadReader;
  dialogs: DialogStack;
  /** みる はやさはせっていのカメラタブだけ。ここからはそこを開く */
  onCamera: () => void;
}): PadScreen {
  const el = document.createElement('div');
  el.className = 'pad-screen';
  el.dataset.testid = 'pad-screen';
  el.hidden = true;
  el.innerHTML =
    `<div class="pad-tabs" role="tablist" aria-label="ゲームパッド">` +
    `<button type="button" class="set-tab" role="tab" data-testid="pad-tab-play" data-menu-item aria-selected="true">あそぶ とき</button>` +
    `<button type="button" class="set-tab" role="tab" data-testid="pad-tab-menu" data-menu-item aria-selected="false">もちもの・クラフト</button>` +
    `</div>` +
    `<p class="pad-warn" data-testid="pad-unknown" hidden>この コントローラーは ボタンの ならびが わからないよ。この えは Switch の ならび。おした ボタンを、ここで きめられるよ。</p>` +
    `<div class="pad-capture" data-testid="bind-capture" hidden>` +
    `<span>ボタンを おしてね</span>` +
    `<button type="button" class="set-text-btn" data-testid="bind-cancel" data-menu-item>やめる</button>` +
    `</div>` +
    `<p class="set-note-line" data-testid="bind-note"></p>` +
    `<div class="pad-stage" data-testid="pad-stage">` +
    `<div class="pad-col" data-col="left"></div>` +
    `<div class="pad-center"><div class="pad-body">${padSvg()}</div></div>` +
    `<div class="pad-col" data-col="right"></div>` +
    `<svg class="pad-wires" data-wires aria-hidden="true"></svg>` +
    `</div>` +
    `<div class="set-actions">` +
    `<button type="button" class="set-text-btn" data-testid="pad-to-camera" data-menu-item>カメラの はやさ</button>` +
    `<button type="button" class="set-text-btn" data-testid="binds-reset" data-menu-item>もとにもどす</button>` +
    `</div>` +
    `<details class="pad-more" data-testid="settings-diag">` +
    `<summary data-testid="pad-diag-open">${ruby('動作', 'どうさ')}${ruby('確認', 'かくにん')}</summary>` +
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
    `</details>`;

  const q = <T extends Element>(sel: string): T => el.querySelector<T>(sel)!;
  const noteEl = q<HTMLElement>('[data-testid="bind-note"]');
  const captureEl = q<HTMLElement>('[data-testid="bind-capture"]');
  const unknownEl = q<HTMLElement>('[data-testid="pad-unknown"]');
  const stage = q<HTMLElement>('.pad-stage');
  const body = q<HTMLElement>('.pad-body');
  const colL = q<HTMLElement>('[data-col="left"]');
  const colR = q<HTMLElement>('[data-col="right"]');
  const wires = q<SVGSVGElement>('[data-wires]');
  const deadInput = q<HTMLInputElement>('[data-testid="dead-zone"]');
  const deadValue = q<HTMLElement>('[data-testid="dead-value"]');
  const idEl = q<HTMLElement>('[data-testid="gp-id"]');
  const mapEl = q<HTMLElement>('[data-testid="gp-map"]');
  const axesEl = q<HTMLElement>('[data-testid="gp-axes"]');
  const btnEl = q<HTMLElement>('[data-testid="gp-buttons"]');
  const tabPlay = q<HTMLButtonElement>('[data-testid="pad-tab-play"]');
  const tabMenu = q<HTMLButtonElement>('[data-testid="pad-tab-menu"]');
  let capture: Capture | null = null;
  let picked: { key: string; faces: readonly string[] } | null = null;
  let mode: Mode = 'play';

  const resetDialog = mountChoiceDialog({
    testId: 'reset-binds-dialog',
    questionHtml: `ボタンを はじめの ${ruby('並', 'なら')}びに もどす？`,
    yesLabel: 'もどす',
    yesTestId: 'reset-yes',
    noTestId: 'reset-no',
    onYes: () => {
      opts.reader.resetBinds();
      resetDialog.close();
      noteEl.textContent = 'はじめの ならびに もどしたよ';
      paintCalls();
    },
  });
  opts.dialogs.add(resetDialog);

  const paintDead = (): void => {
    const v = opts.reader.getSettings().deadZone;
    if (Math.abs(Number(deadInput.value) - v) > 1e-9) deadInput.value = String(v);
    deadValue.textContent = v.toFixed(2);
  };

  const labelsNow = (): readonly PadLabel[] => (mode === 'play' ? playLabels(opts.reader.getBinds()) : MENU_LABELS);

  /** 札 1 まい: [ことば | ボタンの印]。あそぶ ときは押せる、もちもの・クラフトは見るだけ */
  const makeCall = (label: PadLabel): HTMLElement => {
    const shown = label.text.replace('/', '<span class="pad-slash">/</span>');
    const inner = `<span class="pad-call-text">${shown}</span><span class="pad-call-badge">${badgeHtml(label.faces, label.stick)}</span>`;
    if (mode === 'menu') {
      const d = document.createElement('div');
      d.className = 'pad-call is-static';
      d.dataset.testid = `pad-menu-${label.key}`;
      d.innerHTML = inner;
      return d;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pad-call';
    b.dataset.menuItem = '';
    b.dataset.testid = label.action ? `bind-${label.action}` : `pad-call-${label.key}`;
    b.title = label.text;
    b.innerHTML = inner;
    if (capture?.key === label.key) b.classList.add('is-wait');
    if (picked?.key === label.key) b.classList.add('is-pick');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      picked = { key: label.key, faces: label.stick ? [label.stick] : label.faces };
      paintHot();
      if (!label.action) {
        noteEl.textContent = 'スティックは そのままだよ';
        paintCalls();
        return;
      }
      beginCapture(label, e.isTrusted ? 'pointer' : 'pad');
    });
    return b;
  };

  const paintCalls = (): void => {
    const labels = labelsNow();
    colL.replaceChildren();
    colR.replaceChildren();
    const side = new Map(PAD_GROUPS.map((g) => [g.id, g.side]));
    for (const g of PAD_GROUPS) {
      for (const l of labels.filter((x) => x.group === g.id)) {
        const c = makeCall(l);
        c.dataset.group = g.id;
        (side.get(g.id) === 'left' ? colL : colR).append(c);
      }
    }
    paintHot();
    layout();
  };

  const NS = 'http://www.w3.org/2000/svg';

  /** 札を置き、四角から札までの線を引く。計算は padLayout（線が交わらない決まり） */
  const layout = (): void => {
    const st = stage.getBoundingClientRect();
    if (st.width < 8) return;
    const svg = body.querySelector('svg')!.getBoundingClientRect();
    const scale = svg.width / 720;
    const svgLeft = svg.left - st.left;
    const rowsOf = (id: string): number => colL.querySelectorAll(`[data-group="${id}"]`).length + colR.querySelectorAll(`[data-group="${id}"]`).length;
    const params = (side: 'left' | 'right', edgeX: number, span?: number): LayoutParams => ({
      side, edgeX, rowH: ROW_H, rowGap: ROW_GAP, stackGap: STACK_GAP, run: RUN, span,
    });
    const heightOf = (sd: 'left' | 'right'): number =>
      sideHeight(PAD_GROUPS.filter((g) => g.side === sd).map((g) => rowsOf(g.id)), params(sd, 0));
    // 左右の札の列は 上と下をそろえ、図はその高さの まんなかに置く
    const colH = Math.max(heightOf('left'), heightOf('right'));
    const stageH = Math.max(colH, svg.height);
    const colTop = (stageH - colH) / 2;
    const off = (stageH - svg.height) / 2;
    body.style.marginTop = `${off}px`;
    wires.replaceChildren();
    for (const sd of ['left', 'right'] as const) {
      const col = sd === 'left' ? colL : colR;
      const cr = col.getBoundingClientRect();
      const edgeX = (sd === 'left' ? cr.right : cr.left) - st.left;
      const groups = PAD_GROUPS.filter((g) => g.side === sd).map((g) => ({
        id: g.id,
        boxX: svgLeft + (sd === 'left' ? g.box.x : g.box.x + g.box.w) * scale,
        boxY: off + (g.box.y + g.box.h / 2) * scale,
        rows: rowsOf(g.id),
      }));
      const colOrigin = cr.top - st.top;
      // 図の高さのずれ（off）ぶん、札の座標を stage にそろえる
      const shifted = groups.map((g) => ({ ...g, boxY: g.boxY - colTop }));
      for (const pl of placeSide(shifted, params(sd, edgeX, colH))) {
        const rows = [...col.querySelectorAll<HTMLElement>(`[data-group="${pl.id}"]`)];
        rows.forEach((r, i) => {
          r.style.top = `${colTop + pl.top + i * (ROW_H + ROW_GAP) - colOrigin}px`;
          r.style.height = `${ROW_H}px`;
        });
        const line = document.createElementNS(NS, 'polyline');
        line.setAttribute('points', pl.points.map(([x, y]) => `${x},${y + colTop}`).join(' '));
        const on = rows.some((r) => r.classList.contains('is-pick') || r.classList.contains('is-wait'));
        line.setAttribute('class', on ? 'is-on' : '');
        wires.append(line);
      }
      for (const g of PAD_GROUPS.filter((x) => x.side === sd)) {
        body.querySelector(`[data-pad-box="${g.id}"]`)?.classList.toggle('is-off', rowsOf(g.id) === 0);
      }
    }
    stage.style.height = `${Math.ceil(stageH)}px`;
    wires.setAttribute('viewBox', `0 0 ${st.width} ${Math.ceil(stageH)}`);
  };

  const paintHot = (): void => {
    const s = opts.reader.snapshot();
    const pickedFaces = capture ? capture.faces : picked?.faces ?? [];
    for (const part of el.querySelectorAll<SVGElement>('[data-pad-face]')) {
      const id = part.dataset.padFace!;
      const down = !!(s && id in s.faces && s.faces[id as PadFace]);
      part.classList.toggle('is-hot', down);
      part.classList.toggle('is-pick', mode === 'play' && pickedFaces.includes(id));
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

  const beginCapture = (label: PadLabel, origin: 'pad' | 'pointer'): void => {
    const seen: Partial<Record<PadFace, boolean>> = {};
    if (origin === 'pad') {
      const s = opts.reader.snapshot();
      if (s) for (const f of PAD_FACES) seen[f] = !!s.faces[f];
    }
    capture = { action: label.action!, faces: label.faces, key: label.key, origin, seen };
    picked = { key: label.key, faces: label.faces };
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

  const showMode = (next: Mode): void => {
    if (capture) cancelCapture();
    mode = next;
    picked = null;
    tabPlay.setAttribute('aria-selected', String(next === 'play'));
    tabMenu.setAttribute('aria-selected', String(next === 'menu'));
    tabPlay.classList.toggle('is-on', next === 'play');
    tabMenu.classList.toggle('is-on', next === 'menu');
    noteEl.textContent = next === 'menu' ? 'メニューを ひらいている ときの ボタン（ここでは かえられないよ）' : '';
    paintCalls();
  };
  tabPlay.addEventListener('click', () => showMode('play'));
  tabMenu.addEventListener('click', () => showMode('menu'));
  tabPlay.classList.add('is-on');

  deadInput.addEventListener('input', () => {
    opts.reader.setSettings({ deadZone: Number(deadInput.value) });
    paintDead();
  });
  q('[data-testid="binds-reset"]').addEventListener('click', () => resetDialog.open());
  q('[data-testid="bind-cancel"]').addEventListener('click', () => {
    cancelCapture();
    noteEl.textContent = 'やめたい';
  });
  q('[data-testid="gp-calib"]').addEventListener('click', () => {
    const s = opts.reader.snapshot();
    if (!s) {
      noteEl.textContent = 'コントローラーが ないよ';
      return;
    }
    opts.reader.calibrateFromAxes(s.axes[0] ?? 0, s.axes[1] ?? 0, s.axes[2] ?? 0, s.axes[3] ?? 0);
    noteEl.textContent = 'まんなかを おぼえたよ';
  });
  q('[data-testid="pad-to-camera"]').addEventListener('click', () => {
    cancelCapture();
    opts.onCamera();
  });

  let lastW = 0;
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const w = stage.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 1) return;
      lastW = w;
      if (!el.hidden) layout();
    }).observe(stage);
  }

  return {
    el,
    open() {
      el.hidden = false;
      paintDead();
      showMode(mode);
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

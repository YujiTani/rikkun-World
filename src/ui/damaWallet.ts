import type { ItemId } from '../contracts';
import type { DamaHud } from '../dama/dama';
import { DAMA } from '../dama/damaTuning';
import { itemIconUrl } from './itemIcon';
import './damaWallet.css';

/**
 * ようかいダマの 数の 見せ方（TOWN-1 1.6〔1F〕§3.4）: すみの 札（いつも 今の 数・もらった 時だけ「＋5」）と もちもの画面の 上の 数。
 * 数・「＋」・かくす 時は `DamaService`（hud・invChip）が 決める。ここは 絵と 場所だけ（時間の ミリ秒タイマーは 持たない。1 ステップごとに update）。
 * 子どもに 見せる 字は 数・「,」・「+」と 1 人用の 字「ようかいダマ」だけ。
 */

export interface DamaWalletSource {
  /** 2P が 参加して いるか（2 人あそびの 配置） */
  duo(): boolean;
  hud(p: 1 | 2): DamaHud | null;
  /** もちもの画面の 上の 数（開いて いない 時 null）。text は 字ぜんぶ */
  invChip(p: 1 | 2): { text: string; count: number } | null;
}

interface Side {
  corner: HTMLDivElement;
  num: HTMLSpanElement;
  plus: HTMLDivElement;
  chip: HTMLDivElement | null;
  /** 場所を 計算した ときの 形（かわった ときだけ 計算しなおす） */
  placedKey: string;
}

function art(): HTMLImageElement {
  const i = document.createElement('img');
  i.className = 'dama-art';
  i.alt = '';
  i.draggable = false;
  i.src = itemIconUrl('yokai_orb' as ItemId);
  return i;
}

function makeSide(hud: HTMLElement, p: 1 | 2): Side {
  const corner = document.createElement('div');
  corner.className = 'dama-corner';
  corner.dataset.who = String(p);
  corner.dataset.testid = `dama-corner-${p}`;
  corner.setAttribute('aria-hidden', 'true');
  const row = document.createElement('div');
  row.className = 'dama-row';
  const num = document.createElement('span');
  num.className = 'dama-num';
  row.append(art(), num);
  const plus = document.createElement('div');
  plus.className = 'dama-plus';
  plus.hidden = true;
  corner.append(row, plus);
  corner.hidden = true;
  hud.append(corner);
  return { corner, num, plus, chip: null, placedKey: '' };
}

/** すみの 札と もちもの画面の 数を 作る。返す 関数を 1 ステップごとに 呼ぶ */
export function installDamaWallet(hud: HTMLElement, src: DamaWalletSource): () => void {
  const sides: Record<1 | 2, Side> = { 1: makeSide(hud, 1), 2: makeSide(hud, 2) };
  return () => {
    const duo = src.duo();
    for (const p of [1, 2] as const) {
      const s = sides[p];
      const h = src.hud(p);
      if (h === null || (p === 2 && !duo)) {
        s.corner.hidden = true;
        removeChip(s);
        continue;
      }
      if (s.num.textContent !== h.text) s.num.textContent = h.text;
      const plusOn = h.plusText !== null;
      if (s.plus.hidden === plusOn) s.plus.hidden = !plusOn;
      if (plusOn && s.plus.textContent !== h.plusText) s.plus.textContent = h.plusText;
      const fade = plusOn && h.left <= DAMA.wallet.fadeSteps;
      if (fade !== ('fade' in s.plus.dataset)) {
        if (fade) s.plus.dataset.fade = '';
        else delete s.plus.dataset.fade;
      }
      const chip = src.invChip(p);
      const hidden = !h.shown;
      if (s.corner.hidden !== hidden) s.corner.hidden = hidden;
      if (chip) placeChip(s, p, duo, chip.text);
      else removeChip(s);
      if (!hidden) placeCorner(s, p, duo, h.text.length);
    }
  };
}

function removeChip(s: Side): void {
  s.chip?.remove();
  s.chip = null;
}

function findInv(p: 1 | 2, duo: boolean): HTMLElement | null {
  for (const r of document.querySelectorAll<HTMLElement>('.inv-root')) {
    if (r.hidden || r.dataset.who !== String(p)) continue;
    if (duo === (r.dataset.layout === 'duo')) return r;
  }
  return null;
}

/** もちもの画面の 上の 帯（1 人 ＝ ✕ の すぐ 左・2 人 ＝ タブと ✕ の 間）。ボタンでは ない */
function placeChip(s: Side, p: 1 | 2, duo: boolean, text: string): void {
  const inv = findInv(p, duo);
  const bar = inv?.querySelector<HTMLElement>(duo ? '.inv-duo-bar' : '.inv-head');
  const close = bar?.querySelector<HTMLElement>(duo ? '.inv-duo-close' : '.inv-close');
  if (!bar || !close) {
    removeChip(s);
    return;
  }
  if (!s.chip || s.chip.parentElement !== bar) {
    removeChip(s);
    const c = document.createElement('div');
    c.className = 'dama-inv';
    c.dataset.testid = `dama-inv-${p}`;
    c.append(art());
    const body = document.createElement('span');
    body.className = 'dama-body';
    c.append(body);
    s.chip = c;
  }
  const body = s.chip.querySelector<HTMLElement>('.dama-body')!;
  const at = text.lastIndexOf(' ');
  const label = at >= 0 ? text.slice(0, at) : '';
  const num = at >= 0 ? text.slice(at + 1) : text;
  const html = `${label ? `<span class="dama-label">${label}</span>` : ''}<span class="dama-num">${num}</span>`;
  if (body.innerHTML !== html) body.innerHTML = html;
  if (s.chip.nextElementSibling !== close) bar.insertBefore(s.chip, close);
}

/** すみの 札は 時計の となり（1 人・2P ＝ 時計の 左、2 人の 1P ＝ 時計の 右）。時計の 場所・字の けた数が かわった ときだけ 測りなおす */
function placeCorner(s: Side, p: 1 | 2, duo: boolean, digits: number): void {
  const key = `${p}|${duo ? 1 : 0}|${digits}|${window.innerWidth}x${window.innerHeight}`;
  if (key === s.placedKey) return;
  const clock = document.querySelector<HTMLElement>(p === 1 ? '#clock' : duo ? '[data-testid="duo-clock-p2"]' : '#clock');
  if (!clock) return;
  s.placedKey = key;
  const r = clock.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(clock).getPropertyValue('--rk-sp-2')) || 8;
  s.corner.style.top = `${r.top}px`;
  if (duo && p === 1) {
    s.corner.style.left = `${r.right + gap}px`;
    s.corner.style.right = 'auto';
  } else {
    s.corner.style.right = `${window.innerWidth - r.left + gap}px`;
    s.corner.style.left = 'auto';
  }
}

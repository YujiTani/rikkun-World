import type { ActionHintItem, ActionHintLines } from './actionHintModel';
import { animalIconUrl } from './animalArt';
import { heartPixels } from './heartsModel';
import { houseTalkIconUrl } from './houseMenuArt';
import { paintKodoTile } from '../world/blocks/mineTexturesWaku';
import { drawPixels, itemIconUrl } from './itemIcon';
import { nickIconPixels } from './itemArtBal';
import './actionHint.css';

/** ボタンの 絵の 種類（マウス か パッドの 肩ボタン。COOP-1 5f-1） */
export type HintPadKind = 'mouse' | 'pad';

/** パッドの 札に 書く 面（`data-hint-pad` の 値＝ 面の 名前・字＝ ZR など）。ついて いない ときは null */
export interface HintPadFace {
  face: string;
  label: string;
}

/**
 * 照準（＋）の すぐ下の ヒント（FIX-action-hint）。左 = 左クリック、右 = 右クリック を横にならべる。
 * 1 つ = ボタンの絵（マウスの L か R が光る／パッドの 肩ボタン）＋ すること の絵 ＋ 小さな 1 語。毎ステップ update(lines) を呼ぶ。DOM: `#action-hint`
 * 2 人の ときの 2P の 分は `new ActionHint(hud, 2)`（`#action-hint-p2`。パッドの 絵だけ。マウスの 絵は 作らない）。
 */
export class ActionHint {
  readonly el: HTMLDivElement;
  private readonly cells: { left: HTMLDivElement; right: HTMLDivElement };
  private shown: ActionHintLines = {};
  private padKind: HintPadKind;
  private readonly padKey = { left: '', right: '' };

  constructor(parent: HTMLElement, who: 1 | 2 = 1) {
    this.el = document.createElement('div');
    this.el.id = who === 1 ? 'action-hint' : `action-hint-p${who}`;
    this.el.className = who === 1 ? 'action-hint' : `action-hint action-hint--p${who}`;
    this.el.setAttribute('aria-hidden', 'true');
    this.el.setAttribute('data-testid', `duo-action-hint-p${who}`);
    this.el.setAttribute('data-aim', 'hint');
    this.padKind = who === 1 ? 'mouse' : 'pad';
    this.el.dataset.pad = this.padKind;
    this.el.hidden = true;
    this.cells = { left: this.makeCell('left', who === 1), right: this.makeCell('right', who === 1) };
    this.el.append(this.cells.left, this.cells.right);
    parent.append(this.el);
  }

  private makeCell(side: 'left' | 'right', withMouse: boolean): HTMLDivElement {
    const c = document.createElement('div');
    c.className = `action-hint__cell action-hint__cell--${side}`;
    c.hidden = true;
    c.innerHTML =
      (withMouse ? `<span class="action-hint__mouse action-hint__mouse--${side}"><i class="action-hint__btn action-hint__btn--l"></i><i class="action-hint__btn action-hint__btn--r"></i></span>` : '') +
      `<span class="action-hint__pad" data-hint-pad=""></span>` +
      `<img class="action-hint__art" alt=""><img class="action-hint__badge" alt="" hidden><span class="action-hint__word"></span>`;
    return c;
  }

  /** ボタンの 絵を マウスか パッドに（変わった ときだけ 書く。2P の 札は いつも パッド） */
  setPad(kind: HintPadKind): void {
    if (kind === this.padKind) return;
    this.padKind = kind;
    this.el.dataset.pad = kind;
  }

  pad(): HintPadKind {
    return this.padKind;
  }

  /** パッドの 札の 面の 名前（左の 札＝ primary、右の 札＝ secondary）。変わった ときだけ 書く */
  setFaces(left: HintPadFace | null, right: HintPadFace | null): void {
    this.setFace('left', left);
    this.setFace('right', right);
  }

  private setFace(side: 'left' | 'right', f: HintPadFace | null): void {
    const key = f ? `${f.face}|${f.label}` : '';
    if (key === this.padKey[side]) return;
    this.padKey[side] = key;
    const pad = this.cells[side].querySelector('.action-hint__pad') as HTMLElement;
    pad.setAttribute('data-hint-pad', f?.face ?? 'none');
    pad.textContent = f?.label ?? '';
  }

  update(lines: ActionHintLines): void {
    if (lines.progress !== this.shown.progress) this.setRing(lines.progress);
    if (same(lines.left, this.shown.left) && same(lines.right, this.shown.right)) {
      this.shown.progress = lines.progress;
      return;
    }
    this.shown = { left: lines.left && { ...lines.left }, right: lines.right && { ...lines.right }, progress: lines.progress };
    this.set(this.cells.left, lines.left);
    this.set(this.cells.right, lines.right);
    this.el.hidden = !lines.left && !lines.right;
  }

  /** 版 3.2: だっこ の わ の たまり（0〜1）。右 の 絵 の まわり に 1 しゅう する（CSS の `--p`）。無ければ わ を 消す */
  private setRing(p: number | undefined): void {
    const cell = this.cells.right;
    if (p === undefined) {
      cell.removeAttribute('data-ring');
      cell.style.removeProperty('--p');
    } else {
      cell.dataset.ring = '1';
      cell.style.setProperty('--p', p.toFixed(3));
    }
  }

  /** いま出している 絵と 語（`progress` = だっこ の わ の たまり。わ が なければ 無い） */
  current(): ActionHintLines {
    const out: ActionHintLines = { left: this.shown.left && { ...this.shown.left }, right: this.shown.right && { ...this.shown.right } };
    if (this.shown.progress !== undefined) out.progress = this.shown.progress;
    return out;
  }

  private set(cell: HTMLDivElement, it: ActionHintItem | undefined): void {
    cell.hidden = !it;
    cell.classList.toggle('action-hint__cell--disabled', !!it?.disabled);
    if (!it) return;
    (cell.querySelector('.action-hint__art') as HTMLImageElement).src = iconUrl(it.icon);
    const badge = cell.querySelector('.action-hint__badge') as HTMLImageElement;
    badge.hidden = !it.badge;
    if (it.badge && !badge.src) badge.src = badgeUrl();
    cell.querySelector('.action-hint__word')!.textContent = it.word;
  }
}

/** 'full'・'carry' の 専用 の 絵 が できるまで は にわとり の 絵（ひとめ で 分かる ように 語 を そえる） */
function iconUrl(icon: ActionHintItem['icon']): string {
  if (icon === 'heart') return heartUrl();
  if (icon === 'talk') return houseTalkIconUrl();
  if (icon === 'chest') return chestUrl();
  if (icon === 'chicken' || icon === 'carry' || icon === 'full') return animalIconUrl('chicken');
  return itemIconUrl(icon);
}

let chestCache: string | undefined;
/** MINE-1C: ヒント「あける」の 絵（art/MINE-1/chest_hint） */
function chestUrl(): string {
  if (!chestCache) {
    const c = document.createElement('canvas');
    drawPixels(c, paintKodoTile('chest_hint'));
    chestCache = c.toDataURL();
  }
  return chestCache;
}

let heartCache: string | undefined;
function heartUrl(): string {
  if (!heartCache) {
    const c = document.createElement('canvas');
    drawPixels(c, heartPixels('full'));
    heartCache = c.toDataURL();
  }
  return heartCache;
}

let badgeCache: string | undefined;
/** MINE-1F: ヒント「あける」の よこの おやぶんの バッジ（今の 二つ名の 絵） */
function badgeUrl(): string {
  if (!badgeCache) {
    const c = document.createElement('canvas');
    drawPixels(c, nickIconPixels('oyabun'));
    badgeCache = c.toDataURL();
  }
  return badgeCache;
}

function same(a: ActionHintItem | undefined, b: ActionHintItem | undefined): boolean {
  return a?.icon === b?.icon && a?.word === b?.word && !!a?.badge === !!b?.badge && !!a?.disabled === !!b?.disabled;
}

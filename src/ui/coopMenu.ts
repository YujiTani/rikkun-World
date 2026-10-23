import { animalIconUrl } from './animalArt';
import { itemIconUrl } from './itemIcon';
import { handsUrl } from './itemArtLive3';
import { CoopMenuModel, type CoopMenuButton, type CoopMenuDeps, type CoopMenuPage } from './coopMenuModel';
import './coopMenu.css';

/**
 * LIVE-3 とりごや の メニュー（docs/design/LIVE-3.md §2.3・§3.1・§3.4）。画面 の 下 がわ に 出し、上 に 小屋 と ▼ が 見える。
 * DOM: 外わく `[data-testid="coop-menu"]`・× `coop-close`・カード `coop-card`。字 は ひらがな（漢字 なし）。
 */
export interface CoopMenuKid {
  id: number;
  macho: boolean;
}

export interface CoopMenuOptions extends CoopMenuDeps {
  /** カード に 出す 子 の しゅるい（ふつう／マッチョ） */
  kidInfo(id: number): CoopMenuKid;
  /** ページ を かえた・ひらいた 音 */
  tick(): void;
  /** ▼ を 出す 子 が かわった（世界 の 頭 の 上） */
  onPick(id: number | null): void;
}

const TITLES: Record<CoopMenuPage, string> = { top: 'とりごや', pick: 'どの こ に する？', confirm: 'ほんとう に いい？' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function img(src: string, cls: string): HTMLImageElement {
  const i = document.createElement('img');
  i.className = cls;
  i.alt = '';
  i.src = src;
  i.draggable = false;
  return i;
}

export class CoopMenu {
  readonly el: HTMLDivElement;
  readonly model: CoopMenuModel;
  private shownVersion = -1;
  private shownOpen = false;

  constructor(
    parent: HTMLElement,
    private readonly o: CoopMenuOptions,
  ) {
    this.model = new CoopMenuModel(o);
    this.el = el('div', 'coop-menu');
    this.el.dataset.testid = 'coop-menu';
    this.el.hidden = true;
    parent.append(this.el);
  }

  open(coop: number): boolean {
    const ok = this.model.open(coop);
    if (ok) {
      this.o.tick();
      this.render();
      this.o.onPick(this.model.pick());
    }
    return ok;
  }

  /** 窓口 `ui.coopMenuPress()` と ボタン から。ページ が かわる ときは 音 */
  press(button: CoopMenuButton, id?: number): void {
    const before = this.model.info().page;
    this.model.press(button, id);
    if (button !== 'hover' && button !== 'close' && button !== 'ok' && this.model.info().page !== before) this.o.tick();
    this.render();
    this.o.onPick(this.model.pick());
  }

  /** 毎ステップ */
  update(): void {
    if (!this.model.info().open) return;
    this.model.update();
    this.render();
    this.o.onPick(this.model.pick());
  }

  private render(): void {
    const info = this.model.info();
    if (!info.open) {
      if (this.shownOpen) {
        this.el.hidden = true;
        this.el.replaceChildren();
        this.shownOpen = false;
        this.shownVersion = -1;
      }
      return;
    }
    if (this.shownOpen && this.shownVersion === this.model.version) return;
    this.shownOpen = true;
    this.shownVersion = this.model.version;
    this.el.hidden = false;
    this.el.dataset.page = info.page;
    this.el.replaceChildren();
    const head = el('div', 'coop-head');
    if (info.page === 'pick') head.append(this.button('もどる', 'coop-back', () => this.press('back')));
    head.append(el('h2', 'coop-title', TITLES[info.page]));
    const close = el('button', 'coop-close', '×');
    close.type = 'button';
    close.dataset.testid = 'coop-close';
    close.setAttribute('aria-label', 'とじる');
    close.addEventListener('click', () => this.press('close'));
    head.append(close);
    const body = el('div', `coop-body coop-body--${info.page}`);
    if (info.page === 'top') this.renderTop(body, info.eggs, info.meatDisabled);
    else if (info.page === 'pick') this.renderPick(body, info.kids);
    else this.renderConfirm(body, info.selected);
    this.el.append(head, body);
  }

  private button(text: string, cls: string, fn: () => void, disabled = false): HTMLButtonElement {
    const b = el('button', `coop-btn ${cls}`);
    b.type = 'button';
    const t = el('span', 'coop-btn__text', text);
    b.append(t);
    b.disabled = disabled;
    b.classList.toggle('is-disabled', disabled);
    b.addEventListener('click', fn);
    return b;
  }

  private renderTop(body: HTMLElement, eggs: number, meatDisabled: boolean): void {
    const collect = this.button('たまご を あつめる', 'coop-collect', () => this.press('collect'), eggs <= 0);
    collect.prepend(img(itemIconUrl('egg'), 'coop-ico'));
    collect.append(el('span', 'coop-count', `× ${eggs}`));
    const meat = this.button('おにく に する', 'coop-meat', () => this.press('meat'), meatDisabled);
    meat.prepend(img(itemIconUrl('momo_nama'), 'coop-ico'));
    body.append(collect, meat);
  }

  private renderPick(body: HTMLElement, kids: readonly number[]): void {
    const grid = el('div', 'coop-cards');
    for (const id of kids) {
      const k = this.o.kidInfo(id);
      const b = el('button', 'coop-card');
      b.type = 'button';
      b.dataset.testid = 'coop-card';
      b.dataset.kid = String(id);
      b.dataset.breed = k.macho ? 'macho' : 'normal';
      b.setAttribute('aria-label', k.macho ? 'マッチョ' : 'にわとり');
      b.append(img(animalIconUrl('chickenRibbon'), 'coop-kid'));
      b.addEventListener('mouseenter', () => this.press('hover', id));
      b.addEventListener('focus', () => this.press('hover', id));
      b.addEventListener('mouseleave', () => this.press('hover'));
      b.addEventListener('click', () => this.press('card', id));
      grid.append(b);
    }
    body.append(grid);
  }

  private renderConfirm(body: HTMLElement, selected: number | null): void {
    const k = selected !== null ? this.o.kidInfo(selected) : { id: 0, macho: false };
    const who = el('div', 'coop-who');
    const bird = img(animalIconUrl('chickenRibbon'), 'coop-kid coop-kid--big');
    bird.dataset.breed = k.macho ? 'macho' : 'normal';
    who.append(bird, el('p', 'coop-sentence', 'この こ の いのち を いただきます。いい？'));
    const row = el('div', 'coop-row');
    const cancel = this.button('やめる', 'coop-cancel', () => this.press('cancel'));
    const ok = this.button('いただきます', 'coop-ok', () => this.press('ok'));
    ok.prepend(img(handsUrl(), 'coop-ico coop-ico--hands'));
    row.append(cancel, ok);
    body.append(who, row);
  }
}

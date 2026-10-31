import { itemDef } from '../../content/items/registry';
import type { NeedRow } from '../../house/editor/model';
import type { HouseMenuState } from '../../house/talk';
import { ICONS } from '../houseEditor/icons';
import { itemIconUrl } from '../itemIcon';
import { withRuby } from '../text';
import './houseSite.css';

/**
 * 「けんちくを はじめる」の 画面（HOUSE-1C PR-2 #340。仕様 §2.8・§3.4。HTML）:
 *  - 一覧（page 'pick'）: せっけいずの カード（`house-btn-pick-<マスの 番号>`）と とじる。材料が たりない カードは うすい（aria-disabled。押すと 「ひつような もの」）。
 *  - ひつような もの（page 'need'）: 材料の 表（`house-need`・行 `need-row`）と もどる（`needClose`）・とじる（`close`）。
 *  - 上空の 視点（page 'sky'）: 上の 帯（`house-sky`。もどる `back` ＋ ふきだし）。世界は 上から 見えて いる。まどは 下の 確かめの まど。
 *  - 確かめの まど（`house-confirm`・`data-kind="build"`）: 2 行 ＋ ［ここに たてる］`yes` ・［やめる］`no`。
 * ふきだしは HouseUi の 1 つを 帯（sky）や 列（pick・need）に 置く。画面の 更新は 出来事（HouseUi.refresh）で 動く。
 */

/** 一覧の カード 1 まい */
interface PickCard {
  slot: number;
  name: string;
  enough: boolean;
}

export interface SiteDeps {
  pickList(): PickCard[];
  needRows(): NeedRow[] & Array<{ bonus?: number }>;
  buildName(): string;
  press(id: string): void;
  /** 「ポン」 */
  tick(): void;
  /** 上空の 視点の マウス（画面の 位置 CSS px）。動いた・左クリック */
  pointer: { move(x: number, y: number): void; click(x: number, y: number): void };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class HouseSiteUi {
  /** 画面の 外わく（HouseUi の 中に 置く） */
  readonly root = el('div', 'house-site');
  private readonly catcher = el('div', 'house-sky-catch');
  private body: HTMLElement | null = null;
  private confirmEl: HTMLElement | null = null;
  private sig = '';
  private confirmSig = '';

  constructor(private readonly d: SiteDeps, private readonly bubble: HTMLElement) {
    this.catcher.dataset.testid = 'house-sky-catch';
    this.catcher.hidden = true;
    this.catcher.addEventListener('pointermove', (e) => this.d.pointer.move(e.clientX, e.clientY));
    this.catcher.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.d.pointer.click(e.clientX, e.clientY);
    });
    this.catcher.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.append(this.catcher);
  }

  /** 画面を 今の 状態に あわせる（変わった ときだけ 作りなおす） */
  render(m: HouseMenuState): void {
    const btns = m.buttons.map((b) => `${b.id}:${b.enabled ? 1 : 0}`).join(',');
    const sky = m.page === 'sky';
    // ふきだしは 上空の 視点では 帯の 中、ほかでは 外わくの 前
    const host = this.root.parentElement;
    if (!sky && host && this.bubble.nextElementSibling !== this.root) host.insertBefore(this.bubble, this.root);
    this.catcher.hidden = !sky;
    if (!sky) this.dropConfirm();
    let sig: string;
    if (m.page === 'pick') sig = `pick|${this.d.pickList().map((c) => `${c.slot}:${c.name}:${c.enough ? 1 : 0}`).join(',')}`;
    else if (m.page === 'need') sig = `need|${JSON.stringify(this.d.needRows())}`;
    else sig = 'sky';
    sig += `|${btns}`;
    if (sig !== this.sig || !this.body) {
      this.sig = sig;
      this.body?.remove();
      this.body = m.page === 'pick' ? this.pick(m) : m.page === 'need' ? this.need() : this.skyBand();
      this.root.append(this.body);
    }
    if (sky) this.renderConfirm(m);
  }

  // ------------------------------------------------------------ 一覧

  private pick(m: HouseMenuState): HTMLElement {
    const root = el('div', 'house-pick');
    root.dataset.testid = 'house-pick';
    const grid = el('div', 'house-pick__grid');
    for (const c of this.d.pickList()) {
      const b = el('button', 'house-btn house-pick__card');
      b.type = 'button';
      b.dataset.testid = `house-btn-pick-${c.slot}`;
      const on = m.buttons.find((x) => x.id === `pick-${c.slot}`)?.enabled ?? c.enough;
      b.classList.toggle('is-disabled', !on);
      b.setAttribute('aria-disabled', on ? 'false' : 'true');
      b.append(el('span', 'house-btn__text', withRuby(c.name)));
      // うすい カードも 押せる（押すと ひつような もの）
      b.addEventListener('click', () => this.go(`pick-${c.slot}`));
      grid.append(b);
    }
    root.append(grid, this.closeButton());
    return root;
  }

  // ------------------------------------------------------------ ひつような もの

  private need(): HTMLElement {
    const root = el('div', 'house-need');
    root.dataset.testid = 'house-need';
    const card = el('div', 'site-card site-need');
    card.append(el('h2', 'site-need__title', 'ひつような もの'));
    const list = el('div', 'site-need__list');
    list.append(el('div', 'site-need__row site-need__row--head', '<span></span><span></span><span class="is-num">ひつよう</span><span class="is-num">くら</span><span class="is-num">たりない</span>'));
    for (const r of this.d.needRows()) {
      const name = itemDef(r.item)?.name ?? r.item;
      const bonus = (r as { bonus?: number }).bonus ?? 0;
      const short = r.short > 0 ? `<span class="site-need__short">×${r.short}</span>` : `<span class="site-need__short is-ok">${ICONS.check}</span>`;
      const row = el('div', 'site-need__row', `<img alt="" src="${itemIconUrl(r.item)}"><span>${withRuby(name)}${bonus > 0 ? ` <small>おまけ</small>` : ''}</span><span class="is-num">${r.need}</span><span class="is-num">${r.have}</span>${short}`);
      row.dataset.testid = 'need-row';
      row.dataset.item = r.item;
      row.dataset.need = String(r.need);
      row.dataset.have = String(r.have);
      row.dataset.short = String(r.short);
      list.append(row);
    }
    const btns = el('div', 'site-card__btns');
    btns.append(this.button('needClose', 'もどる', true), this.closeButton());
    card.append(list, btns);
    root.append(card);
    return root;
  }

  // ------------------------------------------------------------ 上空の 視点

  private skyBand(): HTMLElement {
    const root = el('div', 'house-sky');
    root.dataset.testid = 'house-sky';
    root.append(this.button('back', `${'◀'} もどる`, false), this.bubble);
    return root;
  }

  /** 確かめの まど（わくの 場所を きめた とき） */
  private renderConfirm(m: HouseMenuState): void {
    const on = m.buttons.some((b) => b.id === 'yes');
    if (!on) {
      this.dropConfirm();
      return;
    }
    const name = this.d.buildName();
    if (this.confirmEl && this.confirmSig === name) return;
    this.dropConfirm();
    this.confirmSig = name;
    const pop = el('div', 'house-confirm');
    pop.dataset.testid = 'house-confirm';
    pop.dataset.kind = 'build';
    const card = el('div', 'site-card');
    card.append(el('p', 'site-card__msg', withRuby('ここに たてる？')), el('p', 'site-card__msg', withRuby(name)));
    const row = el('div', 'site-card__btns');
    row.append(this.button('yes', 'ここに たてる', true), this.button('no', 'やめる', false));
    card.append(row);
    pop.append(card);
    this.confirmEl = pop;
    this.root.append(pop);
  }

  private dropConfirm(): void {
    this.confirmEl?.remove();
    this.confirmEl = null;
    this.confirmSig = '';
  }

  // ------------------------------------------------------------ 部品

  private button(id: string, text: string, go: boolean): HTMLButtonElement {
    const b = el('button', `house-btn${go ? ' house-btn--go' : ''}`);
    b.type = 'button';
    b.dataset.testid = `house-btn-${id}`;
    b.append(el('span', 'house-btn__text', withRuby(text)));
    b.addEventListener('click', () => this.go(id));
    return b;
  }

  private closeButton(): HTMLButtonElement {
    const b = el('button', 'house-btn');
    b.type = 'button';
    b.dataset.testid = 'house-btn-close';
    b.append(el('span', 'house-btn__x', '✕'), el('span', 'house-btn__text', 'とじる'));
    b.addEventListener('click', () => this.go('close'));
    return b;
  }

  private go(id: string): void {
    this.d.tick();
    this.d.press(id);
  }

  /** 画面から はずす */
  clear(): void {
    this.body?.remove();
    this.body = null;
    this.sig = '';
    this.dropConfirm();
    this.catcher.hidden = true;
  }
}

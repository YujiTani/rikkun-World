import type { AnimalEvent, NatsukiView } from '../contracts';
import { animalIconUrl } from './animalArt';
import { itemIconUrl } from './itemIcon';
import { NATSUKI_EGG_AT, NATSUKI_HEARTS, NATSUKI_TITLE, natsukiLook, natsukiPulse, type NatsukiLook } from './natsukiPanelModel';
import './natsukiPanel.css';

const HEART_PATH = 'M12 21.5 L3.2 12.6 C0.4 9.6 0.8 5 4.2 3.4 C7 2.1 10.2 3.2 12 5.8 C13.8 3.2 17 2.1 19.8 3.4 C23.2 5 23.6 9.6 20.8 12.6 Z';

/**
 * なかよし パネル（GOLD-1 §3.2・§3.3）。照準 の 下 の 案内 の すぐ 下。DOM: `#natsuki-panel`（`data-tone` = pink／gold）。
 * つなぎ込み: 毎ステップ `update(animals.natsukiView(ねらって いる id))`、出来事 を `onEvents(events, id)` に 流す。
 * 数（%）は 出さない。ハート 10 こ ＋ 70 の 上 の たまご の しるし ＋ まち時計（むし・手）。
 */
export class NatsukiPanel {
  readonly el: HTMLDivElement;
  private readonly hearts: SVGSVGElement[] = [];
  private readonly egg: HTMLElement;
  private readonly clocks: { bug: HTMLElement; pet: HTMLElement };
  private shown: NatsukiLook | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'natsuki-panel';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    const title = document.createElement('span');
    title.className = 'np-title';
    title.textContent = NATSUKI_TITLE;
    const meter = document.createElement('div');
    meter.className = 'np-meter';
    this.egg = document.createElement('img');
    this.egg.className = 'np-egg rk-art';
    (this.egg as HTMLImageElement).alt = '';
    (this.egg as HTMLImageElement).src = itemIconUrl('kin_tamago');
    this.egg.style.left = `${(NATSUKI_EGG_AT / NATSUKI_HEARTS) * 100}%`;
    const row = document.createElement('div');
    row.className = 'np-hearts';
    for (let i = 0; i < NATSUKI_HEARTS; i++) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.classList.add('np-heart');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', HEART_PATH);
      svg.append(path);
      row.append(svg);
      this.hearts.push(svg);
    }
    meter.append(this.egg, row);
    const clocks = document.createElement('div');
    clocks.className = 'np-clocks';
    this.clocks = { bug: this.makeClock('bug', itemIconUrl('mushi')), pet: this.makeClock('pet', animalIconUrl('hand')) };
    clocks.append(this.clocks.bug, this.clocks.pet);
    this.el.append(title, meter, clocks);
    parent.append(this.el);
  }

  private makeClock(kind: 'bug' | 'pet', src: string): HTMLElement {
    const c = document.createElement('div');
    c.className = `np-clock np-clock--${kind}`;
    const img = document.createElement('img');
    img.className = 'np-clock__art rk-art';
    img.alt = '';
    img.src = src;
    c.append(img);
    c.addEventListener('animationend', () => c.classList.remove('np-shake', 'np-pop'));
    return c;
  }

  /** 毎ステップ。null（ねらって いない・大人 の なかま で ない）で かくす */
  update(v: NatsukiView | null): void {
    const look = natsukiLook(v);
    const s = this.shown;
    if (s && same(s, look)) return;
    this.shown = look;
    this.el.hidden = look.hidden;
    if (look.hidden) return;
    this.el.dataset.tone = look.tone;
    this.egg.dataset.state = look.egg;
    this.hearts.forEach((h, i) => h.classList.toggle('np-heart--full', i < look.full));
    this.setClock(this.clocks.bug, look.bug);
    this.setClock(this.clocks.pet, look.pet);
  }

  private setClock(c: HTMLElement, v: { fill: number; ready: boolean }): void {
    c.dataset.ready = v.ready ? '1' : '0';
    c.style.setProperty('--p', v.fill.toFixed(3));
  }

  /** 出来事（まち中 の 返し・まち時計 が うまった・きんいろ に なった）から 動き を つける */
  onEvents(events: readonly AnimalEvent[], aimedId: number | null): void {
    const p = natsukiPulse(events, aimedId);
    for (const w of p.shake) restart(this.clocks[w], 'np-shake');
    for (const w of p.ready) restart(this.clocks[w], 'np-pop');
    if (p.gold) restart(this.el, 'np-flash');
  }
}

function restart(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function same(a: NatsukiLook, b: NatsukiLook): boolean {
  return (
    a.hidden === b.hidden && a.tone === b.tone && a.full === b.full && a.egg === b.egg &&
    a.bug.ready === b.bug.ready && Math.abs(a.bug.fill - b.bug.fill) < 0.004 &&
    a.pet.ready === b.pet.ready && Math.abs(a.pet.fill - b.pet.fill) < 0.004
  );
}

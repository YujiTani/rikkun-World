import { anyIconUrl } from './itemIcon';
import { PREP_BLOCK_COUNT, PREP_ICONS, prepDone, prepDots } from './prepModel';

/** 「じゅんびちゅう」のことば＋ブロック 5 こ の HTML（起動のボタンの中・遠くへもどるカードの中で 同じ） */
export function prepHtml(): string {
  const dots = [0, 1, 2].map((i) => `<span class="prep-dot" data-i="${i}">・</span>`).join('');
  const blocks = PREP_ICONS.map((id) => `<img class="prep-block" data-done="false" data-icon="${id}" alt="">`).join('');
  return `<span class="prep-text">じゅんびちゅう${dots}</span><span class="prep-blocks">${blocks}</span>`;
}

/** 入れ物（ボタンの字・カード）の中に 作る。1 回だけ（絵は あとで 入れる） */
export function mountPrep(host: HTMLElement): void {
  host.innerHTML = prepHtml();
  for (const img of host.querySelectorAll<HTMLImageElement>('img.prep-block')) img.src = anyIconUrl(img.dataset.icon as never);
}

/** 進みぐあい p と 時刻から、入れ物の中を合わせる（できた物は data-done="true"・「・」の数） */
export function syncPrep(host: HTMLElement, progress: number, nowMs: number): void {
  const done = prepDone(progress);
  const blocks = host.querySelectorAll<HTMLElement>('.prep-block');
  for (let i = 0; i < PREP_BLOCK_COUNT; i++) {
    const v = i < done ? 'true' : 'false';
    if (blocks[i] && blocks[i].dataset.done !== v) blocks[i].dataset.done = v;
  }
  const n = prepDots(nowMs);
  host.querySelectorAll<HTMLElement>('.prep-dot').forEach((d, i) => {
    const on = i < n ? 'on' : 'off';
    if (d.dataset.on !== on) d.dataset.on = on;
  });
}

/** 遠くへもどる・テレポートの待ちに出す小さなカード（画面のまん中） */
export class PrepCard {
  readonly el: HTMLDivElement;
  private shown = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'prep-card';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  update(show: boolean, progress: number, nowMs: number): void {
    if (show !== this.shown) {
      this.shown = show;
      this.el.hidden = !show;
      if (show) mountPrep(this.el);
      else this.el.textContent = '';
    }
    if (show) syncPrep(this.el, progress, nowMs);
  }

  visible(): boolean {
    return this.shown;
  }
}

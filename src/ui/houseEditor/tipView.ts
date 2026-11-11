// HOUSE-2A（#364）名前の ヘルプの ふきだし（画面）。仕様 §2.3・§3.2。DOM。
// 何を 出すかは 窓口 `editor().hoverTip`（house/recipes/hoverTip.ts。12 コマで 出る）。ここは 字を 出して カーソルの 近くへ 置く だけ。
// 押せない（pointer-events: none。CSS）・音 なし・マウスが うごく たびに ついて うごく（待ちなおさない）。
import { withRuby } from '../text';
import { el } from './dom';
import { tipPlace } from './tipPlace';

export interface TipData {
  id: string;
  lines: readonly string[];
}

export class TipView {
  readonly el = el('div', 'ed-tip');
  private key = '';
  private mx = 0;
  private my = 0;
  private w = 0;
  private h = 0;
  /** 画面の ふちの あき（--e-edge。出す たびに はかる） */
  private edge = 16;

  constructor() {
    this.el.hidden = true;
    this.el.dataset.testid = 'editor-hover-tip';
  }

  /** 出して いる か */
  get visible(): boolean {
    return !this.el.hidden;
  }

  /** マウスの 場所（画面の ピクセル）。出て いれば ついて うごく */
  moveTo(x: number, y: number): void {
    this.mx = x;
    this.my = y;
    this.place();
  }

  /** 出して いる ヘルプを 窓口に あわせる（かわった ときだけ DOM を さわる） */
  sync(tip: TipData | null): void {
    const key = tip === null ? '' : `${tip.id}|${tip.lines.join('/')}`;
    if (key === this.key) return;
    this.key = key;
    if (tip === null) {
      this.el.hidden = true;
      return;
    }
    this.el.replaceChildren(...tip.lines.map((t) => el('div', 'ed-tip__line', withRuby(t))));
    this.el.hidden = false;
    this.w = this.el.offsetWidth;
    this.h = this.el.offsetHeight;
    this.edge = parseFloat(getComputedStyle(this.el).getPropertyValue('--e-edge')) || 16;
    this.place();
  }

  /** カーソルの 近く・画面の ふち（エディターの ふち ＝ --e-edge）で 止める */
  private place(): void {
    if (this.el.hidden) return;
    const p = tipPlace(this.mx, this.my, this.w, this.h, window.innerWidth, window.innerHeight, this.edge);
    this.el.style.left = `${p.x}px`;
    this.el.style.top = `${p.y}px`;
  }
}

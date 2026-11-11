import { DEATH_TEXT, DeathScreenModel, lanternFacePixels } from './deathScreenModel';
import { drawPixels } from './itemIcon';
import { halfId } from './duoHalfIds';
import { createBar, setBar, type BarParts } from './theme';
import './deathScreen.css';

/** やられた画面（白くなる・かお・文字）。start() / end() と、毎ステップ update(dt) */
export class DeathScreen {
  readonly model = new DeathScreenModel();
  readonly el: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly bar: BarParts;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'death-screen';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    this.content = document.createElement('div');
    this.content.className = 'death-content';
    const face = document.createElement('canvas');
    face.className = 'death-face';
    drawPixels(face, lanternFacePixels());
    this.text = document.createElement('div');
    this.text.className = 'death-text';
    this.text.textContent = DEATH_TEXT;
    this.bar = createBar('xp', 0);
    this.bar.root.classList.add('death-bar');
    this.content.append(face, this.text, this.bar.root);
    this.el.append(this.content);
    parent.append(this.el);
  }

  /** 2 人の あいだ だけ UI 検査の 目印を つける（1P の 半分の 白い 画面。2P の 分は ない〔2P は duo-p2-down〕。COOP-1 5f-2 #16） */
  mark(on: boolean): void {
    if (on) this.el.setAttribute('data-testid', halfId('death', 1));
    else this.el.removeAttribute('data-testid');
  }

  start(): void {
    this.model.start();
    this.sync();
  }
  end(): void {
    this.model.end();
    this.sync();
  }
  update(dt: number): void {
    this.model.update(dt);
    this.sync();
  }

  private sync(): void {
    const m = this.model;
    this.el.hidden = !m.active();
    const w = m.white();
    this.el.style.setProperty('--white', String(w));
    this.el.dataset.white = w.toFixed(3);
    this.content.hidden = !m.showText();
    setBar(this.bar, 1 - m.progress());
    this.content.style.opacity = String(Math.min(1, w / 0.6));
  }
}

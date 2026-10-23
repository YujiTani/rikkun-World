import { handsUrl } from './itemArtLive3';
import './itadakimasu.css';

/**
 * LIVE-3: 「いのち を いただきます」の 画面（docs/design/LIVE-3.md §2.4）。まん中 に あわせ手 の 絵 と 大きな 字。
 * 80 ステップ 目 から 20 ステップ で ふわっと 出て、200 から 20 ステップ で ふわっと 消える。毎ステップ `update(animals.meatSay())`。
 * 押せない（pointer-events: none）。字 は ひらがな（漢字 を 使う ときは ruby()）。
 */
export const ITADAKIMASU_TEXT = 'いのち を いただきます';

export class Itadakimasu {
  readonly el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'itadakimasu';
    this.el.hidden = true;
    const img = document.createElement('img');
    img.className = 'itadakimasu-hands';
    img.alt = '';
    img.src = handsUrl();
    const text = document.createElement('div');
    text.className = 'itadakimasu-text';
    text.textContent = ITADAKIMASU_TEXT;
    const glow = document.createElement('div');
    glow.className = 'itadakimasu-glow';
    glow.append(img);
    this.el.append(glow, text);
    parent.append(this.el);
  }

  /** `fade` = ふわっと 度 0〜1（null = 出さない） */
  update(fade: number | null): void {
    if (fade === null) {
      if (!this.el.hidden) {
        this.el.hidden = true;
        this.el.style.opacity = '';
      }
      return;
    }
    this.el.hidden = false;
    this.el.style.opacity = String(Math.max(0, Math.min(1, fade)));
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** 窓口 `ui.meatText()`: 出て いる 文（出て いなければ 空） */
  text(): string {
    return this.el.hidden ? '' : ITADAKIMASU_TEXT;
  }
}

import { handsUrl } from './itemArtLive3';
import './itadakimasu.css';

/**
 * LIVE-3 仮（見た目 の 確かめ だけ）: 「いのち を いただきます」の 画面。まん中 に あわせ手 の 絵 と 大きな 字。
 * 出す・消す 流れ（メニュー → とびら → 一言 140 ステップ）は これから。いまは show / hide だけ。
 * 字は ひらがな（漢字 を 使う ときは ruby()）。
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
    this.el.append(img, text);
    parent.append(this.el);
  }

  setVisible(on: boolean): void {
    this.el.hidden = !on;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }
}

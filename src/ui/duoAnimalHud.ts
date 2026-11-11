import type { AnimalEvent, NatsukiView } from '../contracts';
import type { FocusDir } from './menu/focusNav';
import { PadNav } from './menu/padNav';
import { AnimalHint } from './animalHint';
import { CoopMenu, type CoopMenuOptions } from './coopMenu';
import type { CoopMenuModel } from './coopMenuModel';
import { Itadakimasu } from './itadakimasu';
import { NatsukiPanel } from './natsukiPanel';
import './duoAnimalHud.css';

/**
 * COOP-1 5c（docs/design/COOP-1.md §3.7 (d)）: 2P の 半分に 出す にわとりの 画面。1P の 部品と 同じ 物の 2 つ目:
 *   合図の チップ（`duo-animal-hint-p2`）・なつきの パネル（`duo-natsuki-p2`）・だっこの わ（`duo-carry-ring-p2`）・
 *   いただきます の 一言（`#itadakimasu-p2`）・とりごやの メニュー（`duo-coop-menu-p2`。パッドの 十字で えらぶ）。
 * 置き場は duoAnimalHud.css（2 人の とき 1P の 物も 1P の 半分の 中）。2P が 参加して いる あいだ だけ 作り、やめたら `dispose()`。
 * メニューの 中身（ひらく・とじる・押す）は 核 `duo/p2CoopMenu.ts` の モデル。ここは 絵と 十字の えらびだけ。
 */
export class DuoAnimalHud {
  readonly hint: AnimalHint;
  readonly panel: NatsukiPanel;
  readonly meat: Itadakimasu;
  readonly menu: CoopMenu;
  private readonly nav: PadNav;
  private readonly ring: HTMLDivElement;
  private ringP = 0;
  private menuVersion = -1;
  private menuOpen = false;

  constructor(parent: HTMLElement, model: CoopMenuModel, view: CoopMenuOptions) {
    this.hint = new AnimalHint(parent, '-p2', 2);
    this.hint.el.setAttribute('data-testid', 'duo-animal-hint-p2');
    this.panel = new NatsukiPanel(parent, '-p2');
    this.panel.el.setAttribute('data-testid', 'duo-natsuki-p2');
    this.meat = new Itadakimasu(parent, '-p2');
    this.ring = document.createElement('div');
    this.ring.id = 'duo-carry-ring-p2';
    this.ring.setAttribute('data-testid', 'duo-carry-ring-p2');
    this.ring.setAttribute('aria-hidden', 'true');
    this.ring.hidden = true;
    parent.append(this.ring);
    this.menu = new CoopMenu(parent, view, model, { testid: 'duo-coop-menu-p2', p2: true });
    // 十字の えらび: 見た目の 位置から（4a の 2P の もちもの画面と 同じ PadNav）。disabled の ボタンは えらばない
    this.nav = new PadNav(this.menu.el, (el) => (el instanceof HTMLButtonElement && el.disabled ? null : (el.dataset.pad ?? null)));
  }

  /** 毎ステップ: だっこの わ（0〜1。0 で かくす）・なつきの パネル・チップの 時間・一言・メニューの 絵 */
  step(ring: number, natsuki: NatsukiView | null, meatSay: number | null): void {
    this.setRing(ring);
    this.panel.update(natsuki);
    this.hint.step();
    this.meat.update(meatSay);
    this.syncMenu();
  }

  /** 2P の 出来事（`by: 2`）から チップを 出す／なつきの パネルに 動きを つける */
  feed(events: readonly AnimalEvent[], aimedId: number | null): void {
    this.hint.feed(events);
    this.panel.onEvents(events, aimedId);
  }

  /** メニューの 絵を 核に 合わせる。ひらいた ばかりは はじめの 物を えらぶ、ページが かわったら 消えた 物を えらびなおす */
  syncMenu(): void {
    const open = this.menu.model.info().open;
    this.menu.sync();
    if (!open) {
      if (this.menuOpen) this.nav.clear();
      this.menuOpen = false;
      this.menuVersion = -1;
      return;
    }
    if (!this.menuOpen) {
      this.menuOpen = true;
      this.menuVersion = this.menu.model.version;
      this.nav.reset();
    } else if (this.menuVersion !== this.menu.model.version) {
      this.menuVersion = this.menu.model.version;
      this.nav.sync();
    }
  }

  /** 十字 1 回 */
  padMove(dir: FocusDir): void {
    this.nav.move(dir);
  }

  /** いま えらんで いる 物の 名前（coopPadNames の 名前）。なければ null */
  padFocus(): string | null {
    return this.nav.current();
  }

  private setRing(p: number): void {
    const v = p > 0 ? Math.min(1, p) : 0;
    if (Math.abs(v - this.ringP) < 0.004) return;
    this.ringP = v;
    this.ring.hidden = v <= 0;
    this.ring.style.setProperty('--p', v.toFixed(3));
  }

  dispose(): void {
    this.hint.el.remove();
    this.panel.el.remove();
    this.meat.el.remove();
    this.ring.remove();
    this.menu.dispose();
  }
}

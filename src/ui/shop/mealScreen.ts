import { FOOD_TABLE, type FoodKind } from '../../town/vendor/vendorTable';
import type { VendorView } from '../../town/vendor/vendorDesk';
import { MEAL_TEXT, VENDOR_TEXT } from '../../town/vendor/vendorText';
import { withRuby } from '../text';
import { mealIconUrl } from './mealArt';
import { orbImg } from './vendorScreen';
import './mealScreen.css';

/**
 * 食事の 画面（TOWN-1-shop §2.13・§3.2〔1E〕）: やたいの 人の ふきだし（2 行まで）の 下に ボタン 2 つ（「たべる」＝ 食べ物の 絵 ＋ 字 ＋ ようかいダマの 絵 ＋ ねだん、「✕ とじる」）。
 * 1 人 ＝ まん中、2 人 ＝ 開いた 人の 半分。data-testid は meal-screen（data-kind）・meal-bubble・meal-buy（aria-disabled）・meal-close（e2e/town1e.spec.ts の 頭）。
 */
export interface MealScreenPorts {
  view(): VendorView;
  /** 変わった 目印 */
  key(): string;
  half(): boolean;
  /** たべられるか（まんたん・たりない・食べて いる ときは false） */
  canEat(kind: FoodKind): boolean;
  eat(): void;
  close(): void;
}

export class MealScreen {
  readonly el: HTMLDivElement;
  private shown = '';

  constructor(
    private readonly parent: HTMLElement,
    owner: 1 | 2,
    private readonly p: MealScreenPorts,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'meal';
    this.el.dataset.testid = 'meal-screen';
    this.el.dataset.owner = String(owner);
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.el.addEventListener('mouseup', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  sync(open: boolean): void {
    const v = this.p.view();
    if (!open || v.meal === null) {
      if (this.el.isConnected) {
        this.el.remove();
        this.el.innerHTML = '';
        this.shown = '';
      }
      return;
    }
    const key = this.p.key();
    if (key === this.shown && this.el.isConnected) return;
    this.shown = key;
    if (!this.el.isConnected) this.parent.append(this.el);
    this.el.dataset.layout = this.p.half() ? 'half' : 'full';
    this.el.dataset.kind = v.meal;
    this.el.innerHTML = this.html(v, v.meal);
  }

  private onClick(e: MouseEvent): void {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-testid]')?.dataset.testid;
    if (id === 'meal-buy') this.p.eat();
    else if (id === 'meal-close') this.p.close();
    else return;
    this.shown = '';
    this.sync(true);
  }

  private html(v: VendorView, kind: FoodKind): string {
    const can = this.p.canEat(kind);
    const food = kind === 'dango' ? MEAL_TEXT.dangoFood : MEAL_TEXT.gohanFood;
    const bubble = v.bubble ?? MEAL_TEXT.greet;
    return (
      `<div class="meal-say"><span class="meal-name">${withRuby(MEAL_TEXT[kind])}</span>` +
      `<p class="meal-bubble${v.warn ? ' is-warn' : ''}" data-testid="meal-bubble">${withRuby(bubble)}</p></div>` +
      `<div class="meal-buttons">` +
      `<button type="button" class="meal-buy" data-testid="meal-buy" aria-disabled="${can ? 'false' : 'true'}" aria-label="${food} ${MEAL_TEXT.eat}">` +
      `<img class="meal-food" src="${mealIconUrl(kind)}" alt="" draggable="false"><span class="meal-word">${MEAL_TEXT.eat}</span>` +
      `<span class="meal-price">${orbImg('meal-orb')}<b>${FOOD_TABLE[kind].price}</b></span></button>` +
      `<button type="button" class="meal-close" data-testid="meal-close" aria-label="${VENDOR_TEXT.close}">${MEAL_TEXT.close}</button>` +
      `</div>`
    );
  }

  dispose(): void {
    this.el.remove();
  }
}

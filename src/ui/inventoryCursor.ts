import type { ItemStack } from '../contracts';
import { CursorAnchor } from './inventoryDuo';
import { itemIconUrl } from './itemIcon';

export interface HeldCursorHost {
  frame: HTMLElement;
  /** 2 人用の 形か */
  duo(): boolean;
  /** 手に もっている 物を 出す 目じるしの 要素（無ければ マウスの 場所） */
  anchorEl(mouseX: number, mouseY: number): HTMLElement | null;
}

/** 手に もっている 物（つかんだ 物）の 絵。1 人の ときは マウスに ついていく。2 人用は えらんでいる マスの 右上（§3.3） */
export class HeldCursor {
  readonly el: HTMLDivElement;
  mouseX = 0;
  mouseY = 0;
  private readonly icon: HTMLImageElement;
  private readonly count: HTMLSpanElement;
  private readonly name: HTMLDivElement;
  private nameHtml = '';
  private readonly anchor = new CursorAnchor();

  constructor(private readonly host: HeldCursorHost) {
    this.el = document.createElement('div');
    this.el.className = 'inv-cursor';
    this.el.hidden = true;
    this.icon = document.createElement('img');
    this.icon.alt = '';
    this.count = document.createElement('span');
    this.count.className = 'slot-count';
    this.name = document.createElement('div');
    this.name.className = 'inv-cursor-name';
    this.name.hidden = true;
    this.el.append(this.icon, this.count, this.name);
  }

  get shown(): boolean {
    return !this.el.hidden;
  }

  /** 描きなおした・大きさが かわった（場所を 測りなおす） */
  invalidate(): void {
    this.anchor.invalidate();
  }

  /** nameHtml = つかんだ 物の 名前（ふりがなつきの html。絵の 下の 小さな 札） */
  show(stack: ItemStack | null, nameHtml = ''): void {
    this.el.hidden = !stack;
    if (!stack) return;
    if (nameHtml !== this.nameHtml) {
      this.nameHtml = nameHtml;
      this.name.innerHTML = nameHtml;
    }
    this.name.hidden = nameHtml === '';
    this.icon.src = itemIconUrl(stack.item);
    this.count.textContent = stack.count >= 2 ? String(stack.count) : '';
    this.place();
  }

  place(): void {
    let x = this.mouseX - 24;
    let y = this.mouseY - 24;
    if (this.host.duo() && this.anchor.place(this.host.anchorEl(this.mouseX, this.mouseY), this.host.frame)) {
      x = this.anchor.x;
      y = this.anchor.y;
    }
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }
}

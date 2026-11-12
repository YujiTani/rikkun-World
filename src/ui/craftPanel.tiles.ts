// 「つくる」「やく」の カード（マス）1 まいの 作りと 塗りなおし。DOM だけ（craftPanel.ts から 分けた。HOUSE-2C・ファイルの 長さ）
import type { Recipe } from '../contracts';
import { itemRarity } from '../drops/rarity';
import type { TileView } from './craftModel';
import { el } from './craftPanel.fx';
import { itemCategory, rarityIndex } from './itemCategory';
import { extraIconUrl, itemIconUrl } from './itemIcon';
import { createBar, createSlot, setBar } from './theme';

export interface TileEls {
  root: HTMLDivElement;
  art: HTMLImageElement;
  count: HTMLSpanElement;
  queue: HTMLSpanElement;
  barFill: ReturnType<typeof createBar>;
  recipe: Recipe;
  /** 今 絵に している アイテム（案を えらぶと かわる） */
  item: string;
}

export interface TileHandlers {
  hover(id: string | null): void;
  /** マウスが はなれた とき（今 せつめいに 出ている のが この マスの ときだけ 消す） */
  leave(id: string): void;
  click(id: string): void;
}

/** 絵・色分けを アイテムに 合わせる（色分け §3.5 (7): 背景 ＝ カテゴリーの色、ふち ＝ めずらしさ） */
function paintItem(e: TileEls, item: string): void {
  e.item = item;
  e.art.src = itemIconUrl(item as never);
  e.root.dataset.cat = itemCategory(item as never);
  e.root.dataset.rarity = String(rarityIndex(itemRarity(item as never)));
}

export function makeTile(r: Recipe, on: TileHandlers): TileEls {
  const slot = createSlot({ art: itemIconUrl(r.output.item) });
  const root = slot.root;
  root.classList.add('cp-tile');
  root.dataset.menuItem = ''; // コントローラーの 十字で 動ける（もちものの マスと おなじ）
  root.tabIndex = 0;
  root.dataset.id = r.id;
  root.dataset.station = r.station;
  root.dataset.works = String(r.works);
  const made = el('span', 'cp-made', root);
  made.textContent = '✓';
  el('span', 'cp-later', root).style.backgroundImage = `url(${extraIconUrl('clock')})`;
  const mark = el('span', 'cp-mark', root);
  mark.textContent = '▼';
  const queue = el('span', 'card-queue cp-queue', root);
  const barFill = createBar('bake', 0);
  barFill.root.classList.add('cp-bar');
  barFill.root.hidden = true;
  root.append(barFill.root);
  root.addEventListener('mouseenter', () => on.hover(r.id));
  root.addEventListener('mouseleave', () => on.leave(r.id)); // 十字で 別の マスに 来たあとの 古い mouseleave で 消さない
  // 十字で マスに フォーカスが 来たら、マウスを 合わせたのと おなじに せつめいを 切りかえる。blur では 消さない（せつめい パネルへ 十字で 移っても 直前の マスの せつめいの まま）
  root.addEventListener('focus', () => on.hover(r.id));
  root.addEventListener('click', (ev) => {
    ev.stopPropagation();
    on.click(r.id);
  });
  const e: TileEls = { root, art: slot.art, count: slot.count, queue, barFill, recipe: r, item: r.output.item };
  paintItem(e, r.output.item);
  return e;
}

/** 1 まいを 今の 見た目に（progress ＝ やいている 進み・なければ null） */
export function paintTile(e: TileEls, t: TileView, progress: number | null): void {
  const r = e.root;
  if (e.item !== t.item) paintItem(e, t.item); // 案を えらんだ とき だけ 絵を かえる
  r.dataset.glow = String(t.glowing);
  r.dataset.dim = String(t.dim);
  r.dataset.made = String(t.made);
  r.dataset.later = String(t.later);
  r.dataset.selected = String(t.selected);
  e.count.textContent = t.count >= 2 ? `×${t.count}` : '';
  e.queue.textContent = t.queued > 0 ? `あと ${t.queued}` : '';
  e.barFill.root.hidden = progress === null;
  if (progress !== null) setBar(e.barFill, progress);
}

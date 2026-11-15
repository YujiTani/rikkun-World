import { itemType } from '../../inventory/items';
import type { KaitoriRowView, KaitoriState } from '../../town/vendor/kaitori';
import type { SmithItem } from '../../town/vendor/smith';
import { SMITH_TEXT, STALL_TEXT } from '../../town/vendor/vendorText';
import { itemIconUrl } from '../itemIcon';
import { withRuby } from '../text';
import { orbImg, type VendorCardView, type VendorDetailView } from './vendorScreen';

/**
 * かじやさん・かいとりの やたいの カードと 右の 帯の 中身（TOWN-1-shop §2.11・§2.12・§3.2〔1E〕）。DOM は 作らず html の 文字だけ。
 * かじや ＝ たいきゅうの バー ＋ ようかいダマの 絵 ＋ ねだん、やたい ＝「10 →」と ようかいダマの 絵 ＋「1」。
 */

/** バーの 色の さかい（のこりの わりあい。これ 未満は 赤 → きいろ → みどり） */
const BAR_LOW = 1 / 3;
const BAR_MID = 2 / 3;

const nameOf = (item: string): string => itemType(item as Parameters<typeof itemType>[0])?.name ?? item;

function bar(left: number, max: number): string {
  const r = max > 0 ? Math.max(0, Math.min(1, left / max)) : 0;
  const cls = r < BAR_LOW ? '' : r < BAR_MID ? ' is-mid' : ' is-hi';
  return `<span class="vendor-bar${cls}"><span style="width:${Math.round(r * 100)}%"></span></span>`;
}

const price = (n: number): string => `<span class="vendor-rate-get">${orbImg('shop-orb')}<b>${n}</b></span>`;

/** かじやの カード（slot の 文字が id） */
export function smithCards(items: readonly SmithItem[]): VendorCardView[] {
  return items.map((i) => ({ id: String(i.slot), icon: itemIconUrl(i.item), can: i.canFix, body: bar(i.durability, i.max) + price(i.price) }));
}

/** かじやの 右の 帯 */
export function smithDetail(i: SmithItem): VendorDetailView {
  return {
    icon: itemIconUrl(i.item),
    name: nameOf(i.item),
    info: `<div class="vendor-big-bar"><span>${withRuby(SMITH_TEXT.durability)} <b>${i.durability}</b> / <b>${i.max}</b></span>${bar(i.durability, i.max)}</div>`,
    pay: withRuby(SMITH_TEXT.pay(i.price)),
    can: i.canFix,
  };
}

/** やたいの カード（物の id が id）。上限に とどいた 日は みんな 灰色 */
export function stallCards(st: KaitoriState): VendorCardView[] {
  return st.rows.map((r) => ({
    id: r.item,
    icon: itemIconUrl(r.item),
    can: r.canGive,
    body: `<span class="vendor-rate"><span>${r.need} →</span>${price(1)}</span>`,
  }));
}

/** やたいの 右の 帯 */
export function stallDetail(r: KaitoriRowView, st: KaitoriState): VendorDetailView {
  return {
    icon: itemIconUrl(r.item),
    name: nameOf(r.item),
    info: `<p class="vendor-info">${withRuby(STALL_TEXT.have(r.have))}<br>${withRuby(STALL_TEXT.left(Math.max(0, st.cap - st.today)))}</p>`,
    pay: withRuby(STALL_TEXT.rate(r.need)),
    can: r.canGive,
  };
}

/** 書きなおしの 目印（数が かわれば ちがう 文字） */
export function smithKey(items: readonly SmithItem[]): string {
  let k = '';
  for (const i of items) k += `${String(i.slot)}:${i.durability}:${i.canFix ? 1 : 0};`;
  return k;
}

export function stallKey(st: KaitoriState): string {
  let k = `${st.today}/${st.cap};`;
  for (const r of st.rows) k += `${r.item}:${r.have}:${r.canGive ? 1 : 0};`;
  return k;
}

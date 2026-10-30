// HOUSE-1B 試作: 画面を 作る 小さな 道具（要素・ボタン・えらんだ しるし・タイルの 絵の data URL）。
import { ICONS } from './icons';
import { houseTiles, type HouseTile } from './houseLook';
import type { Px } from './tilePaint';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export interface BtnOpts {
  cls?: string;
  /** 中身（HTML。ひらがな・カタカナ。漢字は ない） */
  html: string;
  testid?: string;
  onClick: () => void;
}

export function btn(o: BtnOpts): HTMLButtonElement {
  const b = el('button', o.cls ? `ed-btn ${o.cls}` : 'ed-btn', o.html);
  b.type = 'button';
  if (o.testid) b.dataset.testid = o.testid;
  b.addEventListener('click', o.onClick);
  return b;
}

/** えらんで いる しるし（色 ＋ 太い ふち は CSS の .is-sel、✓ は ここで 足す・外す） */
export function markSel(b: HTMLElement, on: boolean): void {
  b.classList.toggle('is-sel', on);
  const tick = b.querySelector(':scope > .ed-btn__tick');
  if (on && !tick) b.append(el('span', 'ed-btn__tick', ICONS.check));
  if (!on && tick) tick.remove();
}

/** うすい（押せない）ように 見せる。disabled には しない（押すと ふきだしが 出る ボタン用） */
export function setOff(b: HTMLButtonElement, off: boolean, hard = false): void {
  b.classList.toggle('is-off', off);
  if (hard) b.disabled = off;
}

/** 16×16 の 絵 → data URL。turns ＝ 時計まわりに 90 度 まわす 回数 */
function tileUrl(px: Px, turns = 0): string {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d')!;
  const img = g.createImageData(16, 16);
  for (let i = 0; i < 256; i++) {
    const v = px[i]!;
    img.data[i * 4] = (v >> 16) & 255;
    img.data[i * 4 + 1] = (v >> 8) & 255;
    img.data[i * 4 + 2] = v & 255;
    img.data[i * 4 + 3] = 255;
  }
  if (turns === 0) {
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  const src = document.createElement('canvas');
  src.width = 16;
  src.height = 16;
  src.getContext('2d')!.putImageData(img, 0, 0);
  g.translate(8, 8);
  g.rotate((turns * Math.PI) / 2);
  g.drawImage(src, -8, -8);
  return c.toDataURL('image/png');
}

/** 方眼の ゆか・かべの 帯に 使う 絵（見本の 家と 同じ 絵）。窓・戸の 印は marks.ts の SVG */
export interface TileUrls {
  floor: string;
  /** よこの 帯（まえ・うしろ）用・たての 帯（ひだり・みぎ）用 */
  wallH: string;
  wallV: string;
}

export function makeTileUrls(): TileUrls {
  const t: Record<HouseTile, Px> = houseTiles();
  return {
    floor: tileUrl(t.house_floor),
    wallH: tileUrl(t.house_wall),
    wallV: tileUrl(t.house_wall, 1),
  };
}

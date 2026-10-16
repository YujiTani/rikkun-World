import type { LogCategory } from '../../contracts';
import { drawPixels } from '../itemIcon';
import { categoryIconPixels, categoryInfo, scrollIconPixels } from './categoryIcons';
import './logMark.css';

type Rgba = [number, number, number, number];

function toRgba(px: readonly (string | null)[]): Rgba[] {
  return px.map((c) => (c ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255] : [0, 0, 0, 0]));
}

const cache = new Map<string, string>();

function urlOf(key: string, px: () => (string | null)[]): string {
  let url = cache.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    drawPixels(c, toRgba(px()));
    url = c.toDataURL();
    cache.set(key, url);
  }
  return url;
}

/** カテゴリーの印の絵（data URL。DOM のある所でだけ呼ぶ） */
export function categoryIconUrl(cat: LogCategory): string {
  return urlOf(`cat:${cat}`, () => categoryIconPixels(cat));
}

/** できごと タブの まきもの の絵 */
export function scrollIconUrl(): string {
  return urlOf('scroll', scrollIconPixels);
}

/** カテゴリーの印（32px）。`[data-cat]`・`[data-shape]` を持つ */
export function createCategoryMark(cat: LogCategory): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'log-mark rk-art';
  img.alt = '';
  img.src = categoryIconUrl(cat);
  img.dataset.cat = cat;
  img.dataset.shape = categoryInfo(cat).shape;
  return img;
}

/** できごと タブの ボタン（もちもの画面の 上のタブ。まきもの の絵 ＋ 字）。高さは `.rk-tab` のまま（56px 以上） */
export function createLogTabIcon(): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'log-tab-art rk-art';
  img.alt = '';
  img.src = scrollIconUrl();
  return img;
}

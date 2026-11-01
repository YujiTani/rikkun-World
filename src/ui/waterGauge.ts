import { M7_SETTING_DEFAULTS, type ItemId, type ItemStack } from '../contracts';
import { BUCKET_TAKE, WATER_BUCKET_ID } from '../world/blocks/water';
import './waterGauge.css';

/**
 * みず の 棒（M7-2 §3.2 (4)）。じょうろ 2 しゅるい の マス の 下に いつも 出す。
 * はば = のこり ÷ 入る回数。からっぽ は 背景（わく）だけ。マス（`.slot` / `.rk-slot`）の 下はし、高さ 6px。
 */

/** 入る 回数（設定 `farmCanCapacity` の 初期値。つなぎ込みが `setWaterCapacity` で live の 設定 を つなげる） */
let source: () => Readonly<Partial<Record<ItemId, number>>> = () => M7_SETTING_DEFAULTS.farmCanCapacity;

export function setWaterCapacity(src: () => Readonly<Partial<Record<ItemId, number>>>): void {
  source = src;
}

export interface WaterView {
  max: number;
  water: number;
  /** 0〜1 */
  ratio: number;
}

/** マス の 中身 から 棒 の 値。じょうろ で なければ null */
export function waterView(stack: ItemStack | null): WaterView | null {
  if (!stack || stack.count <= 0) return null;
  // WATER-1 §6.2: みずの バケツ。はば = 量 ÷ 8(欄 なしは 8)
  if (stack.item === WATER_BUCKET_ID) {
    const water = Math.max(0, Math.min(BUCKET_TAKE, Math.floor(stack.water ?? BUCKET_TAKE)));
    return { max: BUCKET_TAKE, water, ratio: water / BUCKET_TAKE };
  }
  const max = source()[stack.item];
  if (typeof max !== 'number' || !(max > 0)) return null;
  const water = Math.max(0, Math.min(max, Math.floor(stack.water ?? 0)));
  return { max, water, ratio: water / max };
}

interface WaterEls {
  bar: HTMLDivElement;
  fill: HTMLDivElement;
}
const els = new WeakMap<HTMLElement, WaterEls>();

function ensure(root: HTMLElement): WaterEls {
  let e = els.get(root);
  if (!e) {
    const bar = document.createElement('div');
    bar.className = 'water-gauge';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('div');
    fill.className = 'water-gauge__fill';
    bar.append(fill);
    e = { bar, fill };
    els.set(root, e);
  }
  return e;
}

/** マス に 棒 を 反映（じょうろ で なければ 取りのぞく）。要素は 1 マス に 1 組 だけ 作って 使いまわす */
export function paintWater(root: HTMLElement, stack: ItemStack | null): WaterView | null {
  const v = waterView(stack);
  if (!v) {
    const e = els.get(root);
    if (e) e.bar.remove();
    delete root.dataset.water;
    return null;
  }
  const e = ensure(root);
  if (e.bar.parentElement !== root) root.append(e.bar);
  e.bar.dataset.water = String(v.water);
  e.bar.dataset.max = String(v.max);
  e.fill.style.width = `${(v.ratio * 100).toFixed(2)}%`;
  root.dataset.water = v.water > 0 ? 'some' : 'empty';
  return v;
}

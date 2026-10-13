import { W2_SETTING_DEFAULTS, type Durability, type ItemId, type ItemStack } from '../contracts';
import './wearGauge.css';

/**
 * たいきゅう ゲージ（WEAPON-2 §3.6）。たいきゅうで へる 道具が 入った マスの 下に いつも 出す（新品でも）。
 * 色: のこり 60% 以上 = みどり、30% 以上 = き、30% 未満 = あか。のこり わずか（10% 以下・切り上げ）は 左上に「！」。
 * 新品の 値の 表は 設定 `toolDurability`。つなぎ込みが `setWearSettings(() => w2Settings)` で つなぐ（つながない間は 初期値）。
 */

export type WearTier = 'ok' | 'mid' | 'low';

export interface WearSettingsView {
  toolDurability: Partial<Record<ItemId, number>>;
  wearLowRatio: number;
}

let source: () => WearSettingsView = () => W2_SETTING_DEFAULTS;

/** 設定の 入れ物を つなぐ（`settings.set` で かえたら すぐ 効くよう 同じ オブジェクトを 返す関数を わたす） */
export function setWearSettings(src: () => WearSettingsView): void {
  source = src;
}

export interface WearView {
  max: number;
  left: number;
  /** 0〜1 */
  ratio: number;
  tier: WearTier;
  /** のこり わずか（「！」を 出す） */
  low: boolean;
}

const EPS = 1e-9;

/** のこり ÷ 新品 から 色の 段 */
export function wearTier(ratio: number): WearTier {
  if (ratio >= 0.6 - EPS) return 'ok';
  if (ratio >= 0.3 - EPS) return 'mid';
  return 'low';
}

/** のこり わずか か（`wearLowRatio` 以下。切り上げ: 250 → 25 以下、59 → 6 以下） */
export function isWearLow(left: number, max: number, lowRatio: number): boolean {
  return left <= Math.ceil(max * lowRatio - EPS);
}

/** マスの 中身から ゲージの 値を 作る。たいきゅうで へらない もの・からっぽは null。`d` が あれば それを 使う */
export function wearView(stack: ItemStack | null, d?: Durability | null): WearView | null {
  if (!stack || stack.count <= 0) return null;
  const s = source();
  let max: number;
  let left: number;
  if (d) {
    max = d.max;
    left = d.left;
  } else {
    const m = s.toolDurability[stack.item];
    if (typeof m !== 'number' || !(m > 0)) return null;
    max = m;
    left = m - Math.max(0, stack.wear ?? 0);
  }
  if (!(max > 0)) return null;
  left = Math.max(0, Math.min(max, left));
  const ratio = left / max;
  return { max, left, ratio, tier: wearTier(ratio), low: isWearLow(left, max, s.wearLowRatio) };
}

interface WearEls {
  gauge: HTMLDivElement;
  fill: HTMLDivElement;
  mark: HTMLSpanElement;
}

const els = new WeakMap<HTMLElement, WearEls>();

function ensure(root: HTMLElement): WearEls {
  let e = els.get(root);
  if (!e) {
    const gauge = document.createElement('div');
    gauge.className = 'wear-gauge';
    gauge.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('div');
    fill.className = 'wear-gauge__fill';
    gauge.append(fill);
    const mark = document.createElement('span');
    mark.className = 'wear-low-mark';
    mark.textContent = '!';
    mark.setAttribute('aria-hidden', 'true');
    e = { gauge, fill, mark };
    els.set(root, e);
  }
  return e;
}

/**
 * マス（`.slot` / `.rk-slot`）に ゲージと「！」を 反映する。たいきゅうの 道具が 入っていなければ 取りのぞく。
 * 毎回 new しない（要素は 1 マスに 1 組だけ 作って 使いまわす）。
 */
export function paintWear(root: HTMLElement, stack: ItemStack | null, d?: Durability | null): WearView | null {
  const v = wearView(stack, d);
  if (!v) {
    const e = els.get(root);
    if (e) {
      e.gauge.remove();
      e.mark.remove();
    }
    delete root.dataset.wear;
    delete root.dataset.wearlow;
    return null;
  }
  const e = ensure(root);
  if (e.gauge.parentElement !== root) root.append(e.gauge);
  e.gauge.dataset.tier = v.tier;
  e.gauge.dataset.left = String(v.left);
  e.gauge.dataset.max = String(v.max);
  e.fill.style.width = `${(v.ratio * 100).toFixed(2)}%`;
  root.dataset.wear = v.tier;
  if (v.low) {
    if (e.mark.parentElement !== root) root.append(e.mark);
    root.dataset.wearlow = 'true';
  } else {
    e.mark.remove();
    delete root.dataset.wearlow;
  }
  return v;
}

/** マスの 並びの へった 量の 合い言葉（かわったら 描きなおす目印。文字列は 作らず 数だけ） */
export function wearSignature(slots: ReadonlyArray<ItemStack | null>, from = 0, to = slots.length): number {
  let h = 0;
  for (let i = from; i < to; i++) {
    const w = slots[i]?.wear ?? 0;
    h = (h * 31 + w + 1 + i) % 2147483647;
  }
  return h;
}

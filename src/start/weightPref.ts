// START-1 §4.4: おもさ（かるい・ふつう・きれい）。この パソコンの 設定（localStorage `rikkun.weight.v1`）。
import { decideShadowStart, type ShadowStart } from '../world/render/shadow/shadowPref';
import { DEFAULT_MICRO_R, decideMicroR } from '../world/render/voxel/tier';
import { RING_FULL, RING_SMALL, decideRing, type RingSpec } from '../world/stream/ring';

export const WEIGHT_STORAGE_KEY = 'rikkun.weight.v1';
export type Weight = 'light' | 'normal' | 'fine';
export const WEIGHTS: readonly Weight[] = ['light', 'normal', 'fine'];

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isWeight = (v: unknown): v is Weight => v === 'light' || v === 'normal' || v === 'fine';

export function decideWeight(search: string, store: Store | null): Weight {
  if (new URLSearchParams(search).get('nosave') === '1') return 'fine';
  try {
    const v = store?.getItem(WEIGHT_STORAGE_KEY) ?? null;
    if (isWeight(v)) return v;
  } catch {
    // 読めなくても 遊べる
  }
  return 'fine';
}

export function saveWeight(store: Store | null, weight: Weight): void {
  try {
    store?.setItem(WEIGHT_STORAGE_KEY, weight);
  } catch {
    // 書けなくても 遊べる
  }
}

const WEIGHT_MICRO_R: Record<Weight, number> = { light: 16, normal: 24, fine: DEFAULT_MICRO_R };

export interface WeightedStart {
  microR: number;
  ring: RingSpec;
  shadow: ShadowStart;
}

/** 決める 順（かげ・microR・ring それぞれ）: URL ＞ E2E の 環境変数 ＞ おもさ ＞ 今の きまり */
export function decideWeightedStart(o: {
  search: string;
  weight: Weight;
  env: { shadow?: string; micro?: string; ring?: string };
  shadowStore: Store | null;
}): WeightedStart {
  const q = new URLSearchParams(o.search);
  // microR
  const rawMicro = q.get('microR');
  const microUrl = rawMicro !== null && rawMicro.trim() !== '' && Number.isFinite(Number(rawMicro)) && Number(rawMicro) >= 0;
  const microR = microUrl || o.env.micro === 'off' ? decideMicroR(o.search, o.env.micro) : WEIGHT_MICRO_R[o.weight];
  // ring
  const ringParam = q.get('ring');
  const ring = ringParam === 'full' || ringParam === 'small' || o.env.ring === 'small' ? decideRing(o.search, o.env.ring) : o.weight === 'light' ? RING_SMALL : RING_FULL;
  // かげ
  let shadow: ShadowStart;
  if (o.weight === 'light') {
    const p = q.get('shadow');
    shadow = p === '1' ? { build: true, on: true } : { build: false, on: false };
  } else {
    shadow = decideShadowStart(o.search, o.env.shadow, o.shadowStore);
  }
  return { microR, ring, shadow };
}

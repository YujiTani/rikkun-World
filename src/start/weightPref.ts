// START-1 §4.4・GFX-1: おもさ（とても かるい・かるい・ふつう・きれい）。この パソコンの 設定（localStorage `rikkun.weight.v1`）。
// おもさの 表は gfxPref.ts。ここは「はじめに どう 決まるか」と おぼえ方。
import { SHADOW_STORAGE_KEY, type ShadowStart } from '../world/render/shadow/shadowPref';
import { decideMicroR } from '../world/render/voxel/tier';
import { RING_FULL, RING_SMALL, decideRing, type RingSpec } from '../world/stream/ring';
import { DEFAULT_WEIGHT, WEIGHT_SPEC, decideRes, isWeight, readGfxSaved, type GfxStore, type Res, type Weight } from './gfxPref';

export type { Weight } from './gfxPref';

export const WEIGHT_STORAGE_KEY = 'rikkun.weight.v1';

type Store = GfxStore;

export function decideWeight(search: string, store: Store | null): Weight {
  if (new URLSearchParams(search).get('nosave') === '1') return 'fine'; // E2E・perf の 前提（保存も 読まない）
  try {
    const v = store?.getItem(WEIGHT_STORAGE_KEY) ?? null;
    if (isWeight(v)) return v;
  } catch {
    // 読めなくても 遊べる
  }
  return DEFAULT_WEIGHT;
}

export function saveWeight(store: Store | null, weight: Weight): void {
  try {
    store?.setItem(WEIGHT_STORAGE_KEY, weight);
  } catch {
    // 書けなくても 遊べる
  }
}

export interface WeightedStart {
  microR: number;
  ring: RingSpec;
  shadow: ShadowStart;
  /** がめんの こまかさの 上限 */
  res: Res;
  /** かげを あとから 作って よいか（?shadow=0 は 作らない） */
  shadowAllowed: boolean;
}

/** 決める 順（かげ・microR・ring・res それぞれ）: URL ＞ E2E の 環境変数 ＞ くわしくの 保存 ＞ おもさ */
export function decideWeightedStart(o: {
  search: string;
  weight: Weight;
  env: { shadow?: string; micro?: string; ring?: string };
  /** localStorage（かげ・くわしくの 保存を 読む）。?nosave=1 の ときは 読まない */
  shadowStore: Store | null;
}): WeightedStart {
  const q = new URLSearchParams(o.search);
  const spec = WEIGHT_SPEC[o.weight];
  const nosave = q.get('nosave') === '1';
  const saved = nosave ? {} : readGfxSaved(o.shadowStore);
  // microR
  const rawMicro = q.get('microR');
  const microUrl = rawMicro !== null && rawMicro.trim() !== '' && Number.isFinite(Number(rawMicro)) && Number(rawMicro) >= 0;
  const microR = microUrl || o.env.micro === 'off' ? decideMicroR(o.search, o.env.micro) : (saved.micro ?? spec.microR);
  // ring（輪は 起動の ときだけ 決まる。くわしくでは 変えない）
  const ringParam = q.get('ring');
  const ring = ringParam === 'full' || ringParam === 'small' || o.env.ring === 'small' ? decideRing(o.search, o.env.ring) : spec.ring === 'small' ? RING_SMALL : RING_FULL;
  // かげ
  const param = q.get('shadow');
  let savedShadow: string | null = null;
  if (!nosave) {
    try {
      savedShadow = o.shadowStore?.getItem(SHADOW_STORAGE_KEY) ?? null;
    } catch {
      savedShadow = null;
    }
  }
  let on: boolean;
  if (param === '0') on = false;
  else if (param === '1') on = true;
  else if (o.env.shadow === 'off') on = false;
  else if (savedShadow === 'on' || savedShadow === 'off') on = savedShadow === 'on';
  else on = spec.shadow;
  // オンの ときだけ 作る（オフで 始めても、あとで オンに したら その場で 作る。wire/gfx.ts）
  const shadow: ShadowStart = { build: on, on };
  return { microR, ring, shadow, res: decideRes(o.search, saved, o.weight), shadowAllowed: param !== '0' };
}

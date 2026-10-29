/**
 * #293 試作: 大きい がしゃどくろ（第一形態）の 大きさ・置く場所・登る 道の 数。ここを 変えるだけで 調整できる。
 * 開発中は URL の `?proto=gashaBig&tune={"place":{"distance":50}}` か、コンソールの `__gashaBig.tune({ place: { distance: 50 } })` で 上書きして
 * `__gashaBig.place()` を もういちど 呼ぶと 効く（作りなおす 数は place のとき 読む）。
 * 単位: ブロック = 1 ブロック（1 = 1 m）、度 = Deg。
 * 「もとの 座標」は 見本（design-v1）と おなじ 数え方（からだの 中心 = こしの 真上が 原点、+x = キャラの 左、+y = 上、+z = 前）。
 * ぜんたいは `size.height` に あわせて 一まとめに 拡大・縮小される（その ぶん 当たりも ついて いく）。
 * #308: 数の 表は 部位・攻撃ごとの ファイルに 分けた（gashaBigTuningBody / Move / Far / State）。ここで 1 つの TUNE に くみ立てる（キーの 順も 中身も もとの まま）。
 */
import { TUNE_BODY } from './gashaBigTuningBody';
import { TUNE_MOVE } from './gashaBigTuningMove';
import { TUNE_FAR } from './gashaBigTuningFar';
import { TUNE_STATE } from './gashaBigTuningState';

export const TUNE = {
  ...TUNE_BODY,
  ...TUNE_MOVE,
  ...TUNE_FAR,
  ...TUNE_STATE,
};

type Json = { [k: string]: unknown };
const merge = (dst: Json, src: Json): void => {
  for (const [k, v] of Object.entries(src)) {
    const cur = dst[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object') merge(cur as Json, v as Json);
    else if (Array.isArray(v) && Array.isArray(cur) && v.length === cur.length) dst[k] = v;
    else if (typeof v === typeof cur) dst[k] = v; // 型が おなじ ものだけ 上書き
  }
};

/** 数を 上書きする（開発中だけ） */
export function applyTune(o: unknown): void {
  if (o && typeof o === 'object') merge(TUNE as unknown as Json, o as Json);
}

/** URL の `tune=<JSON>` を 読む */
export function applyTuneFromUrl(search: string): void {
  try {
    const raw = new URLSearchParams(search).get('tune');
    if (raw) applyTune(JSON.parse(raw));
  } catch { /* こわれた JSON は むし */ }
}

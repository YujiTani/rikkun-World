import { YAKATA_TABLE as T, YAKATA_TUNING as TUNE, LOOK_LIST, type Look } from './mineYakataConfig';
import { hash01, subSeed } from './random';

/**
 * やかたの くじ（MINE-1F §4.1・§4.9）。当たりと 見た目の くじは 区画 (rx, rz) だけで きまる〔坑道の 計画の 順・ほかの 列に よらない〕。
 * 見た目の くじは 当たりの くじとも 7 ひきとも べつの 乱数の 流れ〔`YAKATA_TUNING.tags`〕。ゲームに 出た あとは 式を かえない〔§4.9〕。
 */

/** 坑道の id〔`r<rx>_<rz>`〕から 区画 */
export function regionOfShaftId(id: string): { rx: number; rz: number } | null {
  const m = /^r(-?\d+)_(-?\d+)$/.exec(id);
  return m ? { rx: Number(m[1]), rz: Number(m[2]) } : null;
}

/** やかたの くじに 当たったか */
export function yakataHit(seed: number, rx: number, rz: number): boolean {
  return hash01(subSeed(seed, TUNE.tags.hit), rx, rz) < T.chance;
}

/** 見た目の くじ〔`looks` は 表の わりあい。わたすと その わりあいで 引く〕 */
export function yakataLook(seed: number, rx: number, rz: number, looks: Record<Look, number> = T.looks): Look {
  const r = hash01(subSeed(seed, TUNE.tags.look), rx, rz);
  let acc = 0;
  let last: Look = LOOK_LIST[0]!;
  for (const l of LOOK_LIST) {
    const w = looks[l];
    if (w <= 0) continue;
    last = l;
    acc += w;
    if (r < acc) return l;
  }
  return last;
}

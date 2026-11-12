import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { shaftWorldFor } from './mineShafts';
import type { Rect } from './waterV2Kit';

/**
 * 水の 景色 v2 を 置かない 所: 坑道の 入口〔入口の 前 8 マス・まわり ledgeRadius + 1〕と、小さな いしの 山の まわり。
 * 坑道の 入口は 地形だけで きまる ので、水の 計画の 側で よける〔入口の 前を 池・川・滝で ふさがない。洞くつの 口は plainAt の nearMouth が よける〕。
 * 四角 [x0, z0, x1, z1]（両はし ふくむ）の 中に 入口が ある 坑道〔はじまりの 坑道 ＋ 区画の 坑道〕が 対象。
 */
export function shaftKeepOut(seed: number, x0: number, z0: number, x1: number, z1: number): Rect[] {
  const R = S.entrance.ledgeRadius + 1;
  const out: Rect[] = [];
  // 入口の まわり R マスまで 水が かかる ので、入口が その ぶん 外に ある 坑道まで 見る
  for (const sh of shaftWorldFor(seed).shafts(x0 - R, z0 - R, x1 + R, z1 + R, false)) {
    const e = sh.entrance;
    out.push([e.x - R, e.z - R, e.x + R, e.z + R]);
    if (sh.mound !== null) {
      const h = Math.ceil(sh.mound.width / 2) + S.mound.clear + 2;
      out.push([sh.mound.x - h, sh.mound.z - h, sh.mound.x + h, sh.mound.z + h]);
    }
  }
  return out;
}

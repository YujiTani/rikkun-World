import { SHAFT_CONFIG as S } from './mineShaftConfig';
import type { ShaftWorld } from './mineShafts';
import { regionOf } from './mineShaftSite';
import type { Rect } from './waterV2Kit';
import type { Steps } from './waterV2Steps';

/**
 * 水の 景色 v2 を 置かない 所: 坑道の 入口〔入口の 前 8 マス・まわり ledgeRadius + 1〕と、小さな いしの 山の まわり。
 * 坑道の 入口は 地形だけで きまる ので、水の 計画の 側で よける〔入口の 前を 池・川・滝で ふさがない。洞くつの 口は plainAt の nearMouth が よける〕。
 * 四角 [x0, z0, x1, z1]（両はし ふくむ）の 中に 入口が ある 坑道〔はじまりの 坑道 ＋ 区画の 坑道〕が 対象。
 * shafts = その 世界の 坑道の 世界〔古い 列の 一覧つき。ゲームの 中では つなぎ込みが 1 つ 作って わたす。自分では 作らない〕。
 */
export function shaftKeepOut(shafts: ShaftWorld, x0: number, z0: number, x1: number, z1: number): Rect[] {
  const R = S.entrance.ledgeRadius + 1;
  const out: Rect[] = [];
  // 入口の まわり R マスまで 水が かかる ので、入口が その ぶん 外に ある 坑道まで 見る
  for (const sh of shafts.shafts(x0 - R, z0 - R, x1 + R, z1 + R, false)) {
    const e = sh.entrance;
    out.push([e.x - R, e.z - R, e.x + R, e.z + R]);
    if (sh.mound !== null) {
      const h = Math.ceil(sh.mound.width / 2) + S.mound.clear + 2;
      out.push([sh.mound.x - h, sh.mound.z - h, sh.mound.x + h, sh.mound.z + h]);
    }
  }
  return out;
}

/** shaftKeepOut を 小分けに 進める 形: 四角に かかる 区画の 計画を 短い 仕事ごとに yield しながら 先に 作って（ShaftWorld.stepRegion。先読みの 計画と 同じ 仕事）、そのあと 一気に 求める。結果は 同じ。#187 */
export function* shaftKeepOutSteps(shafts: ShaftWorld, x0: number, z0: number, x1: number, z1: number): Steps<Rect[]> {
  const R = S.entrance.ledgeRadius + 1;
  for (let rz = regionOf(z0 - R); rz <= regionOf(z1 + R); rz++) {
    for (let rx = regionOf(x0 - R); rx <= regionOf(x1 + R); rx++) {
      while (shafts.stepRegion(rx, rz)) yield;
    }
  }
  return shaftKeepOut(shafts, x0, z0, x1, z1);
}

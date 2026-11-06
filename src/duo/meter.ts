// DECLARATION ONLY（tester・COOP-1 作業 1）: 実装は developer が この ファイルを 書きかえて 入れる。テストは meter.test.ts。
import type { DuoTier } from './types';

/** 距離メーターの 長さ 0〜1（§9.4。48 マスで 1、それより 遠くても 1。距離に 比例） */
export declare function distanceMeter(distance: number): number;

/** 色の 段（§9.2。上がるのは 16・20 以上、下がるのは 17・13 以下。上りと 下りで 幅を 持たせる）。prev = 今の 段 */
export declare function nextTier(prev: DuoTier, distance: number): DuoTier;

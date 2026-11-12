import { ARA, ARA_MOSSY } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * 大きな 石ぞう（すわった 形。はば 11・ふかさ 9・高さ 16）。
 * 台（2 だん）→ あぐらの ひざ（左右に 張り出す）と 手（おなかの 前）→ どう（細い）と うで → 肩（はばが いちばん 広い）→ 細い 首 → 頭（5 マス。四すみを 2 だん けずって 丸く）→ てっぺんの まげ。
 * かおは 前（南）に 細い 目 2 つと 小さい 口 1 つ（くろい かわら）。こわくしない ように 目も 口も 1 マス。こけが 多い。
 * 手で 書くと 長い ので 式で ならべる（形の データの 一部）。
 */

const W = 11;
const D = 9;

type Grid = string[][];
const empty = (): Grid => Array.from({ length: D }, () => Array.from({ length: W }, () => '.'));
const fill = (g: Grid, x0: number, x1: number, z0: number, z1: number, ch: string): void => {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z]![x] = ch;
};
/** 四すみを けずって 丸く（頭の 段） */
const round = (g: Grid, x0: number, x1: number, z0: number, z1: number): void => {
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) g[z]![x] = '.';
};

/** 各段の 形（下から）。前 = 南 = 図の 下（z が 大きい） */
function layer(y: number): string[] {
  const g = empty();
  if (y === 0) fill(g, 0, 10, 0, 8, 'B'); // 台 1 だん
  else if (y === 1) fill(g, 1, 9, 1, 7, 'B'); // 台 2 だん
  else if (y === 2) fill(g, 1, 9, 3, 7, 'S'); // あしの うら（前に 広がる）
  else if (y === 3) {
    fill(g, 1, 3, 4, 7, 'S'); // 左の ひざ
    fill(g, 7, 9, 4, 7, 'S'); // 右の ひざ
    fill(g, 3, 7, 2, 6, 'S'); // こし
  } else if (y === 4) {
    fill(g, 1, 2, 5, 7, 'S'); // ひざの さき
    fill(g, 8, 9, 5, 7, 'S');
    fill(g, 3, 7, 2, 5, 'S'); // こし
    fill(g, 4, 6, 6, 7, 'H'); // 手（おなかの 前で かさねる）
  } else if (y <= 8) {
    fill(g, 3, 7, 2, 5, 'S'); // どう
    if (y <= 6) {
      fill(g, 2, 2, 3, 5, 'S'); // うで（どうの よこ）
      fill(g, 8, 8, 3, 5, 'S');
    }
    if (y === 5) fill(g, 4, 6, 6, 6, 'H'); // 手の 上
  } else if (y === 9) fill(g, 1, 9, 2, 5, 'S'); // 肩
  else if (y === 10) fill(g, 2, 8, 2, 5, 'S'); // 肩の 上
  else if (y === 11) fill(g, 4, 6, 3, 4, 'S'); // 首
  else if (y === 12) {
    fill(g, 3, 7, 2, 5, 'S'); // 頭 1 だん（あご）
    round(g, 3, 7, 2, 5);
    g[5]![5] = 'K'; // 小さい 口
  } else if (y === 13) {
    fill(g, 3, 7, 2, 5, 'S'); // 頭 2 だん
    g[5]![4] = 'K'; // 細い 目
    g[5]![6] = 'K';
  } else if (y === 14) {
    fill(g, 3, 7, 2, 5, 'S'); // 頭 3 だん
    round(g, 3, 7, 2, 5);
  } else if (y === 15) fill(g, 4, 6, 3, 4, 'M'); // まげ（こけ）
  return g.map((r) => r.join(''));
}

export const SEKIZOU: StructureShape = {
  id: 'sekizou',
  layers: Array.from({ length: 16 }, (_, y) => layer(y)),
  legend: {
    B: ARA,
    S: ARA_MOSSY,
    H: ARA,
    K: 'kawara',
    M: 'koke_ara_ishi',
  },
  anchor: { x: 5, z: 4 },
  base: { id: 'koke_ara_ishi', maxFill: 6 },
  maxSlope: 6,
};

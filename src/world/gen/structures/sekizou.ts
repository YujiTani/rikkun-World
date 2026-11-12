import { ARA, ARA_MOSSY } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * 大きな 石ぞう（すわった 形。はば 9・ふかさ 7・高さ 15）。台 → ひざ（左右）と 手 → どう → 左右に うで → 肩（はばが 広い）→ 頭（5 マス）→ てっぺんの こけ。
 * かおは 前（南）に 細い 目 2 つと 小さい 口 1 つ（くろい かわら）。こわくしない ように 目も 口も 1 マス。こけが 多い。
 * 手で 書くと 長い ので 式で ならべる（形の データの 一部）。
 */

const W = 9;
const D = 7;

type Grid = string[][];
const empty = (): Grid => Array.from({ length: D }, () => Array.from({ length: W }, () => '.'));
const fill = (g: Grid, x0: number, x1: number, z0: number, z1: number, ch: string): void => {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z]![x] = ch;
};

function layer(y: number): string[] {
  const g = empty();
  if (y === 0) fill(g, 0, 8, 0, 6, 'B'); // 台
  else if (y <= 2) fill(g, 0, 8, 2, 6, 'S'); // 足と ひざ
  else if (y === 3) {
    fill(g, 0, 2, 4, 6, 'S'); // 左の ひざ
    fill(g, 6, 8, 4, 6, 'S'); // 右の ひざ
    fill(g, 1, 7, 1, 4, 'S'); // どうの 下
    fill(g, 3, 5, 5, 5, 'S'); // 手
  } else if (y <= 8) {
    fill(g, 1, 7, 1, 4, 'S'); // どう
    if (y <= 7) {
      fill(g, 0, 0, 2, 4, 'S'); // うで
      fill(g, 8, 8, 2, 4, 'S');
    }
  } else if (y <= 10) fill(g, 0, 8, 1, 4, 'S'); // 肩
  else if (y <= 13) {
    fill(g, 2, 6, 1, 4, 'S'); // 頭
    if (y === 13) { g[4]![3] = 'K'; g[4]![5] = 'K'; } // 細い 目
    if (y === 12) g[4]![4] = 'K'; // 小さい 口
  } else fill(g, 3, 5, 2, 3, 'M'); // てっぺんの こけ
  return g.map((r) => r.join(''));
}

export const SEKIZOU: StructureShape = {
  id: 'sekizou',
  layers: Array.from({ length: 15 }, (_, y) => layer(y)),
  legend: {
    B: ARA,
    S: ARA_MOSSY,
    K: 'kawara',
    M: 'koke_ara_ishi',
  },
  anchor: { x: 4, z: 3 },
  base: { id: 'koke_ara_ishi', maxFill: 5 },
  maxSlope: 4,
};

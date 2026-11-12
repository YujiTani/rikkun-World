import { ARA, ARA_MOSSY, STONE_BASE } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * 大きな 石ぞう（すわった 形。ぞうの はば 11・ふかさ 14・高さ 16。足もとに 13×16 の たいらな 石だたみの だん〔1 段〕）。
 * 奥行きを たっぷり 持たせる: ひざと 組んだ 足が 前へ 3〜4 マス 出る・おなか・むねが 前へ 丸く・背中が 後ろへ 丸く・肩は 前後 8 マス・頭は 前後 8 マスの かたまり。
 * 台（2 だん。正面の まん中に まるもんの いし）→ あぐらの ひざ（左右に 張り出す）と 手 → どう（むねに きざみいし）と うで → 肩 → 細い 首 →
 * 頭（四すみを けずって 丸く）→ てっぺんの まげ。
 * かおは 前（南）に 細い 目 2 つ（くろい かわら 2×1 ずつ）と 小さい 口 1 つ。こけは 下の 3 分の 1 と 肩・頭の 上だけ（どうと かおは 石の 色）。
 * 手で 書くと 長い ので 式で ならべる（形の データの 一部）。
 */

/** だんの はば・ふかさ（ぞうは この 中に のる） */
const W = 13;
const D = 16;
/** ぞう（はば 11・ふかさ 14）の 左・北の はし（だんの 中の 位置） */
const OX = 1;
const OZ = 1;

type Grid = string[][];
const empty = (): Grid => Array.from({ length: D }, () => Array.from({ length: W }, () => '.'));
/** ぞうの 座標（x 0〜10, z 0〜13。z が 大きい 方が 前〔南〕）で 書く */
const fill = (g: Grid, x0: number, x1: number, z0: number, z1: number, ch: string): void => {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z + OZ]![x + OX] = ch;
};
const set = (g: Grid, x: number, z: number, ch: string): void => {
  g[z + OZ]![x + OX] = ch;
};
/** 四すみを けずって 丸く */
const round = (g: Grid, x0: number, x1: number, z0: number, z1: number): void => {
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) set(g, x, z, '.');
};

/** 各段の 形（y = 0 が だん、1 から ぞう） */
function layer(y: number): string[] {
  const g = empty();
  const k = y - 1; // ぞうの 段
  if (y === 0) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) g[z]![x] = 'P'; // 足もとの だん
  else if (k === 0) {
    fill(g, 0, 10, 0, 13, 'B'); // 台 1 だん
    set(g, 5, 13, 'O'); // 正面の まるもんの いし
  } else if (k === 1) fill(g, 1, 9, 1, 12, 'B'); // 台 2 だん
  else if (k === 2) fill(g, 1, 9, 6, 12, 'S'); // 組んだ 足の うら（前に 7 マス）
  else if (k === 3) {
    fill(g, 1, 3, 8, 12, 'S'); // 左の ひざ（前へ）
    fill(g, 7, 9, 8, 12, 'S'); // 右の ひざ
    fill(g, 3, 7, 4, 11, 'S'); // 組んだ 足・こし
  } else if (k === 4) {
    fill(g, 1, 2, 9, 12, 'S'); // ひざの さき
    fill(g, 8, 9, 9, 12, 'S');
    fill(g, 3, 7, 3, 10, 'S'); // 足・こし
    fill(g, 4, 6, 11, 12, 'H'); // 手（おなかの 前で かさねる）
  } else if (k <= 8) {
    fill(g, 3, 7, 3, 9, 'S'); // どう
    fill(g, 4, 6, 2, 2, 'S'); // 背中の まるみ（後ろへ）
    fill(g, 4, 6, 10, 10, 'S'); // おなか・むねの まるみ（前へ）
    if (k <= 6) {
      fill(g, 2, 2, 4, 8, 'S'); // うで（どうの よこ）
      fill(g, 8, 8, 4, 8, 'S');
    }
    if (k === 5) fill(g, 4, 6, 11, 11, 'H'); // 手の 上
    if (k === 7) set(g, 5, 10, 'Z'); // むねの きざみいし（前の まん中）
  } else if (k === 9) fill(g, 1, 9, 3, 10, 'M'); // 肩（前後 8 マス）
  else if (k === 10) {
    fill(g, 2, 8, 3, 10, 'M'); // 肩の 上
    round(g, 2, 8, 3, 10);
  } else if (k === 11) fill(g, 4, 6, 4, 9, 'S'); // 首
  else if (k === 12) {
    fill(g, 3, 7, 3, 10, 'S'); // 頭 1 だん（あご。前後 8 マス）
    round(g, 3, 7, 3, 10);
    set(g, 5, 10, 'K'); // 小さい 口
  } else if (k === 13) {
    fill(g, 3, 7, 3, 10, 'S'); // 頭 2 だん
    for (const x of [3, 4, 6, 7]) set(g, x, 10, 'K'); // 細い 目（2×1 が 2 つ）
  } else if (k === 14) {
    fill(g, 3, 7, 3, 10, 'M'); // 頭 3 だん（上は こけが 多い）
    round(g, 3, 7, 3, 10);
  } else if (k === 15) fill(g, 4, 6, 5, 8, 'T'); // まげ（こけ）
  return g.map((r) => r.join(''));
}

/** 体の 石（こけは 下の 3 分の 1 に かたよる。上の 方は ほとんど 出ない） */
const BODY = { id: 'ara_ishi', moss: 0.03, mossId: 'koke_ara_ishi', mossLow: 0.35, mix: [['hibi_ishi', 0.05]] } as const;

export const SEKIZOU: StructureShape = {
  id: 'sekizou',
  layers: Array.from({ length: 17 }, (_, y) => layer(y)),
  legend: {
    P: { id: 'ishidatami', moss: 0.1, mix: [['ara_ishi', 0.12]] },
    B: ARA,
    O: 'maru_mon_ishi',
    S: BODY,
    H: BODY,
    M: ARA_MOSSY, // 肩・頭の 上
    Z: 'kizami_ishi',
    K: 'kawara',
    T: 'koke_ara_ishi',
  },
  anchor: { x: 6, z: 8 },
  base: { ...STONE_BASE, maxFill: 10, cap: 'ishidatami' },
  maxSlope: 10,
};

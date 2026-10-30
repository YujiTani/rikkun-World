// HOUSE-1B 試作 第 3 版: 家具の 絵 6 まい（たんす・かまどの 横と うしろ、はにわ）。16×16、シード つき（Math.random なし）。
// たんす・かまどの 前は ゲームの ブロックの 絵（tansu_front・furnace_side）の まま。色は ブロックの 絵と 同じ 色だけ。
// 数の 元は docs/art/house-1/proto/furniture2.ts.txt（このファイルと 同じ 中身）。
import { fromRows, rect, speck, type Px } from './tilePaint';

export type Tile2 = 'tansu_flank' | 'tansu_rear' | 'furnace_flank' | 'furnace_rear' | 'haniwa_clay' | 'haniwa_face' | 'haniwa_band';
export const TILE2_NAMES: readonly Tile2[] = ['tansu_flank', 'tansu_rear', 'furnace_flank', 'furnace_rear', 'haniwa_clay', 'haniwa_face', 'haniwa_band'];

/** たんすの 色（src/storage/tansuArt.ts の TANSU_COLORS と 同じ 7 色） */
const TANSU = { F: '#7A5534', K: '#1F1F24', S: '#6B6F7A', M: '#D2B07E', L: '#E3C9A0', G: '#B98F5E', D: '#5E3F24' };
/** かまどの 色（ゲームの かまどの 絵〔furnaceSide〕と 同じ 灰色） */
const STONE = { B: '#8E8E8E', d: '#757575', l: '#A5A5A5', r: '#5A5A5A', k: '#151515', m: '#7C7C7C', s: '#3A3A3A' };
/** はにわの 色（やきものの 土 ＋ あな） */
const CLAY = { C: '#C97A44', d: '#B26436', l: '#D98E57', h: '#3A2012', b: '#A05A2E' };

/**
 * たんすの 横: わく ＋ かど金具、中は へこんだ 板（上と 左が かげ、下と 右が 明るい）、まん中に はこぶ ための 鉄の わ。
 * 前（引き出し）と ちがって 何も 入って いない 板 ＋ わ 1 つ で「よこ」と 分かる。
 */
function tansuFlank(): Px {
  return fromRows([
    'KKFFFFFFFFFFFFKK',
    'KFMMMMMMMMMMMMFK',
    'FMDDDDDDDDDDDDMF',
    'FMDMMMMMMMMMMLMF',
    'FMDMGMMMMMMGMLMF',
    'FMDMGMMMMMMGMLMF',
    'FMDMGMMKKMMGMLMF',
    'FMDMMMSMMKMGMLMF',
    'FMDMMMKMMKMGMLMF',
    'FMDMGMMKKMMMMLMF',
    'FMDMGMMMMMMMMLMF',
    'FMDMGMMMMMMGMLMF',
    'FMDMMMMMMMMGMLMF',
    'FMDLLLLLLLLLLLMF',
    'KFMMMMMMMMMMMMFK',
    'KKFFFFFFFFFFFFKK',
  ], TANSU);
}

/**
 * たんすの うしろ: 3 まいの 板を たてに ならべた だけの うらいた（かざりも 金具も なし）。
 * 上と 下に 横木の くぎ（こい 茶の 点）。前や 横より 地味で、色も 少し 暗い。
 */
function tansuRear(): Px {
  return fromRows([
    'FFFFFFFFFFFFFFFF',
    'FMGGGDMGGGDMGGGF',
    'FMGDGDMGDGDMGDGF',
    'FMGGGDMGGGDMGGGF',
    'FMGGGDMGGGDMGGGF',
    'FMGGGDMGGGDMGGGF',
    'FMGGGDMGGGDMGGGF',
    'FMGGGDMGGGDMGGGF',
    'FMGGDDMGGGDMGGGF',
    'FMGGGDMGGGDMGGGF',
    'FMGGGDMGGDDMGGGF',
    'FMGGGDMGGGDMGGGF',
    'FMGGGDMGGGDMGGGF',
    'FMGDGDMGDGDMGDGF',
    'FMGGGDMGGGDMGGGF',
    'FFFFFFFFFFFFFFFF',
  ], TANSU);
}

/** 石の 地の 絵（ゲームの かまどと 同じ 灰色の まだら）。シード ちがい */
function stoneBase(seed: number): Px {
  return speck(STONE.B, [STONE.d, STONE.l], seed, 0.12);
}

/** 石の つなぎ目（よこの 線 y と、その 上の だんの たての 目地 x）を 書く */
function seams(t: Px, ys: readonly number[], joints: ReadonlyArray<readonly number[]>): void {
  for (const y of ys) rect(t, 0, y, 16, 1, STONE.m);
  let top = 0;
  [...ys, 16].forEach((bottom, i) => {
    for (const x of joints[i]!) rect(t, x, top, 1, bottom - top, STONE.m);
    top = bottom + 1;
  });
}

/**
 * かまどの 横: 石を 3 だんに 積んだ 灰色の かべ。口は ない（口は 前だけ）。
 * いちばん 上は 明るい 線（前と 同じ）、いちばん 下は 少し 暗い（どっしり）。
 */
function furnaceFlank(): Px {
  const t = stoneBase(41);
  seams(t, [5, 10], [[5, 11], [2, 8, 14], [5, 11]]);
  rect(t, 0, 0, 16, 1, STONE.l);
  rect(t, 0, 15, 16, 1, STONE.d);
  return t;
}

/**
 * かまどの うしろ: 石の かべに 小さな 空気の あな（下）と、そこから 上へ のびる すす。
 * すすの 黒さは 上へ いくほど うすい（こわい 黒では なく、うっすら）。
 */
function furnaceRear(): Px {
  const t = stoneBase(42);
  seams(t, [5, 10], [[5, 11], [2, 8, 14], [5, 11]]);
  rect(t, 0, 0, 16, 1, STONE.l);
  rect(t, 0, 15, 16, 1, STONE.d);
  rect(t, 5, 11, 6, 4, STONE.r); // あなの まわり
  rect(t, 6, 12, 4, 2, STONE.k); // あな
  rect(t, 7, 7, 2, 4, STONE.m); // すす（こい）
  rect(t, 7, 4, 2, 3, STONE.d); // すす（うすい）
  return t;
}

/** はにわの 土（やきものの だいだい色。木の 茶色より 明るく 赤い） */
function haniwaClay(): Px {
  return speck(CLAY.C, [CLAY.d, CLAY.l], 51, 0.22);
}

/**
 * はにわの 顔（あたまの 前の 面だけ。あたまは 上 4.5〜9 → 絵の 上から 8 行、よこは 絵の 3〜12 列 ＋ はしの うすい 列）。
 * 丸い 目 2 つと 口 1 つの あな（2×2、上の 1 行に こい ふち）。目と 口の あいだは あけて ほっぺを 1 つずつ。
 */
function haniwaFace(): Px {
  const t = speck(CLAY.C, [CLAY.d, CLAY.l], 52, 0.18);
  rect(t, 0, 0, 16, 1, CLAY.l); // あたまの 上の ふち（明るい）
  for (const x of [4, 10]) {
    rect(t, x, 2, 2, 2, CLAY.h); // 目
    rect(t, x, 1, 2, 1, CLAY.b); // まぶたの かげ
  }
  rect(t, 7, 5, 2, 2, CLAY.h); // 口
  rect(t, 7, 4, 2, 1, CLAY.b);
  rect(t, 0, 7, 16, 1, CLAY.d); // あごの 線
  return t;
}

/** はにわの おびの 出っぱり（ぐるっと 1 まわり）。少し こい 土 */
function haniwaBand(): Px {
  return speck(CLAY.b, [CLAY.d, CLAY.C], 53, 0.22);
}

export function tiles2(): Record<Tile2, Px> {
  return {
    tansu_flank: tansuFlank(),
    tansu_rear: tansuRear(),
    furnace_flank: furnaceFlank(),
    furnace_rear: furnaceRear(),
    haniwa_clay: haniwaClay(),
    haniwa_face: haniwaFace(),
    haniwa_band: haniwaBand(),
  };
}

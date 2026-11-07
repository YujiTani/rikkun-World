/**
 * MINE-1E（docs/design/MINE-1E.md §3.2。アート docs/art/design/07-mine.md 20.13）: 坑道の 冒険の ブロックの 16×16 の 絵。
 * 小ブロックの 色は 絵の 投影（TEX-A）なので、床の 飾り（レール・はしご・たきびの あと）の 絵は 小ブロックの 形（mineBoken.ts）を
 * 真上と 真横から 見て 作る（形と 色が ぴったり あう）。ひびの いし・くずれた いし・こわれた わくは ブロックの 面の 絵。乱数なし。
 */
import { KODO_WAKU_COLORS as W } from './chestArt';
import { bokenColor, bokenShape, type FloorDecoId } from './mineBoken';

type Rgba = readonly [number, number, number, number];
const T = 16;
const N = 9;

export const BOKEN_TILE_NAMES = [
  'boken_hibi',
  'boken_kuzure',
  'boken_waku_side',
  'boken_rail_top_x',
  'boken_rail_top_z',
  'boken_rail_side',
  'boken_hashigo_top_x',
  'boken_hashigo_top_z',
  'boken_hashigo_side',
  'boken_takibi_top',
  'boken_takibi_side',
] as const;
export type BokenTileName = (typeof BOKEN_TILE_NAMES)[number];

const NAME_SET: ReadonlySet<string> = new Set(BOKEN_TILE_NAMES);
export const isBokenTile = (name: string): name is BokenTileName => NAME_SET.has(name);

const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
/** 2 つの 整数から 0〜255 の 決まった 数 */
const hash = (x: number, y: number): number => {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 144665, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 255;
};

/** 小ブロックの 形を 真上から 見た 16×16（いちばん 上の 材料の 色。何も ない 所は 床の 色）。右 = +x、下 = +z */
function topView(id: FloorDecoId): Rgba[] {
  const shape = bokenShape(id);
  const out: Rgba[] = [];
  for (let py = 0; py < T; py++) {
    for (let px = 0; px < T; px++) {
      const x = Math.min(N - 1, Math.floor(((px + 0.5) / T) * N));
      const z = Math.min(N - 1, Math.floor(((py + 0.5) / T) * N));
      let letter = '';
      for (let y = N - 1; y >= 0 && letter === ''; y--) letter = shape[(y * N + z) * N + x]!;
      out.push(hex(bokenColor(letter)));
    }
  }
  return out;
}

/** 小ブロックの 形を 横から 見た 16×16（行 = 高さ。同じ 高さで いちばん 手前〔z が 小さい〕の 材料の 色。何も ない 所は 床の 色）。右 = +x */
function sideView(id: FloorDecoId): Rgba[] {
  const shape = bokenShape(id);
  const out: Rgba[] = [];
  for (let py = 0; py < T; py++) {
    const y = Math.max(0, Math.min(N - 1, Math.floor((1 - (py + 0.5) / T) * N)));
    for (let px = 0; px < T; px++) {
      const x = Math.min(N - 1, Math.floor(((px + 0.5) / T) * N));
      let letter = '';
      for (let z = 0; z < N && letter === ''; z++) letter = shape[(y * N + z) * N + x]!;
      out.push(hex(bokenColor(letter)));
    }
  }
  return out;
}

// ---- ひびの いし: 灰色の 石に 白っぽい ぎざぎざの 線（まん中を たてに）
const STONE = ['#9E978A', '#928B80', '#6F685F', '#504A43'] as const;
function paintHibi(): Rgba[] {
  const out: Rgba[] = [];
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const n = hash(x, y);
      const zig = 7 + (Math.floor(y / 2) % 2 === 0 ? 0 : 1) + (y % 5 === 4 ? -1 : 0);
      let c: string = n < 40 ? STONE[2] : n < 110 ? STONE[1] : STONE[0];
      if (x === zig || x === zig + 1) c = '#EDEBE4'; // 白っぽい ひび
      else if (x === zig - 1 || x === zig + 2) c = STONE[3]; // ひびの ふちの かげ
      if (y % 6 === 3 && (x === zig + 3 || x === zig - 2)) c = '#E4E1D8'; // えだ
      out.push(hex(c));
    }
  }
  return out;
}

// ---- くずれた いし: まるい 石の 山（石ごとに 上は 明るく 下は かげ。すきまは 暗い）
const ROCKS: ReadonlyArray<readonly [number, number, number]> = [
  [3.5, 3.5, 3.4], [11, 2.5, 2.6], [7.5, 8.5, 3.4], [13.5, 9, 2.8], [2.5, 12.5, 2.8], [10, 13.5, 2.6],
];
function paintKuzure(): Rgba[] {
  const out: Rgba[] = [];
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      let c: string = STONE[3];
      for (const [cx, cy, r] of ROCKS) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        const shade = (x + 0.5 - cx) * 0.6 + (y + 0.5 - cy);
        c = shade < -r * 0.4 ? '#B1AA9C' : shade > r * 0.4 ? STONE[2] : (hash(x, y) < 60 ? STONE[1] : '#9A9386');
        break;
      }
      out.push(hex(c));
    }
  }
  return out;
}

// ---- こわれた わく: 1C の わくの 横の 絵を 元に、鉄の おびが 右がわ 半分 おち、ななめの ひび・さびの たれ・くぎの あな
function paintWakuSide(): Rgba[] {
  const out: Rgba[] = [];
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const edge = x === 0 || x === T - 1 || y === 0 || y === T - 1;
      let c: string = edge ? W.dark : (x % 5 === 3 && hash(x, y) < 150 ? W.mid : W.wood);
      if (y >= 6 && y <= 8) c = x <= 8 ? (y === 7 ? W.rivet : W.iron) : edge ? W.dark : W.light; // おびの 右半分は おちた あと（日に やけて いない すじ）
      if (y === 7 && x === 10) c = W.black; // くぎの あな
      if (y >= 9 && y <= 11 && x >= 2 && x <= 4) c = '#8A5A3A'; // さびの たれ
      if (x + y === 15 || x + y === 16) c = W.black; // ななめの ひび
      out.push(hex(c));
    }
  }
  return out;
}

const PAINT: Readonly<Record<BokenTileName, () => Rgba[]>> = {
  boken_hibi: paintHibi,
  boken_kuzure: paintKuzure,
  boken_waku_side: paintWakuSide,
  boken_rail_top_x: () => topView('furui_rail_x'),
  boken_rail_top_z: () => topView('furui_rail_z'),
  boken_rail_side: () => sideView('furui_rail_x'),
  boken_hashigo_top_x: () => topView('taoreta_hashigo_x'),
  boken_hashigo_top_z: () => topView('taoreta_hashigo_z'),
  boken_hashigo_side: () => sideView('taoreta_hashigo_x'),
  boken_takibi_top: () => topView('takibi_ato'),
  boken_takibi_side: () => sideView('takibi_ato'),
};

export function paintBokenTile(name: BokenTileName): Rgba[] {
  return PAINT[name]();
}

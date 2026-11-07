/**
 * MINE-1E（docs/design/MINE-1E.md §3.2・§4.9。アート docs/art/design/07-mine.md 20.13）: 坑道の 冒険の ブロック 8 この 約束と、
 * 床の 飾り 3 しゅ（ふるい レール・たおれた はしご・たきびの あと）の 小ブロックの 形（9×9×9）。
 * 形の 文字（材料）と 色は ここ 1 か所。小ブロックの 形（looks/mineBokenLooks.ts）と 16×16 の 絵（mineBokenTextures.ts）が 同じ 文字の 表を 読む
 * ので、真上と 真横から 見た 色が 形と ぴったり あう。このファイルは 型だけ import する 葉。
 */
import type { BlockId } from '../../contracts';

/** 床の 飾り（固くない。体が 通る。下の ブロックを こわすと いっしょに 消える。光を 通す。遠くでは 描かない） */
export const FLOOR_DECO_IDS = ['furui_rail_x', 'furui_rail_z', 'taoreta_hashigo_x', 'taoreta_hashigo_z', 'takibi_ato'] as const satisfies readonly BlockId[];
export type FloorDecoId = (typeof FLOOR_DECO_IDS)[number];
const DECO_SET: ReadonlySet<string> = new Set(FLOOR_DECO_IDS);

/** 床の 飾りか（ブロックの id で） */
export function isFloorDeco(id: string): id is FloorDecoId {
  return DECO_SET.has(id);
}

/** 小ブロックの 1 辺の 数 */
const N = 9;
/** 小ブロックの 形の 材料 → 色（1 文字 = 1 材料。真上・真横の 絵も この 色） */
export const BOKEN_COLORS: Readonly<Record<string, string>> = {
  W: '#7C6C57', // まくらぎ・はしごの 木（灰がかった 茶）
  w: '#5F5243', // 木の かげ・木口
  R: '#7E5A44', // レールの さび（茶）
  S: '#B2AA9B', // レールの すりへって 明るい 上
  N: '#4A4650', // くぎ
  T: '#8F887C', // たきびの 石の わ
  t: '#A7A094', // 石の わの 上（明るい）
  k: '#5B554D', // 石の わの すす
  a: '#8A8480', // 灰（ひくい）
  A: '#B7B2AB', // 灰（中）
  H: '#E4E0D8', // 灰（てっぺん・白）
  C: '#2B2632', // 炭
  L: '#6E4A2D', // こげて いない まきの はし
  G: '#6A645C', // 床の 色（絵の 空きを うめる）
};

/** 形の 1 マス: (x, y, z) → 材料の 文字（'' = 空）。y が 上 */
type Cell = (x: number, y: number, z: number) => string;

/** ふるい レール（東西 = x にそって のびる）: まくらぎ 2 本（2 つぶ 幅）と、その 上の レール 2 本（さびの 下 + 明るい 上）。高さ 3 つぶ */
const railX: Cell = (x, y, z) => {
  if (y === 0 && (x === 1 || x === 2 || x === 5 || x === 6) && z >= 1 && z <= 7) return z === 1 || z === 7 ? 'w' : 'W';
  if ((z === 2 || z === 6) && y === 1) return 'R';
  if ((z === 2 || z === 6) && y === 2) return 'S';
  return '';
};

/** たおれた はしご（東西 = x にそって）: 2 本の 柱（z = 1・7。高さ 2）と、よこの だん（x = 1・4・7。高さ 1）。つなぎに くぎ */
const hashigoX: Cell = (x, y, z) => {
  if ((z === 1 || z === 7) && y <= 1) return y === 1 && (x === 1 || x === 4 || x === 7) ? 'N' : 'W';
  if (z >= 2 && z <= 6 && y === 0 && (x === 1 || x === 4 || x === 7)) return 'w';
  return '';
};

/** たきびの あと: 石の わ（半径 3〜4）と、中の 灰 3 だん（白 → 灰 → こい）・炭・こげて いない まきの はし */
const takibi: Cell = (x, y, z) => {
  const dx = x - 4;
  const dz = z - 4;
  const r2 = dx * dx + dz * dz;
  if (r2 >= 12 && r2 <= 20) {
    if (y === 0) return dx + dz > 0 ? 'k' : 'T'; // わの 下の だん（火の ほうが すすけて いる）
    if (y === 1 && (x + z) % 2 === 0) return 't';
    return '';
  }
  if (r2 < 12) {
    if (y === 0) return (x === 3 && z === 5) || (x === 5 && z === 3) ? 'C' : 'a';
    if (y === 1 && r2 < 7) return z === 4 && x >= 3 && x <= 5 ? 'L' : (x * 3 + z) % 5 === 0 ? 'C' : 'A';
    if (y === 2 && r2 < 2) return 'H';
  }
  return '';
};

/** 材料の 文字の 表（x〔東西〕向き）。z〔南北〕向きは 90 度 まわした もの（`bokenShape`） */
const SHAPES_X: Readonly<Record<'rail' | 'hashigo' | 'takibi', Cell>> = { rail: railX, hashigo: hashigoX, takibi };

/** 床の 飾り 1 つの 形: 材料の 文字の 並び。(y * 9 + z) * 9 + x（'' = 空） */
export function bokenShape(id: FloorDecoId): readonly string[] {
  const kind = id === 'takibi_ato' ? 'takibi' : id.startsWith('furui_rail') ? 'rail' : 'hashigo';
  const along = id.endsWith('_z'); // 南北向き = 東西向きを 90 度 まわす
  const f = SHAPES_X[kind];
  const out: string[] = [];
  for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) out.push(along ? f(z, y, x) : f(x, y, z));
  return out;
}

/** 材料の 色（文字 → '#rrggbb'）。ない 文字は 床の 色 */
export function bokenColor(letter: string): string {
  return BOKEN_COLORS[letter] ?? BOKEN_COLORS.G!;
}

/**
 * 1 色だけの 面の 絵（HOUSE-2B #364。何も import しない 葉）。まねきねこの 箱の 色〔アート geometry.json の furniture:maneki〕を、世界の 絵の 表に 1 色 1 まいで 足す。
 * 名前は `h2_c_<6 けたの 色>`。数は 7 まい（家の 3 つの 見た目の 面の 絵 64 まいとは べつ）。
 */
const MANEKI_COLORS = ['3a2a22', 'f2eee6', 'b8892c', 'dcd5c8', 'cfa446', 'c0453a', 'e8a0a8'] as const;
const solidTileName = (hex: string): `h2_c_${string}` => `h2_c_${hex.replace('#', '').toLowerCase()}`;
export const SOLID_TILE_NAMES: readonly `h2_c_${string}`[] = MANEKI_COLORS.map(solidTileName);

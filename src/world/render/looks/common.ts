import { ALL_FACES, FACE_BIT, LOOK_N, LOOK_VOLUME, type KindSpec } from './types';

export { ALL_FACES, FACE_BIT, LOOK_N, LOOK_VOLUME };
const N = LOOK_N;
const M = N - 1;

/** パレット作り。`P('#rrggbb')` で色番号（1 から）を返す。同じ色は同じ番号。255 色をこえると エラー */
export function createPalette(): { P(hex: string): number; set(...hexes: string[]): number[]; rgb(): Uint8Array } {
  const hexes: string[] = [];
  const P = (hex: string): number => {
    const h = hex.toUpperCase();
    let i = hexes.indexOf(h);
    if (i < 0) {
      if (hexes.length >= 255) throw new Error('パレットは 255 色まで');
      hexes.push(h);
      i = hexes.length - 1;
    }
    return i + 1; // 0 は「空」
  };
  return {
    P,
    set: (...hs: string[]) => hs.map(P),
    rgb: () => {
      const a = new Uint8Array((hexes.length + 1) * 3);
      hexes.forEach((h, i) => {
        const n = parseInt(h.slice(1), 16);
        a[(i + 1) * 3] = (n >> 16) & 255;
        a[(i + 1) * 3 + 1] = (n >> 8) & 255;
        a[(i + 1) * 3 + 2] = n & 255;
      });
      return a;
    },
  };
}

export function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** ブロックの位置と種類の番号から作る数（kindSalt は 案の中で種類ごとに ちがう小さな整数） */
export function blockHash(kindSalt: number, bx: number, by: number, bz: number): number {
  return mix(mix(mix(kindSalt + 1, bx), by), bz);
}

/** そのブロックの中の 1 マスの数（0 以上 2^32 未満） */
export function cellHash(h: number, x: number, y: number, z: number): number {
  return mix(h, (y * N + z) * N + x);
}

/** (x,y,z) が はしにある面のうち、見えない面にさわっていないか（へこませてよいか） */
export function dentable(x: number, y: number, z: number, exposed: number): boolean {
  if (y === N - 1 && !(exposed & 1)) return false;
  if (y === 0 && !(exposed & 2)) return false;
  if (x === N - 1 && !(exposed & 4)) return false;
  if (x === 0 && !(exposed & 8)) return false;
  if (z === N - 1 && !(exposed & 16)) return false;
  if (z === 0 && !(exposed & 32)) return false;
  return true;
}

/** はしの層（外の面にさわる）か。その面が見えているときだけ true */
export function onExposedSurface(x: number, y: number, z: number, exposed: number): boolean {
  return (
    (y === N - 1 && (exposed & 1) !== 0) ||
    (y === 0 && (exposed & 2) !== 0) ||
    (x === N - 1 && (exposed & 4) !== 0) ||
    (x === 0 && (exposed & 8) !== 0) ||
    (z === N - 1 && (exposed & 16) !== 0) ||
    (z === 0 && (exposed & 32) !== 0)
  );
}

/** 見えている面にさわる 1 段の内側（へこみの下の層）か */
export function onSecondLayer(x: number, y: number, z: number, exposed: number): boolean {
  return (
    (y === N - 2 && (exposed & 1) !== 0) ||
    (x === N - 2 && (exposed & 4) !== 0) ||
    (x === 1 && (exposed & 8) !== 0) ||
    (z === N - 2 && (exposed & 16) !== 0) ||
    (z === 1 && (exposed & 32) !== 0)
  );
}

/**
 * 3×3 の かけら の へこみ（強め。2026-10-16 オーナー「もっとゴツゴツでよい」）。
 * - 面: 9 枚の かけら の うち rate 枚くらいを 1 マス、そのうち deep 枚くらいは かけら ごと 2 マス、
 *   さらに その半分は まんなか 1 マスだけ 3 マスめ まで へこむ（だんだんの ほりかげ）。
 * - かど: 見える面が 2 つ出会う へり・かど は、3×3×3 の かたまり ごとに edge/10 の わりあいで けずる（けずった岩の りんかく）。
 *   2 マスの深さまで けずるので、崖や 山の シルエットが ごつごつ する。
 * 見えない面に さわる マスは けずらない（dentable）。
 */
export function carved(x: number, y: number, z: number, e: number, h: number, rate: number, deep: number, edge: number): boolean {
  if (!dentable(x, y, z, e)) return false;
  let near = 0; // 1 マス以内の 見える面の数
  for (let f = 0; f < 6; f++) {
    const bit = FACE_BIT[f];
    if (!(e & bit)) continue;
    // 面ごとの (深さ, 面の中の u, v)。上 → 下 → +x → -x → +z → -z の 順
    const dd = f === 0 ? M - y : f === 1 ? y : f === 2 ? M - x : f === 3 ? x : f === 4 ? M - z : z;
    if (dd > 2) continue;
    const u = f < 2 ? x : f < 4 ? z : x;
    const v = f < 2 ? z : y;
    if (dd <= 1) near++;
    const r = mix(h, f * 16 + ((v / 3) | 0) * 3 + ((u / 3) | 0));
    const k = r % 9;
    if (dd === 0 && k < rate) return true;
    if (dd === 1 && k < deep) return true;
    if (dd === 2 && k < deep && u % 3 === 1 && v % 3 === 1 && (r >>> 8) % 2 === 0) return true;
  }
  if (near >= 2 && edge > 0) {
    const r = mix(h, 500 + (((y / 3) | 0) * 3 + ((z / 3) | 0)) * 3 + ((x / 3) | 0));
    if (r % 10 < edge) return true;
  }
  return false;
}

/**
 * 形の 種類を 作る。`salt` = 位置の ハッシュの たね（案の 中で 種類ごとに ちがう 整数）。color = 1 マスの 色番号、hole = 穴〔へこみ〕。
 * 3D テクスチャは exposed = ALL_FACES で 作られ、穴の マスは base 1 色に なる。そこで ALL_FACES のときは 穴を あけない
 * （色が そのまま 全部 テクスチャに 入る。6 面とも 見える 宙に 浮いた 1 個だけは へこまない）。
 */
export function shapeKind(
  salt: number,
  base: number,
  color: (x: number, y: number, z: number, h: number) => number,
  hole: (x: number, y: number, z: number, e: number, h: number) => boolean,
): KindSpec {
  return {
    base,
    fill: (bx, by, bz, exposed, out) => {
      const h = blockHash(salt, bx, by, bz);
      const solidOnly = exposed === ALL_FACES;
      let i = 0;
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          for (let x = 0; x < N; x++, i++) {
            out[i] = !solidOnly && hole(x, y, z, exposed, h) ? 0 : color(x, y, z, h);
          }
        }
      }
    },
  };
}

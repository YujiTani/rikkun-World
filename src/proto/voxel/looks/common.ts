import { ALL_FACES, FACE_BIT, LOOK_N, LOOK_VOLUME } from './types';

export { ALL_FACES, FACE_BIT, LOOK_N, LOOK_VOLUME };
const N = LOOK_N;

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

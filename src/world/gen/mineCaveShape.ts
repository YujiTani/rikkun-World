import { CAVE_CONFIG as C, type CaveKind } from './mineCaveConfig';
import { randInt, type Rng } from './random';

/**
 * 部屋の 形（MINE-1D §4.7.2）。部屋の 中の 座標（x・z は 0 から）で 「列ごとの 空気の 高さ」の 地図を 作る。
 * 世界には さわらない。ひろい ほらあな B の 形は mineHiroiShape.ts（計画から 作る）。
 */

export interface LocalShape {
  /** 計画の 箱の 大きさ（マス）。sy は 水の 底から 天井まで */
  sx: number;
  sy: number;
  sz: number;
  /** 床の 空気の いちばん 下の 高さ（箱の いちばん 下から。ちていこの 池の ふかさ） */
  floorK: number;
  /** 列ごとの 空気の 高さ（床から。0 ＝ 部屋の 外）。index ＝ z * sx + x */
  ceil: Int8Array;
  /** 列ごとの 水の ふかさ（ちていこの 池。0 ＝ なし） */
  water: Int8Array;
  /** ひろい ほらあなだけ: 列ごとの 空気の 下（床から。柱の すそ・床の こぶ）。空気は lift 〜 ceil。ない ときは 0 */
  lift?: Int8Array;
  /** ひろい ほらあなだけ: 1 の 列は 空気で ない マスを 箱の 高さまで（自然の 穴が あれば）石に する（柱の 中。自然の 穴が あっても 固い） */
  force?: Uint8Array;
  /** ひろい ほらあなだけ: 鉱石の 場所に つかう 柱と いちばん 高い 天井（床から。段）。plain ＝ 鉱石 なし（性能の くらべ用） */
  hiroi?: { pillars: { x: number; z: number; ceil: number; widths: number[] }[]; maxTop: number; plain: boolean };
}

/** たまごの 形（床の 面で 楕円）。ふちほど 天井が ひくい。ふちでも edge 以上 */
function egg(sx: number, sz: number, h: number, edge: number): Int8Array {
  const ceil = new Int8Array(sx * sz);
  const rx = sx / 2;
  const rz = sz / 2;
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const inside = 1 - ((x + 0.5 - rx) / rx) ** 2 - ((z + 0.5 - rz) / rz) ** 2;
      if (inside <= 0) continue;
      const c = Math.round(h * (0.55 + 0.45 * Math.min(1, inside * 1.7) ** 0.6));
      ceil[z * sx + x] = Math.min(h, Math.max(edge, c));
    }
  }
  return ceil;
}

/** 角を まるめた 四角（角の 半径 r）。中は 同じ 高さ */
function roundRect(sx: number, sz: number, r: number, x0 = 0, z0 = 0, w = sx, d = sz): (x: number, z: number) => boolean {
  return (x, z) => {
    const lx = x - x0;
    const lz = z - z0;
    if (lx < 0 || lz < 0 || lx >= w || lz >= d) return false;
    const px = Math.min(w - r, Math.max(r, lx + 0.5));
    const pz = Math.min(d - r, Math.max(r, lz + 0.5));
    return Math.hypot(lx + 0.5 - px, lz + 0.5 - pz) <= r;
  };
}

function chiteiko(rng: Rng, sx: number, sy: number, sz: number): LocalShape | null {
  const R = C.rules.chiteiko;
  for (let t = 0; t < 12; t++) {
    const depth = randInt(rng, R.pondDepth[0], R.pondDepth[1]);
    const h = sy - depth;
    if (h < 4) return null;
    const wMax = Math.min(R.pondWidth[1], sx - 2 * C.bankMin - 1);
    const dMax = Math.min(R.pondWidth[1], sz - 2 * C.bankMin - 1);
    const w = randInt(rng, R.pondWidth[0], wMax);
    const d = randInt(rng, R.pondWidth[0], dMax);
    const px = Math.floor((sx - w) / 2) + randInt(rng, -1, 1);
    const pz = Math.floor((sz - d) / 2) + randInt(rng, -1, 1);
    const inRoom = roundRect(sx, sz, 4);
    const inPond = roundRect(sx, sz, 3, px, pz, w, d);
    const ceil = new Int8Array(sx * sz);
    const water = new Int8Array(sx * sz);
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) if (inRoom(x, z)) ceil[z * sx + x] = h;
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) if (inPond(x, z)) water[z * sx + x] = depth;
    // 池の ぐるりは 岸（部屋の 床）。池の はしは 池の はばと 同じに なる
    let ok = true;
    for (let z = 0; z < sz && ok; z++) {
      for (let x = 0; x < sx && ok; x++) {
        if (!water[z * sx + x]) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= sx || nz >= sz || !ceil[nz * sx + nx]) ok = false;
        }
      }
    }
    if (ok) return { sx, sy, sz, floorK: depth, ceil, water };
  }
  return null;
}

/** 種類ごとの 大きさと 形を 乱数から 作る。作れなければ null */
export function makeShape(kind: Exclude<CaveKind, 'hiroi'>, rng: Rng): LocalShape | null {
  const K = C.kinds[kind];
  const sx = randInt(rng, K.x[0], K.x[1]);
  const sz = randInt(rng, K.z[0], K.z[1]);
  const sy = randInt(rng, K.y[0], K.y[1]);
  if (kind === 'chiteiko') return chiteiko(rng, sx, sy, sz);
  const edge = Math.min(C.edgeCeil, sy);
  return { sx, sy, sz, floorK: 0, ceil: egg(sx, sz, sy, edge), water: new Int8Array(sx * sz) };
}

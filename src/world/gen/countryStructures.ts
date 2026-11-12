import { SEA_Y } from '../../contracts';
import { cheb, groundAt, MOUNTAIN_TUNE, plainAt, range, rnd, site, type Ctx, type FeatureSite, type Summit } from './countryKit';
import { placeStairs, type Dir4 } from './structures/ishidan';
import { placeStructure } from './structures/place';
import { STRUCTURES } from './structures/registry';
import type { Placed, Rot, StructureShape } from './structures/types';

/**
 * 山の上の 目じるし（試作。URL に `?structures=1` が ある ときだけ。既定の 世界は かわらない）。
 * てんぐの やま: 頂上の ちかくに お堂 → そこから のぼる 石段（両わきに とうろう）→ 石段の 下に とりい。
 * もみじやま: 頂上の ちかくに あずまや、すこし 下の たいらな 広場に とりい（頂上の ほうを 向く）。
 * 場所は (シード, 升目) の 乱数と 地形だけで 決まる（国だけの 物と 同じ。作る 順に 関係ない）。形は structures/ の 図。
 */

/** `?structures=1` か（Node の テストでは location が ないので false。テストは 下の 関数を 直接 よぶ） */
export const STRUCTURES_ON: boolean = typeof location !== 'undefined' && new URLSearchParams(location.search).get('structures') === '1';

/** 数の表（単位は ブロック／歩） */
const STRUCTURE_TUNE = {
  /** 頂上の まわりで 建物を さがす はんい（頂上から。チェビシェフ） */
  summitSearch: 7,
  /** あずまやは 大木（頂上）から これ 以上 はなす */
  azumayaFrom: 5,
  /** お堂の 正面の はしから 石段の はじめまで（お堂の 半分 4 ＋ 1） */
  stairGap: 5,
  /** 石段の おわりから とりいの 基準の マスまで さがす きょり（近い 方から） */
  toriiGap: [2, 8] as const,
  /** もみじやまの とりい: 頂上から さがす きょり・とばす きざみ・「たいらな 広場」の 高さの 差の 上限 */
  plaza: { from: 10, to: 30, step: 2, flat: 1 },
  /** 山の すそと みなす 海からの 高さ（石段の おわり） */
  shore: 2,
} as const;

const T = STRUCTURE_TUNE;

/** 向き（歩く 方向）→ 正面が その 向きに なる 図の 向き。図の 正面は 向き 0 で 南（+z）、1 = 西、2 = 北、3 = 東 */
const ROT_OF_DIR: ReadonlyMap<string, Rot> = new Map<string, Rot>([['0,1', 0], ['-1,0', 1], ['0,-1', 2], ['1,0', 3]]);
const rotOf = (d: Dir4): Rot => ROT_OF_DIR.get(`${d[0]},${d[1]}`)!;
const DIRS: readonly Dir4[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

const groundFn = (c: Ctx): ((x: number, z: number) => number) => {
  const memo = new Map<number, number>();
  return (x, z) => {
    const k = (x + 100000) * 200003 + (z + 100000);
    let h = memo.get(k);
    if (h === undefined) memo.set(k, (h = groundAt(c, x, z, null)));
    return h;
  };
};

const tooHigh = (p: Placed, shape: StructureShape): boolean => p.baseY + shape.layers.length > MOUNTAIN_TUNE.maxY;

/** 頂上の まわりで、近い 順に 建物を 置ける 所を さがす（同じ 距離なら 地面の 高さの 差が 小さい 方）。from = 頂上から これ 以上 はなす */
function findNear(shape: StructureShape, s: Summit, rot: Rot, seed: number, ground: (x: number, z: number) => number, from: number): { x: number; z: number; placed: Placed } | null {
  for (let d = from; d <= T.summitSearch; d++) {
    let best: { x: number; z: number; placed: Placed; score: number } | null = null;
    for (let dz = -d; dz <= d; dz++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        const p = placeStructure(shape, s.x + dx, s.z + dz, rot, seed, ground);
        if (p === null || tooHigh(p, shape)) continue;
        const base = p.blocks.filter((b) => b.y < p.baseY).length; // 土台の 数（地面が たいらな 所ほど 少ない）
        if (best === null || base < best.score) best = { x: s.x + dx, z: s.z + dz, placed: p, score: base };
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/** 石段の おわり（山の すそ）に なる 列か */
const atFoot = (c: Ctx, ground: (x: number, z: number) => number) => (x: number, z: number): boolean => {
  const shape = c.T.map.mountainShape(x, z);
  return shape === null || shape.m <= c.T.map.baseHeight(x, z) || ground(x, z) < SEA_Y + T.shore;
};

/** てんぐの やま: お堂 ＋ 石段 ＋ とりい。向きは シードの 順に 4 方位を ためし、石段が 通る 最初の 向きを つかう。どれも だめなら お堂だけ */
export function tenguStructures(c: Ctx, s: Summit): FeatureSite[] {
  const ground = groundFn(c);
  const order = DIRS.map((d, n) => ({ d, r: rnd(c, 'odou', n) })).sort((a, b) => a.r - b.r).map((q) => q.d);
  let fallback: { d: Dir4; x: number; z: number; placed: Placed } | null = null;
  for (const d of order) {
    const odou = findNear(STRUCTURES.odou, s, rotOf(d), c.i * 7 + c.j, ground, 0);
    if (odou === null) continue;
    fallback ??= { d, ...odou };
    const stairs = placeStairs(odou.x + T.stairGap * d[0], odou.z + T.stairGap * d[1], d, c.i * 31 + c.j, ground, atFoot(c, ground));
    if (stairs === null) continue;
    const out: FeatureSite[] = [site(c, 'odou', odou.x, odou.placed.baseY, odou.z, odou.placed.blocks, odou.placed.foot)];
    const rects = stairs.path.map((p) => (d[0] !== 0 ? ([p.x, p.z - 5, p.x, p.z + 5] as const) : ([p.x - 5, p.z, p.x + 5, p.z] as const))); // 1 歩ごとの 四角（はば 3 ＋ とうろう）
    const first = stairs.path[0]!;
    out.push(site(c, 'ishidan', first.x, first.y + 1, first.z, stairs.blocks, stairs.foot, { rects, path: stairs.path }));
    // とりい: 石段の おわりの さきに、近い 方から
    const last = stairs.path[stairs.path.length - 1]!;
    for (let g = T.toriiGap[0]; g <= T.toriiGap[1]; g++) {
      const tx = last.x + g * d[0];
      const tz = last.z + g * d[1];
      const t = placeStructure(STRUCTURES.torii, tx, tz, rotOf(d), c.i * 13 + c.j, ground);
      if (t !== null) {
        out.push(site(c, 'torii', tx, t.baseY, tz, t.blocks, t.foot));
        break;
      }
    }
    return out;
  }
  if (fallback === null) return [];
  return [site(c, 'odou', fallback.x, fallback.placed.baseY, fallback.z, fallback.placed.blocks, fallback.placed.foot)];
}

/** もみじやま: 頂上の ちかくに あずまや、頂上から はなれた たいらな 広場に とりい（頂上の ほうを 向く） */
export function momijiStructures(c: Ctx, s: Summit): FeatureSite[] {
  const ground = groundFn(c);
  const out: FeatureSite[] = [];
  const rot = range(rnd(c, 'azumaya', 0), 0, 3) as Rot;
  const az = findNear(STRUCTURES.azumaya, s, rot, c.i * 5 + c.j, ground, T.azumayaFrom);
  if (az !== null) out.push(site(c, 'azumaya', az.x, az.placed.baseY, az.z, az.placed.blocks, az.placed.foot));
  const flat: StructureShape = { ...STRUCTURES.torii, maxSlope: T.plaza.flat };
  const order = DIRS.map((d, n) => ({ d, r: rnd(c, 'torii', n) })).sort((a, b) => a.r - b.r);
  for (let r = T.plaza.from; r <= T.plaza.to; r += T.plaza.step) {
    for (const { d } of order) {
      // 頂上から d の 向きに r はなれた 所。山の ほう（-d）を 向く とりい
      const x = s.x + d[0] * r;
      const z = s.z + d[1] * r;
      if (!plainAt(c, x, z)) continue;
      const toward: Dir4 = [-d[0], -d[1]];
      const t = placeStructure(flat, x, z, rotOf(toward), c.i * 17 + c.j, ground);
      if (t === null || cheb(x, z, s.x, s.z) < T.plaza.from) continue;
      out.push(site(c, 'torii', x, t.baseY, z, t.blocks, t.foot));
      return out;
    }
  }
  return out;
}

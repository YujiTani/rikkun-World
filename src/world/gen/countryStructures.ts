import { SEA_Y } from '../../contracts';
import { cheb, plainAt, range, rnd, site, type Ctx, type FeatureSite, type Summit } from './countryKit';
import { DIRS, facing, findNear, gridSearch, groundFn, overlaps, ringSearch, rotOf, siteOf } from './countryStructureKit';
import { placeStairs, type Dir4 } from './structures/ishidan';
import { placeStructure } from './structures/place';
import { STRUCTURES } from './structures/registry';
import type { Rot, StructureShape } from './structures/types';

/**
 * 山の上の 目じるし（試作。URL に `?structures=1` が ある ときだけ。既定の 世界は かわらない）。
 * てんぐの やま: 頂上の ちかくに お堂 → そこから のぼる 石段（両わきに いしどうろう）→ 石段の 下に とりい。お堂の ちかくに かねの やぐら、石段の とちゅうに おじぞうさん、すそに いど。
 * もみじやま: 頂上の ちかくに あずまや、すこし 下の たいらな 広場に とりいと ほこら、すそに いど。
 * いわやま: かべの 前の 平らな 所に 大きな 石ぞう（0〜1）と いしの とりい。
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
  /** もみじやまの とりい・ほこら: 頂上から さがす きょり・とばす きざみ・「たいらな 広場」の 高さの 差の 上限（とりい） */
  plaza: { from: 10, to: 30, step: 2, flat: 1 },
  /** 山の すそと みなす 海からの 高さ（石段の おわり） */
  shore: 2,
  /** かねの やぐら: お堂から さがす きょり（from, to, step） */
  yagura: { from: 8, to: 24, step: 2 },
  /** いど: 頂上から さがす きょり（山の すその へいち）・頂上より これ だけ 低い 所だけ */
  ido: { from: 16, to: 34, step: 3, below: 6 },
  /** おじぞうさん: 石段の 何ぶんの 何の 所に 立てるか（2 か所）・道の まん中から の きょり */
  ojizou: { at: [0.4, 0.75] as const, side: 8, sideTries: [0, 2, -2, 4] as const, alongTries: [0, 2, -2, 4, -4, 6, -6] as const },
  /** 大きな 石ぞう: 1 つの 山に 置く 確率（0〜1）・さがす きょり・かべの 高さ（石ぞうの 背の すこし うしろの 地面が これ 以上 高い）・かべまでの きょり */
  sekizou: { chance: 0.6, from: 6, to: 40, step: 1, wallHigh: 4, wallDist: 6 },
  /** いしの とりい（いわやま）: さがす きょり */
  ishiTorii: { from: 10, to: 38, step: 4 },
} as const;

const T = STRUCTURE_TUNE;

type Rect = readonly [number, number, number, number];
/** もう 置いた 物と かさならない か */
const free = (used: readonly Rect[], p: Rect): boolean => used.every((u) => !overlaps(u, p));

/** てんぐの やま: お堂 ＋ 石段 ＋ とりい。向きは シードの 順に 4 方位を ためし、石段が 通る 最初の 向きを つかう。どれも だめなら お堂だけ */
export function tenguStructures(c: Ctx, s: Summit): FeatureSite[] {
  const ground = groundFn(c);
  const order = DIRS.map((d, n) => ({ d, r: rnd(c, 'odou', n) })).sort((a, b) => a.r - b.r).map((q) => q.d);
  const out: FeatureSite[] = [];
  const used: Rect[] = [];
  const add = (f: FeatureSite): void => { out.push(f); used.push(f.foot); };
  let anchor: { x: number; z: number } | null = null;
  let fallback: { x: number; z: number; placed: NonNullable<ReturnType<typeof findNear>>['placed'] } | null = null;
  for (const d of order) {
    const odou = findNear(STRUCTURES.odou, s.x, s.z, rotOf(d), c.i * 7 + c.j, ground, 0, T.summitSearch);
    if (odou === null) continue;
    fallback ??= odou;
    const stairs = placeStairs(odou.x + T.stairGap * d[0], odou.z + T.stairGap * d[1], d, c.i * 31 + c.j, ground, atFoot(c, ground));
    if (stairs === null) continue;
    anchor = odou;
    add(siteOf(c, 'odou', odou.x, odou.z, odou.placed));
    const rects = stairs.path.map((p) => (d[0] !== 0 ? ([p.x, p.z - 5, p.x, p.z + 5] as const) : ([p.x - 5, p.z, p.x + 5, p.z] as const))); // 1 歩ごとの 四角（はば 3 ＋ いしどうろう）
    const first = stairs.path[0]!;
    add(site(c, 'ishidan', first.x, first.y + 1, first.z, stairs.blocks, stairs.foot, { rects, path: stairs.path }));
    // とりい: 石段の おわりの さきに、近い 方から
    const last = stairs.path[stairs.path.length - 1]!;
    for (let g = T.toriiGap[0]; g <= T.toriiGap[1]; g++) {
      const tx = last.x + g * d[0];
      const tz = last.z + g * d[1];
      const t = placeStructure(STRUCTURES.torii, tx, tz, rotOf(d), c.i * 13 + c.j, ground);
      if (t !== null) {
        add(siteOf(c, 'torii', tx, tz, t));
        break;
      }
    }
    // おじぞうさん: 石段の とちゅう 2 か所、道の わき（左右 たがいちがい）。石段の ほうを 向く
    const px = -d[1];
    const pz = d[0];
    T.ojizou.at.forEach((frac, n) => {
      if (stairs.path.length === 0) return;
      const side = (range(rnd(c, 'ojizou', 0), 0, 1) + n) % 2 === 0 ? 1 : -1;
      // ちょうど よい 所が なければ、道に そって ずらしたり はなれたり して ためす
      for (const al of T.ojizou.alongTries) {
        for (const so of T.ojizou.sideTries) {
          const q = stairs.path[Math.max(0, Math.min(stairs.path.length - 1, Math.floor(stairs.path.length * frac) + al))]!;
          const ox = q.x + side * (T.ojizou.side + so) * px;
          const oz = q.z + side * (T.ojizou.side + so) * pz;
          const o = placeStructure(STRUCTURES.ojizou, ox, oz, rotOf([-side * px, -side * pz]), c.i * 3 + n, ground);
          if (o !== null && free(used, o.foot)) { add(siteOf(c, 'ojizou', ox, oz, o)); return; }
        }
      }
    });
    break;
  }
  if (anchor === null && fallback !== null) {
    anchor = fallback;
    add(siteOf(c, 'odou', fallback.x, fallback.z, fallback.placed));
  }
  if (anchor === null) return out;
  const a = anchor;
  // かねの やぐら: お堂の ちかくの 平らな 所。お堂の ほうを 向く
  const y = gridSearch(STRUCTURES.yagura, a.x, a.z, T.yagura.from, T.yagura.to, T.yagura.step, c.i * 11 + c.j, ground, (x, z) => facing(x, z, a.x, a.z), (_x, _z, p) => free(used, p.foot));
  if (y !== null) add(siteOf(c, 'yagura', y.x, y.z, y.placed));
  const i = idoSite(c, s, ground, used);
  if (i !== null) out.push(i);
  return out;
}

/** いど: 頂上から はなれた 山の すその 平らな 所（頂上より 低い 所だけ）。頂上の ほうを 向く */
function idoSite(c: Ctx, s: Summit, ground: (x: number, z: number) => number, used: readonly Rect[]): FeatureSite | null {
  const r = ringSearch(STRUCTURES.ido, s.x, s.z, T.ido.from, T.ido.to, T.ido.step, c.i * 19 + c.j, ground, (x, z) => facing(x, z, s.x, s.z), (_x, _z, p) => p.baseY <= s.h - T.ido.below && free(used, p.foot));
  return r === null ? null : siteOf(c, 'ido', r.x, r.z, r.placed);
}

/** 石段の おわり（山の すそ）に なる 列か */
const atFoot = (c: Ctx, ground: (x: number, z: number) => number) => (x: number, z: number): boolean => {
  const shape = c.T.map.mountainShape(x, z);
  return shape === null || shape.m <= c.T.map.baseHeight(x, z) || ground(x, z) < SEA_Y + T.shore;
};

/** もみじやま: 頂上の ちかくに あずまや、頂上から はなれた たいらな 広場に とりいと ほこら（頂上の ほうを 向く）、すそに いど */
export function momijiStructures(c: Ctx, s: Summit): FeatureSite[] {
  const ground = groundFn(c);
  const out: FeatureSite[] = [];
  const used: Rect[] = [];
  const add = (f: FeatureSite): void => { out.push(f); used.push(f.foot); };
  const rot = range(rnd(c, 'azumaya', 0), 0, 3) as Rot;
  const az = findNear(STRUCTURES.azumaya, s.x, s.z, rot, c.i * 5 + c.j, ground, T.azumayaFrom, T.summitSearch);
  if (az !== null) add(siteOf(c, 'azumaya', az.x, az.z, az.placed));
  const flat: StructureShape = { ...STRUCTURES.torii, maxSlope: T.plaza.flat };
  const order = DIRS.map((d, n) => ({ d, r: rnd(c, 'torii', n) })).sort((a, b) => a.r - b.r);
  let toriiDir: Dir4 | null = null;
  for (let r = T.plaza.from; r <= T.plaza.to && toriiDir === null; r += T.plaza.step) {
    for (const { d } of order) {
      // 頂上から d の 向きに r はなれた 所。山の ほう（-d）を 向く とりい
      const x = s.x + d[0] * r;
      const z = s.z + d[1] * r;
      if (!plainAt(c, x, z)) continue;
      const t = placeStructure(flat, x, z, rotOf([-d[0], -d[1]]), c.i * 17 + c.j, ground);
      if (t === null || cheb(x, z, s.x, s.z) < T.plaza.from) continue;
      add(siteOf(c, 'torii', x, z, t));
      toriiDir = d;
      break;
    }
  }
  // ほこら: とりいの 向きとは べつの 広場。頂上の ほうを 向く
  const others = DIRS.filter((d) => toriiDir === null || d[0] !== toriiDir[0] || d[1] !== toriiDir[1]);
  const h = ringSearch(STRUCTURES.hokora, s.x, s.z, T.plaza.from, T.plaza.to, T.plaza.step, c.i * 23 + c.j, ground, (x, z) => facing(x, z, s.x, s.z), (_x, _z, p) => free(used, p.foot), others);
  if (h !== null) add(siteOf(c, 'hokora', h.x, h.z, h.placed));
  const i = idoSite(c, s, ground, used);
  if (i !== null) out.push(i);
  return out;
}

/** いわやま: 大きな 石ぞう（かべの 前の 平らな 所。1 つの 山に 0〜1）と いしの とりい。山の 点を 中心に さがす */
export function iwayamaStructures(c: Ctx): FeatureSite[] {
  const ground = groundFn(c);
  const out: FeatureSite[] = [];
  const used: Rect[] = [];
  const K = T.sekizou;
  if (rnd(c, 'sekizou', 0) < K.chance) {
    // かべ = 石ぞうの うしろ wallDist の 地面が wallHigh 以上 高い 向き。そちらを 背に して 立つ（前は その 反対）
    const front = new Map<number, Dir4>();
    const wallFront = (x: number, z: number): Dir4 => {
      const g = c.T.height(x, z);
      for (const d of DIRS) if (c.T.height(x - d[0] * K.wallDist, z - d[1] * K.wallDist) >= g + K.wallHigh) { front.set(x * 100003 + z, d); return d; }
      return [0, 1];
    };
    const r = gridSearch(STRUCTURES.sekizou, c.px, c.pz, K.from, K.to, K.step, c.i * 29 + c.j, ground, wallFront, (x, z) => front.has(x * 100003 + z));
    if (r !== null) {
      out.push(siteOf(c, 'sekizou', r.x, r.z, r.placed));
      used.push(r.placed.foot);
    }
  }
  const t = ringSearch(STRUCTURES.ishi_torii, c.px, c.pz, T.ishiTorii.from, T.ishiTorii.to, T.ishiTorii.step, c.i * 37 + c.j, ground, (x, z) => facing(x, z, c.px, c.pz), (_x, _z, p) => free(used, p.foot));
  if (t !== null) out.push(siteOf(c, 'ishi_torii', t.x, t.z, t.placed));
  return out;
}

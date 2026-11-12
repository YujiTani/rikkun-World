/**
 * 家の しゅるいの ブロック 20 こ（HOUSE-2B #364）の 面を 作る。形の 数は アートの 表（blocks/houseLookGeometry.data.ts）。three なし・世界を 読まない（純粋な 計算）。
 * ブロックの 番号は 形ごと なので、案（むら・おしろ・こうざん）・場所〔やねの 列・かべの まわり〕は 呼ぶ 側が 家の 記録から 引いて ctx で 渡す（ctx が null の ときは むらの 案・かんたんな 形）。
 * 世界〔render/houseProp.ts〕と 見本〔house/preview/mesh.ts〕が 同じ 面を 読む。面 1 まい ＝ 三角形 2 つ。1 マスの 面は おぼえて 毎フレーム 作らない。
 */
import { HOUSE_LOOK_GEOMETRY, type GeoBox } from '../blocks/houseLookGeometry.data';
import { LOOK_DOOR_INFO } from '../blocks/houseLookBlocks';
import { LOOK_WHITE } from '../blocks/houseTextures';
import { tileSubUv, type TileName } from '../blocks/textures';
import { FACE_SHADE_BY_INDEX } from './config';

/** 家の 記録から 引いた その マスの ようす（house/book.ts の LookCell ＋ かべの しゅるい） */
export interface LookCtx {
  /** その マスを 建てた しゅるいの id（例 `kawara_shiro`） */
  look: string;
  rx: number;
  ry: number;
  rz: number;
  ow: number;
  od: number;
  /** 家の 箱の 高さ（いちばん 上の 段 ＝ h − 1） */
  h: number;
}

/** 面 1 まい（4 つの 角・絵・明るさ。rgb ＝ 1 色の 箱の 色〔白い 絵に かける〕。sky・blk が null の ときは マスの 光） */
export interface LookPiece {
  pos: number[];
  uv: number[];
  shade: number;
  sky: number | null;
  blk: number | null;
  rgb: readonly [number, number, number] | null;
}

const EMIT_BLOCK = 0.8; // 自分で 光る 面の 光（0〜1。しょうじの 紙と 同じ）
const FACES = ['top', 'bottom', 'right', 'left', 'front', 'back'] as const;
type FaceName = (typeof FACES)[number];
/** 面の 角（meshChunk の FACES と 同じ 順。0 上・1 下・2 +x・3 −x・4 +z・5 −z） */
const FACE_VERTS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
/** 面の むき（x, z）。上下は [0, 0] */
const FACE_DIR: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const faceOfDir = (dx: number, dz: number): number => FACE_DIR.findIndex((d, i) => i >= 2 && d[0] === dx && d[1] === dz);
/** 1 回 まわす（+z → −x → −z → +x）。マスの 中の よこ向き 90 度 */
const turnDir = (d: readonly [number, number]): [number, number] => [-d[1], d[0]];

/** 「base:」「game:」の 絵の 呼び名 → 世界の 絵 */
const BASE_TILE: Readonly<Record<string, TileName>> = {
  wall: 'house_wall', wall_top: 'house_wall_top', roof_top: 'house_roof_top', roof_side: 'house_roof_side', shoji_edge: 'house_shoji_edge',
  door_lo: 'house_door_lo', door_hi: 'house_door_hi', door_edge: 'house_door_edge', shoji: 'house_shoji',
};
interface Surf {
  tile: TileName;
  rgb: readonly [number, number, number] | null;
  emit: boolean;
}
const SURF = new Map<string, Surf>();
function surf(spec: string): Surf {
  let s = SURF.get(spec);
  if (s) return s;
  const emit = spec.startsWith('emit:');
  const body = emit ? spec.slice(5) : spec;
  if (body.startsWith('tile:')) s = { tile: body.slice(5) as TileName, rgb: null, emit };
  else if (body.startsWith('base:')) s = { tile: BASE_TILE[body.slice(5)]!, rgb: null, emit };
  else if (body.startsWith('game:')) s = { tile: body.slice(5) as TileName, rgb: null, emit };
  else {
    const n = parseInt(body.slice(1), 16);
    s = { tile: LOOK_WHITE as TileName, rgb: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], emit };
  }
  SURF.set(spec, s);
  return s;
}

/** 点の 区間 [a, b) を 0〜16 に おさめる（はみ出す 箱は 16 ごとに くり返す） */
function wrap(a: number, b: number): [number, number] {
  if (b - a >= 16) return [0, 16];
  const k = Math.floor(a / 16) * 16;
  return [Math.max(0, a - k), Math.min(16, b - k)];
}

function mkPiece(pos: number[], uv: number[], face: number, s: Surf): LookPiece {
  return { pos, uv, shade: s.emit ? 1 : FACE_SHADE_BY_INDEX[face]!, sky: s.emit ? 0 : null, blk: s.emit ? EMIT_BLOCK : null, rgb: s.rgb };
}

/** 箱 [min, max]（点）の 面 f を 1 まい。絵は 面の はんい（点）で 切る */
function boxFace(min: readonly number[], max: readonly number[], f: number, s: Surf): LookPiece {
  const [x0, y0, z0] = min as [number, number, number];
  const [x1, y1, z1] = max as [number, number, number];
  let u0: number, u1: number, v0: number, v1: number;
  if (f >= 4) {
    [u0, u1] = f === 4 ? wrap(x0, x1) : wrap(16 - x1, 16 - x0);
    [v0, v1] = [16 - y1, 16 - y0];
  } else if (f >= 2) {
    [u0, u1] = f === 3 ? wrap(z0, z1) : wrap(16 - z1, 16 - z0);
    [v0, v1] = [16 - y1, 16 - y0];
  } else {
    [u0, u1] = wrap(x0, x1);
    [v0, v1] = wrap(z0, z1);
  }
  const uv = tileSubUv(s.tile, u0, Math.max(0, v0), u1, Math.min(16, v1));
  return mkPiece(
    FACE_VERTS[f]!.flatMap((v) => [(v[0] ? x1 : x0) / 16, (v[1] ? y1 : y0) / 16, (v[2] ? z1 : z0) / 16]),
    [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]],
    f,
    s,
  );
}

interface BoxOpt {
  /** マスの 中で よこ向きに まわす 回数（art は 南向き。北 2・西 1・東 3） */
  q?: number;
  /** この 高さ（点）から 下を 切りすてて その 分 下げる（戸の 上の マス） */
  clip?: readonly [number, number];
  /** 出す 面（元の 向きの 名前）。なければ ぜんぶ */
  only?: ReadonlySet<FaceName>;
  /** 出さない 面（マスの 外が わと くっつく 面）。上 ＝ y 16、下 ＝ y 0、左右 ＝ x 0・16 */
  trim?: boolean;
}

/** アートの 箱 1 つ → 面（かべに うまる 面 skip・trim の 面は 出さない） */
function boxPieces(b: GeoBox, o: BoxOpt = {}): LookPiece[] {
  let [x0, y0, z0] = b.a as [number, number, number];
  let [x1, y1, z1] = b.b as [number, number, number];
  if (o.clip) {
    const [lo, hi] = o.clip;
    if (y1 <= lo || y0 >= hi) return [];
    y0 = Math.max(y0, lo) - lo;
    y1 = Math.min(y1, hi) - lo;
  }
  const q = o.q ?? 0;
  const out: LookPiece[] = [];
  for (let f = 0; f < 6; f++) {
    const name = FACES[f]!;
    if (b.skip?.includes(name) || (o.only && !o.only.has(name))) continue;
    if (o.trim && ((f === 0 && y1 >= 16) || (f === 1 && y0 <= 0) || (f === 2 && x1 >= 16) || (f === 3 && x0 <= 0))) continue;
    if (!o.clip && f === 1 && y0 === 0 && b.kind === 'cube') continue;
    const spec = b.tiles[name] ?? (f >= 2 ? b.tiles.side : undefined) ?? b.tiles.all;
    if (!spec) continue;
    // まわす: 角を 中心(8, 8) の まわりに まわし、面の むきも まわす
    let fi = f;
    let [ax, az, bx, bz] = [x0, z0, x1, z1];
    for (let i = 0; i < q; i++) {
      const [da, db] = [turnDir([ax - 8, az - 8]), turnDir([bx - 8, bz - 8])];
      [ax, az, bx, bz] = [da[0] + 8, da[1] + 8, db[0] + 8, db[1] + 8];
      if (fi >= 2) fi = faceOfDir(...turnDir(FACE_DIR[fi]!));
    }
    out.push(boxFace([Math.min(ax, bx), y0, Math.min(az, bz)], [Math.max(ax, bx), y1, Math.max(az, bz)], fi, surf(spec)));
  }
  return out;
}

// ------------------------------------------------------------ やね

type Pt = readonly [number, number];
const profCache = new Map<string, readonly Pt[]>();
const RIDGE_X = 56; // アートの やねの むね（外の たて 7 ＝ 112 点の はんぶん）
const SLOPE = 0.5; // 2 マスで 1 段（点 ÷ 点）
const STEP_RISE = 8; // こうざんの かいだんの 1 段（点）。1 列（16 点）ごと

/** やねの 断面（点。z ＝ たての 位置・y ＝ やねの 1 段目の 下から）。外の たて od の ぶん。アートの 7 の 形を 外へ のばす（かいだんは 段を ふやし、ほかは 同じ かたむき） */
function profile(kind: string, od: number): readonly Pt[] {
  const key = `${kind}:${od}`;
  let p = profCache.get(key);
  if (p) return p;
  const geo = HOUSE_LOOK_GEOMETRY[`roof:${kind}`]?.find((g) => g.kind === 'prism' && g.prof && g.x?.[0] === 0)?.prof ?? [[0, 64], [0, 64], [RIDGE_X, 64], [112, 64], [112, 64]];
  const half: Pt[] = geo.slice(1, -1).filter((q) => q[0] <= RIDGE_X).map((q) => [q[0], q[1] - 64] as const);
  const T = 8 * od;
  const last = half[half.length - 1]!;
  const stepped = kind.endsWith('_kozan');
  if (T > RIDGE_X) {
    if (stepped) for (let t = RIDGE_X + 8; t < T; t += 16) half.push([t, last[1] + STEP_RISE * ((t - RIDGE_X + 8) / 16 - 1)], [t, last[1] + STEP_RISE * ((t - RIDGE_X + 8) / 16)]);
    else half.push([T, last[1] + SLOPE * (T - RIDGE_X)]);
  }
  const full: Pt[] = [[0, 0], ...half, ...half.slice(0, -1).reverse().map((q) => [2 * T - q[0], q[1]] as const), [2 * T, 0]];
  p = full;
  profCache.set(key, p);
  return p;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** やね 1 マス（外の たて od の rz 列目・やねの 1 段目から ly 段目）。capL・capR ＝ よこの はし（しりの 面を 出す） */
function roofPieces(kind: string, od: number, rz: number, ly: number, capL: boolean, capR: boolean, ceiling: boolean, profKind: string = kind): LookPiece[] {
  const P = profile(profKind, od); // 断面（かたむき）は profKind・絵は kind
  const geo = HOUSE_LOOK_GEOMETRY[`roof:${kind}`]?.find((g) => g.kind === 'prism' && g.tiles.top);
  const T = geo!.tiles;
  const top = surf(T.top!);
  const front = surf(T.front ?? T.top!);
  const cap = surf(T.cap ?? T.front ?? T.top!);
  const t0 = 16 * rz;
  const t1 = t0 + 16;
  const lo = 16 * ly;
  const hi = lo + 16;
  const out: LookPiece[] = [];
  const quad = (v: Array<[number, number, number]>, face: number, s: Surf, uvs: Array<[number, number]>): void => {
    const r = tileSubUv(s.tile, 0, 0, 16, 16);
    out.push(mkPiece(v.flatMap((p) => [p[0], p[1], p[2]]), uvs.flatMap((u) => [lerp(r[0], r[2], u[0]), lerp(r[1], r[3], u[1])]), face, s));
  };
  const lastRow = rz === od - 1;
  for (let i = 0; i + 1 < P.length; i++) {
    const [ta, ya] = P[i]!;
    const [tb, yb] = P[i + 1]!;
    if (ta === tb) {
      // かいだんの 立ち上がり（のきの へり・むねの かいだん）。ta ＝ この 列の 手前の へり
      if (!(ta >= t0 && (ta < t1 || (lastRow && ta === t1)))) continue;
      const a = Math.max(Math.min(ya, yb), lo);
      const b = Math.min(Math.max(ya, yb), hi);
      if (b <= a) continue;
      const z = (ta - t0) / 16;
      const ya0 = (a - lo) / 16;
      const yb0 = (b - lo) / 16;
      if (yb > ya) quad([[1, ya0, z], [0, ya0, z], [0, yb0, z], [1, yb0, z]], 5, front, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      else quad([[0, ya0, z], [1, ya0, z], [1, yb0, z], [0, yb0, z]], 4, front, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      continue;
    }
    const s0 = Math.max(ta, t0);
    const s1 = Math.min(tb, t1);
    if (s1 <= s0) continue;
    const yAt = (t: number): number => lerp(ya, yb, (t - ta) / (tb - ta));
    // 段の さかいを またぐ ところで 切る
    const cuts = [s0, s1];
    for (const lv of [lo, hi]) if ((yAt(s0) - lv) * (yAt(s1) - lv) < 0) cuts.push(ta + ((lv - ya) / (yb - ya)) * (tb - ta));
    cuts.sort((m, n) => m - n);
    for (let c = 0; c + 1 < cuts.length; c++) {
      const [u0, u1] = [cuts[c]!, cuts[c + 1]!];
      if (u1 - u0 < 1e-6) continue;
      const [e0, e1] = [yAt(u0), yAt(u1)];
      const mid = (e0 + e1) / 2;
      if (mid < lo) continue;
      const [z0, z1] = [(u0 - t0) / 16, (u1 - t0) / 16];
      const [h0, h1] = [Math.min(Math.max(e0 - lo, 0), 16) / 16, Math.min(Math.max(e1 - lo, 0), 16) / 16];
      if (mid <= hi) quad([[0, h1, z1], [1, h1, z1], [1, h0, z0], [0, h0, z0]], 0, top, [[0, z1], [1, z1], [1, z0], [0, z0]]);
      if (capL) quad([[0, 0, z0], [0, 0, z1], [0, h1, z1], [0, h0, z0]], 3, cap, [[z0, 0], [z1, 0], [z1, h1], [z0, h0]]);
      if (capR) quad([[1, 0, z1], [1, 0, z0], [1, h0, z0], [1, h1, z1]], 2, cap, [[z1, 0], [z0, 0], [z0, h0], [z1, h1]]);
    }
  }
  // 天井（いちばん 下の 段の 下の 面。中から 見える）
  if (ly === 0 && ceiling) quad([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], 1, front, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return out;
}

/** むねの かざり（アートの むねの 小さな 箱。むねの 列の いちばん 上の 段 だけ）。外の たてが ふえた 分 むねが 上がる のを 足す */
function ridgePieces(kind: string, od: number, ly: number): LookPiece[] {
  const P = profile(kind, od);
  const ridgeY = Math.max(...P.map((p) => p[1]));
  if (ridgeY >= 16 * (ly + 1) || ridgeY < 16 * ly) return [];
  const base = Math.max(...profile(kind, 7).map((p) => p[1]));
  const out: LookPiece[] = [];
  for (const g of HOUSE_LOOK_GEOMETRY[`roof:${kind}`] ?? []) {
    if (g.kind !== 'box' || !g.a || !g.b || g.a[1]! < 80 || g.a[2]! < 40 || g.b[2]! > 72) continue; // むねの かざり だけ（のきの 板・へりは のぞく）
    const dy = ridgeY - base - 16 * ly - 64;
    const sh = (v: readonly number[]): [number, number, number] => [0, v[1]! + dy, v[2]! - RIDGE_X + 8];
    const a = sh(g.a);
    const b = sh(g.b);
    out.push(...boxPieces({ ...g, a: [0, a[1], a[2]], b: [16, b[1], b[2]] }, { clip: [0, 16] }));
  }
  return out;
}

// ------------------------------------------------------------ 1 マスの 面（ブロックごと）

/** その 形の ブロック id → { ばしょ, 形 }（`lk_<ばしょ>_<形>`） */
const idParts = (id: string): { part: string; form: string } => {
  const m = /^lk_([a-z]+)_(.+)$/.exec(id)!;
  return { part: m[1]!, form: m[2]! };
};
/** しゅるいの id（`kawara_shiro`・`shachi`・`hotaru`）→ 案（なければ null） */
const styleOf = (look: string | undefined): string => /_(mura|shiro|kozan)$/.exec(look ?? '')?.[1] ?? 'mura';
const geoOf = (key: string): readonly GeoBox[] => HOUSE_LOOK_GEOMETRY[key] ?? [];

const onRing = (c: LookCtx, x: number, z: number): boolean => x === 0 || z === 0 || x === c.ow - 1 || z === c.od - 1;
/** 外まわりの マスの 出す 面（となりが 外まわりなら かくれる。中の 空気・外は 見える） */
function ringFaceSet(c: LookCtx): Set<number> {
  const s = new Set<number>();
  for (let f = 2; f < 6; f++) {
    const [dx, dz] = FACE_DIR[f]!;
    const nx = c.rx + dx;
    const nz = c.rz + dz;
    const outside = nx < 0 || nz < 0 || nx >= c.ow || nz >= c.od;
    if (outside || !onRing(c, nx, nz)) s.add(f);
  }
  if (c.ry === c.h - 1) s.add(0); // やねが ない ときだけ かべの 上が 見える
  return s;
}
/** かべの むき（外へ）: 戸の かべ ＝ 南(+z)。うしろ ＝ 北・ひだり ＝ 西・みぎ ＝ 東 */
function outTurns(c: LookCtx): number {
  if (c.rz === c.od - 1) return 0;
  if (c.rz === 0) return 2;
  return c.rx === 0 ? 1 : 3;
}

const cache = new Map<string, readonly LookPiece[]>();

function build(id: string, c: LookCtx | null): LookPiece[] {
  if (id in LOOK_DOOR_INFO) return doorPieces(styleOf(c?.look), LOOK_DOOR_INFO[id as keyof typeof LOOK_DOOR_INFO]);
  const { part, form } = idParts(id);
  const style = styleOf(c?.look);
  const kind = `${form}_${style}`;
  switch (part) {
    case 'roof': {
      if (!c) return cubeOf(geoOf(`roof:${kind}`).find((g) => g.kind === 'prism')?.tiles.top);
      const ly = c.ry - 4; // やねの 1 段目は 床の 上 4 段目（ROOF_Y）
      return [...roofPieces(kind, c.od, c.rz, ly, c.rx === 0, c.rx === c.ow - 1, !onRing(c, c.rx, c.rz)), ...(c.rz === (c.od - 1) / 2 ? ridgePieces(kind, c.od, ly) : [])];
    }
    case 'wall': {
      const g = id === 'lk_wall_pillar' ? geoOf('pillar')[0] : geoOf(`wall:${kind}`)[0];
      return g ? ringCube(g, c) : [];
    }
    case 'window': {
      const q = c && c.rz !== 0 && c.rz !== c.od - 1 ? 1 : 0; // よこの かべ（ひだり・みぎ）は 90 度
      // 紙の 板は まえ・うしろ だけ、窓台は まえ・うしろ・上、上の 横木は まえ・うしろ・下（ほかは かべの 中・となりと くっつく）
      const faces: ReadonlyArray<ReadonlySet<FaceName>> = [new Set(['front', 'back']), new Set(['front', 'back', 'top']), new Set(['front', 'back', 'bottom'])];
      return geoOf(`window:${kind}`).flatMap((g, i) => boxPieces(g, { q, only: faces[i] ?? faces[0]! }));
    }
    case 'deco':
      return decoPieces(form, kind, c);
    case 'light':
      return geoOf(`light:${form}`).flatMap((g) => boxPieces(g));
  }
  return [];
}

function cubeOf(spec: string | undefined): LookPiece[] {
  return spec ? boxPieces({ kind: 'cube', a: [0, 0, 0], b: [16, 16, 16], tiles: { all: spec } }) : [];
}

/** かべの 立方体（外まわりの 面だけ。ctx が なければ ぜんぶ） */
function ringCube(g: GeoBox, c: LookCtx | null): LookPiece[] {
  const keep = c ? ringFaceSet(c) : null;
  return boxPieces(g).filter((p) => keep === null || faceKept(p, keep));
}
/** 面の むきを 位置から 当てる（立方体の 6 面は 向きごとに 1 まい） */
function faceKept(p: LookPiece, keep: Set<number>): boolean {
  const n = faceIndexOf(p);
  return n < 0 || keep.has(n);
}
function faceIndexOf(p: LookPiece): number {
  const xs = [p.pos[0]!, p.pos[3]!, p.pos[6]!, p.pos[9]!];
  const ys = [p.pos[1]!, p.pos[4]!, p.pos[7]!, p.pos[10]!];
  const zs = [p.pos[2]!, p.pos[5]!, p.pos[8]!, p.pos[11]!];
  const flat = (a: number[]): boolean => a.every((v) => v === a[0]);
  if (flat(ys)) return ys[0] === 1 ? 0 : 1;
  if (flat(xs)) return xs[0] === 1 ? 2 : 3;
  if (flat(zs)) return zs[0] === 1 ? 4 : 5;
  return -1;
}

function doorPieces(style: string, d: { top: boolean; open: boolean }): LookPiece[] {
  const boxes = geoOf(`door:tetsu_${style}`);
  const clip: [number, number] = d.top ? [16, 32] : [0, 16];
  if (!d.open) return boxes.flatMap((g) => boxPieces(g, { clip }));
  // あけた 形: 外へ 90 度（左右に ひらく）。とびらの 絵は しめた 戸の まえの 面
  const leaf = boxes.find((g) => g.tiles.front)!;
  const front = d.top ? (boxes.filter((g) => g.tiles.front)[1] ?? leaf) : leaf;
  const spec = front.tiles.front!;
  const side = front.tiles.side ?? '#2a2c31';
  const frame = boxes.filter((g) => !g.tiles.front);
  return [
    ...[[0, 4], [12, 16]].flatMap(([a, b]) => boxPieces({ kind: 'box', a: [a!, 0, 16], b: [b!, 16, 24], tiles: { left: spec, right: spec, side, top: side, bottom: side } })),
    ...frame.flatMap((g) => boxPieces(g, { clip })),
  ];
}

function decoPieces(form: string, kind: string, c: LookCtx | null, turns?: number): LookPiece[] {
  if (form === 'hanadan') {
    const q = turns ?? (c ? outTurns(c) : 0);
    const boxes = geoOf(`deco:${kind}`);
    // かべの わく（0〜3）は まえ・うしろ だけ、はこ（4・5）と 花（7・9・11・13）は 上と まえ、くき（6・8・10・12）は 出さない
    const faces: ReadonlyArray<ReadonlySet<FaceName>> = [new Set(['back']), new Set(['front']), new Set(['front']), new Set(['front']), new Set(['top', 'front']), new Set(['top', 'front'])];
    return boxes.flatMap((g, i) => (i >= 6 && i % 2 === 0 ? [] : boxPieces(g, { q, only: faces[Math.min(i, 5)], trim: true })));
  }
  if (form === 'noren') {
    if (turns !== undefined) return geoOf(`deco:${kind}`).flatMap((g) => boxPieces(g, { clip: [16, 32], q: turns })); // 手で 置いた のれん: かべ なし・向きだけ
    const wall = c ? ringCube({ kind: 'cube', a: [0, 0, 0], b: [16, 16, 16], tiles: { side: 'base:wall', top: 'base:wall_top' } }, c) : [];
    return [...wall, ...geoOf(`deco:${kind}`).flatMap((g) => boxPieces(g, { clip: [16, 32] }))];
  }
  if (form === 'shachi') return geoOf('deco:shachi').flatMap((g) => boxPieces(g));
  return geoOf(`deco:${kind}`).flatMap((g) => boxPieces(g)); // えんとつ
}

function keyOf(id: string, c: LookCtx | null): string {
  if (!c) return `${id}|`;
  if (id.startsWith('lk_roof_')) return `${id}|${c.look}|${c.od}|${c.rz}|${c.ry}|${c.rx === 0 ? 1 : 0}${c.rx === c.ow - 1 ? 1 : 0}`;
  if (id.startsWith('lk_wall_') || id === 'lk_deco_noren') return `${id}|${c.look}|${[...ringFaceSet(c)].join('')}`;
  if (id === 'lk_deco_hanadan') return `${id}|${c.look}|${outTurns(c)}`;
  if (id.startsWith('lk_window_')) return `${id}|${c.look}|${c.rz !== 0 && c.rz !== c.od - 1 ? 1 : 0}`;
  return `${id}|${c.look}`;
}

/** 家の しゅるいの ブロック 1 マスの 面（おぼえた 物を 返す。ctx ＝ 家の 記録から 引いた ようす〔なければ null〕） */
export function lookPieces(id: string, c: LookCtx | null): readonly LookPiece[] {
  const key = keyOf(id, c);
  let p = cache.get(key);
  if (!p) {
    p = build(id, c);
    cache.set(key, p);
  }
  return p;
}

// ------------------------------------------------------------ 手で 置いた 物（HOUSE-2C §2.6・§2.7）

/** 手で 置いた 物の 記録（house/placedLooks.ts の PlacedLook と 同じ 形。ここは 何も import しない） */
export interface PlacedLookView {
  style: string;
  /** 前が 向く 方位（n ＝ −z・s ＝ ＋z・e ＝ ＋x・w ＝ −x） */
  facing: 'n' | 'e' | 's' | 'w';
}
/** 絵の 向き（art は 南向き）から 方位への まわす 回数（家具と 同じ きめ。boxPieces の q） */
const TURNS_OF_FACING: Readonly<Record<PlacedLookView['facing'], number>> = { s: 0, w: 1, n: 2, e: 3 };
/** 北〔−z〕から 方位へ 時計まわりに まわす 回数（turnPieces） */
const TURNS_FROM_NORTH: Readonly<Record<PlacedLookView['facing'], number>> = { n: 0, e: 1, s: 2, w: 3 };
/** 手置きの ななめの やねに つかう 1 マス（外の たて 7 の 3 列目・やねの 2 段目 ＝ ななめの「なか」。のきは 北〔−z〕がわ） */
const SLOPE_CELL = { od: 7, rz: 2, ly: 1 } as const;

/** マスの まん中(0.5, 0.5) の まわりに 北を facing に むける ように まわす（北 → 東 → 南 → 西 の 順に 1 回ずつ） */
function turnPieces(ps: readonly LookPiece[], n: number): LookPiece[] {
  return ps.map((p) => {
    const pos = [...p.pos];
    for (let i = 0; i < 4; i++) {
      let dx = pos[i * 3]! - 0.5;
      let dz = pos[i * 3 + 2]! - 0.5;
      for (let t = 0; t < n; t++) [dx, dz] = [-dz, dx];
      pos[i * 3] = dx + 0.5;
      pos[i * 3 + 2] = dz + 0.5;
    }
    return { ...p, pos };
  });
}

/** 1 マスだけ 置く ななめの やねの 下の 面と うしろの 面を 足して とじる（北むきの 形。うしろ ＝ +z。高さは うしろの はしの いちばん 高い ところ） */
function closeBottomBack(ps: readonly LookPiece[], kind: string): LookPiece[] {
  const geo = HOUSE_LOOK_GEOMETRY[`roof:${kind}`]?.find((g) => g.kind === 'prism' && g.tiles.top);
  const s = surf(geo!.tiles.front ?? geo!.tiles.top!);
  const hb = Math.max(0, ...ps.flatMap((p) => [0, 1, 2, 3].filter((i) => Math.abs(p.pos[i * 3 + 2]! - 1) < 1e-6).map((i) => p.pos[i * 3 + 1]!)));
  const r = tileSubUv(s.tile, 0, 0, 16, 16);
  const uv = [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]];
  return [...ps, mkPiece([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], uv, 1, s), mkPiece([0, 0, 1, 1, 0, 1, 1, hb, 1, 0, hb, 1], uv, 4, s)];
}

const placedCache = new Map<string, readonly LookPiece[]>();

/**
 * 手で 置いた 物 1 マスの 面（置いた ときの 記録の 案・向き）。ななめの やねは 「なか」の 形 1 マス（のきが facing がわ・上や 下の 面でも 同じ）、のれん・はなだんは 前が facing がわ。
 * ほかの 形は 向きを 使わず 案だけ 変える。記録が null なら lookPieces(id, null)（立方体・むら）と 同じ
 */
export function placedLookPieces(id: string, placed: PlacedLookView | null): readonly LookPiece[] {
  if (!placed) return lookPieces(id, null);
  const key = `${id}|${placed.style}|${placed.facing}`;
  let out = placedCache.get(key);
  if (out) return out;
  const { part, form } = idParts(id);
  const kind = `${form}_${placed.style}`;
  if (part === 'roof') {
    const c = SLOPE_CELL;
    // こうざんの かいだん（かたい 段）は 手置きの 1 マスでは ななめに ならない ので、かたむきだけ さんかくの やねの なかを つかい、絵は その 案の まま
    const slope = kind.endsWith('_kozan') ? `${form}_mura` : kind;
    out = turnPieces(closeBottomBack(roofPieces(kind, c.od, c.rz, c.ly, true, true, false, slope), kind), TURNS_FROM_NORTH[placed.facing]);
  } else if (part === 'deco' && (form === 'noren' || form === 'hanadan')) {
    out = decoPieces(form, kind, null, TURNS_OF_FACING[placed.facing]);
  } else {
    out = lookPieces(id, { look: id in LOOK_DOOR_INFO ? `tetsu_${placed.style}` : kind, rx: 0, ry: 0, rz: 0, ow: 1, od: 1, h: 1 });
  }
  placedCache.set(key, out);
  return out;
}

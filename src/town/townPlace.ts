import { CHUNK_SIZE, SEA_Y } from '../contracts';
import { GEN_CONFIG as GEN } from '../world/gen/config';
import { flatOf } from '../world/gen/worldInfo';
import { startFeaturesOf } from '../world/gen/features';
import { hash01, subSeed } from '../world/gen/random';
import { terrainFor, type Terrain } from '../world/gen/terrain';
import { FACING_VEC, TownPlan, type TownRecord, type XZ } from './townPlan';
import { TOWN, type Facing } from './townTuning';

/**
 * TOWN-1 1B-1: 街の 置き場所を きめる（TOWN-1-place.md §4.5「置き場所」）。
 * スタート地点の 向こうに 門が 向くように 4 方向の どれかへ まわし、門の まん中が スタートから 横 16〜28 マス。
 * 候補は シード付きの じゅんに しらべ、さいしょに 合う 所。なければ 街の まん中が 160 マスまで 広げる。
 * 水・見通し・はじまりの 岩山と テストの 場所・ふるい はたけの 場所・洞くつの 口・前の セーブの 列と 重ならない。
 */

const N = TOWN.size;
const GATE_CELL: Readonly<Record<Facing, { i: number; j: number }>> = {
  s: { i: N / 2, j: N - 1 },
  n: { i: N / 2 - 1, j: 0 },
  e: { i: N - 1, j: N / 2 - 1 },
  w: { i: 0, j: N / 2 },
};
/** 4 方向: 街が ひろがる 向き（away ＝ スタートから 見て 街の ある 向き）。門の 正面は その 反対 */
const AWAY: readonly { away: XZ; facing: Facing }[] = [
  { away: { x: 0, z: 1 }, facing: 'n' },
  { away: { x: 1, z: 0 }, facing: 'w' },
  { away: { x: 0, z: -1 }, facing: 's' },
  { away: { x: -1, z: 0 }, facing: 'e' },
];

/** 候補 1 つ: 門の マス（スタートから gate まで）と 向き */
interface Cand {
  gate: XZ;
  facing: Facing;
  /** 1 ＝ 門が スタートから 16〜28（はじめの 候補）、2 ＝ 遠くへ 広げた 候補 */
  phase: 1 | 2;
}

export interface PlaceOpts {
  /** その 列（cx, cz）に 前の セーブの プレイヤーの 物が ある（保存して ある）か。街の はんいと すそに かかる 列が ある 候補は とばす */
  occupied?: (cx: number, cz: number) => boolean;
  /** 街を 置いては いけない 列（x, z）の 一覧。はじまりの 坑道の 道・盛り土（街の 地ならしは 列を まるごと 書きかえるので、通る 列に かかると 坑道が 切れる。MINE-1C の 通し） */
  avoid?: readonly XZ[];
  /** しらべた 数を 理由ごとに 数える（テスト・調べもの用） */
  why?: Record<string, number>;
}

function candidates(seed: number, sp: XZ): Cand[] {
  const s = subSeed(seed, 0x70a1);
  const order = (n: number, tag: number): number[] => Array.from({ length: n }, (_, i) => i).sort((a, b) => hash01(s, tag, a) - hash01(s, tag, b));
  const out: Cand[] = [];
  const mk = (d: (typeof AWAY)[number], along: number, lat: number, phase: 1 | 2): void => {
    // away の 向きに along、横に lat（away に 直角）
    const px = -d.away.z;
    const pz = d.away.x;
    out.push({ gate: { x: sp.x + d.away.x * along + px * lat, z: sp.z + d.away.z * along + pz * lat }, facing: d.facing, phase });
  };
  const dirs = order(4, 1);
  const lats = [0, 3, -3, 6, -6, 8, -8].sort((a, b) => Math.abs(a) - Math.abs(b));
  const near = order(8, 2).map((i) => 17 + i); // 17〜24
  // はじめ: 門が スタートから 16〜28（横に ずれても その はんい）
  for (const lat of lats) for (const a of near) for (const di of dirs) mk(AWAY[di]!, a, lat, 1);
  // つぎ: 街の まん中が searchMax まで（門を だんだん 遠くへ。横も ひろげる）
  for (let along = 29; along + N / 2 <= TOWN.searchMax; along += 3) {
    for (const lat of [0, 10, -10, 20, -20, 30, -30, 45, -45]) for (const di of dirs) mk(AWAY[di]!, along, lat, 2);
  }
  return out;
}

/** 候補の 街の 西北の すみ */
function cornerOf(c: Cand): XZ {
  const g = GATE_CELL[c.facing];
  return { x: c.gate.x - g.i, z: c.gate.z - g.j };
}

const rectsOverlap = (ax0: number, az0: number, ax1: number, az1: number, bx0: number, bz0: number, bx1: number, bz1: number): boolean => ax0 <= bx1 && ax1 >= bx0 && az0 <= bz1 && az1 >= bz0;

/** 街の はんいの 地形の しらべ（step 間かくで 見る）。水の わりあい・陸の 高さの 差と 中央値 */
interface Stat {
  wetFrac: number;
  range: number;
  median: number;
}
function statOf(T: Terrain, cand: Cand, step: number): Stat {
  const c = cornerOf(cand);
  const land: number[] = [];
  let wetN = 0;
  let n = 0;
  for (let z = c.z; z < c.z + N; z += step) {
    for (let x = c.x; x < c.x + N; x += step) {
      n++;
      const h = T.height(x, z);
      if (h <= SEA_Y + 1 || T.map.pondAt(x, z) !== null || T.liquid.pondAt(x, z) !== null) wetN++;
      else land.push(h);
    }
  }
  land.sort((a, b) => a - b);
  if (land.length === 0) return { wetFrac: 1, range: 0, median: SEA_Y + 3 };
  return { wetFrac: wetN / n, range: land[land.length - 1]! - land[0]!, median: land[land.length >> 1]! };
}

/** スタートの 目の 高さから 門の てっぺんまでの 線が 地形に ふさがれないか（すその なだらかな 高さも 見る） */
function seesGate(T: Terrain, sp: { x: number; z: number; h: number }, cand: Cand, groundY: number): boolean {
  const eyeY = sp.h + 1 + 1.6;
  const topY = groundY + 1 + TOWN.gateTopHeight;
  const c = cornerOf(cand);
  const plan = new TownPlan({ v: TOWN.version, x0: c.x, z0: c.z, facing: cand.facing, groundY });
  const dx = cand.gate.x + 0.5 - (sp.x + 0.5);
  const dz = cand.gate.z + 0.5 - (sp.z + 0.5);
  const len = Math.hypot(dx, dz);
  for (let t = 0; t <= len; t += 0.5) {
    const x = sp.x + 0.5 + (dx * t) / len;
    const z = sp.z + 0.5 + (dz * t) / len;
    const y = eyeY + ((topY - eyeY) * t) / len;
    if (plan.inTown(x, z)) continue; // 街の 中は 平ら（石どうろうは 門の 前に 置かない）
    const natural = T.height(Math.floor(x), Math.floor(z));
    const ground = plan.inSkirt(x, z) ? plan.skirtHeight(natural, x, z) : natural;
    if (y < ground + 1.1) return false;
  }
  return true;
}

const angleOk = (sp: XZ, cand: Cand, c: XZ): boolean => {
  const cx = c.x + N / 2;
  const cz = c.z + N / 2;
  const f = FACING_VEC[cand.facing];
  const vx = sp.x + 0.5 - cx;
  const vz = sp.z + 0.5 - cz;
  const cos = (f.x * vx + f.z * vz) / (Math.hypot(vx, vz) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI <= TOWN.facingDegMax;
};

/** 街の 置き場所を きめる。見つからなければ null（水だらけ など） */
export function chooseTown(seed: number, opts: PlaceOpts = {}): TownRecord | null {
  const T = terrainFor(seed);
  const sp = T.spawn();
  const start: XZ = { x: sp.x, z: sp.z };
  const cands = candidates(seed, start);
  let keepOut: { x0: number; z0: number; x1: number; z1: number }[] | null = null;
  // ふるい はたけ・岩山・テストの 場所: さいしょの 候補が 当たった ときだけ 調べる（高い 計算）
  const keep = (): { x0: number; z0: number; x1: number; z1: number }[] => {
    if (keepOut !== null) return keepOut;
    const list: { x0: number; z0: number; x1: number; z1: number }[] = [];
    const flat = flatOf(seed);
    list.push({ x0: flat.x0, z0: flat.z0, x1: flat.x1, z1: flat.z1 });
    const rock = T.rock();
    list.push({ x0: Math.floor(rock.cx - rock.r) - 2, z0: Math.floor(rock.cz - rock.r) - 2, x1: Math.ceil(rock.cx + rock.r) + 2, z1: Math.ceil(rock.cz + rock.r) + 2 });
    // はじまりの木（最初の 木材の もと。スタートから 5〜12 マス）: 木と こずえ（半径 2）を 街の 地ならしで 消さない
    for (const t of startFeaturesOf(seed).trees) list.push({ x0: t.x - 2, z0: t.z - 2, x1: t.x + 2, z1: t.z + 2 });
    const ta = GEN.testArea;
    list.push({ x0: ta.x0 - 2, z0: ta.z0 - 2, x1: ta.x1 + 2, z1: ta.z1 + 2 });
    return (keepOut = list);
  };
  // 条件に 合う 候補（スタートの ちかい じゅん）。地形の しらべは あらい 間かくで 1 回ずつ
  const stat = new Map<number, Stat>();
  const pass: number[] = [];
  const m = TOWN.keepMargin;
  cands.forEach((cand, idx) => {
    const c = cornerOf(cand);
    const no = (r: string): void => {
      if (opts.why) opts.why[r] = (opts.why[r] ?? 0) + 1;
    };
    if (Math.hypot(cand.gate.x - sp.x, cand.gate.z - sp.z) < TOWN.edgeFromStartMin - 1) return no('near');
    // 街の ふちが スタートから 16 マス 以上
    const dxEdge = Math.max(c.x - sp.x, 0, sp.x - (c.x + N - 1));
    const dzEdge = Math.max(c.z - sp.z, 0, sp.z - (c.z + N - 1));
    if (Math.hypot(dxEdge, dzEdge) < TOWN.edgeFromStartMin) return no('edge');
    if (!angleOk(start, cand, c)) return no('angle');
    if (keep().some((r) => rectsOverlap(c.x - m, c.z - m, c.x + N - 1 + m, c.z + N - 1 + m, r.x0, r.z0, r.x1, r.z1))) return no('keep');
    if (opts.avoid && opts.avoid.some((a) => a.x >= c.x - m && a.x <= c.x + N - 1 + m && a.z >= c.z - m && a.z <= c.z + N - 1 + m)) return no('shaft');
    if (opts.occupied) {
      for (let cz = Math.floor((c.z - m) / CHUNK_SIZE); cz <= Math.floor((c.z + N + m) / CHUNK_SIZE); cz++) {
        for (let cx = Math.floor((c.x - m) / CHUNK_SIZE); cx <= Math.floor((c.x + N + m) / CHUNK_SIZE); cx++) if (opts.occupied(cx, cz)) return no('occupied');
      }
    }
    pass.push(idx);
  });
  // 水が すくない 順（まず 水なし）→ 平らな 順に ゆるめる。さいしょに 合う 候補
  for (const phase of [1, 2] as const) {
    for (const wetMax of TOWN.wetSteps) {
      for (const flatMax of TOWN.flatSteps) {
        for (const idx of pass) {
          if (cands[idx]!.phase !== phase) continue;
          const cand = cands[idx]!;
          let st = stat.get(idx);
          if (st === undefined) stat.set(idx, (st = statOf(T, cand, 5)));
          if (st.wetFrac > wetMax || st.range > flatMax) continue;
          const fine = statOf(T, cand, 2);
          if (fine.wetFrac > wetMax || fine.range > flatMax) continue;
          const groundY = Math.max(SEA_Y + 3, fine.median);
          if (!seesGate(T, sp, cand, groundY)) {
            if (opts.why) opts.why.sight = (opts.why.sight ?? 0) + 1;
            continue;
          }
          const c = cornerOf(cand);
          return { v: TOWN.version, x0: c.x, z0: c.z, facing: cand.facing, groundY };
        }
      }
    }
  }
  return null;
}


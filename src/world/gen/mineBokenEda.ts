import { BLOCK_INDEX } from '../blocks/blockTypes';
import { BOKEN_TUNING as TUNE, SHAPE_TABLE, type DeadEndKind } from './mineBokenConfig';
import { PieceB, buildEnd, pickEndKind, type DeadEndOut } from './mineBokenEnd';
import { Fit, type Piece, type Work } from './mineBokenFit';
import type { FrameMark } from './mineBokenFloors';
import { lat, type Pt3 } from './mineBokenRoad';
import type { BokenStyle } from './mineBokenStyle';
import { keyOf } from './mineShaftBuild';
import type { PathCell, Pt } from './mineShaftTypes';
import type { Rng } from './random';

/** えだ道（MINE-1E §4.4・§4.7）: 横穴の かべから 分かれる 道。計算だけ〔世界には さわらない〕。 */

const TORCH = BLOCK_INDEX.torch;
const E = SHAPE_TABLE.eda;

export interface Branch {
  side: number;
  from: Pt;
  to: Pt;
  length: number;
  bends: number;
  old: boolean;
  rubble: Pt[];
  end: DeadEndOut;
  /** 道の マス〔むかしの えだ道の 場所 `areaAt` 用〕 */
  eda: number[];
}

export interface EdaCtx {
  fit: Fit;
  rng: Rng;
  seed: number;
  style: BokenStyle;
  work: Work;
  chestKeys: Set<number>;
  frames: FrameMark[];
}

const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 横穴の 道の マスから 口に できる 場所〔まっすぐな はば 3 の かべ。向き t〕 */
export function mouthSpots(slice: readonly PathCell[], from: Pt, to: Pt): { m: Pt; t: [number, number] }[] {
  const set = new Set<number>();
  for (const c of slice) if (c.part === 'side') set.add(c.x * 100003 + c.z);
  const has = (x: number, z: number): boolean => set.has(x * 100003 + z);
  const out: { m: Pt; t: [number, number] }[] = [];
  for (const c of slice) {
    if (c.part !== 'side') continue;
    for (const [tx, tz] of FOUR) {
      const [dx, dz] = lat(tx, tz);
      let ok = true;
      for (let a = -3; a <= 3 && ok; a++) {
        const x = c.x + dx * a;
        const z = c.z + dz * a;
        ok = has(x, z) && has(x + tx, z + tz) && has(x - tx, z - tz) && !has(x + 2 * tx, z + 2 * tz);
      }
      if (!ok) continue;
      const f = { x: c.x + tx, z: c.z + tz };
      const far = (p: Pt): number => Math.max(Math.abs(p.x - f.x), Math.abs(p.z - f.z));
      if (far(from) < E.mouthGapSide || far(to) < E.mouthGapSide) continue;
      out.push({ m: { x: c.x, y: c.y, z: c.z }, t: [tx, tz] });
    }
  }
  return out;
}

/** えだ道 1 本を 作る 部品。作れなければ null */
function makeEda(c: EdaCtx, m: Pt, t: [number, number], old: boolean, kind: DeadEndKind, sideIdx: number): { piece: Piece; branch: Branch; frames: FrameMark[]; chestKeys: number[] } | null {
  const { rng } = c;
  const y = m.y;
  const L = E.length[0] + Math.floor(rng() * (E.length[1] - E.length[0] + 1));
  const bends = rng() < 0.3 ? 1 : 0;
  const L1 = bends ? 3 + Math.floor(rng() * (L - 5)) : L;
  const turn = rng() < 0.5 ? -1 : 1;
  const [lx, lz] = lat(t[0], t[1]);
  const h2: [number, number] = bends ? [lx * turn, lz * turn] : t;
  const centers: Pt3[] = [];
  for (let i = 0; i < L1; i++) centers.push({ x: m.x + t[0] * (2 + i), y, z: m.z + t[1] * (2 + i) });
  const K = centers[L1 - 1]!;
  for (let j = 1; j <= L - L1; j++) centers.push({ x: K.x + h2[0] * j, y, z: K.z + h2[1] * j });
  const pb = new PieceB();
  const legOf = (i: number): [number, number] => (i < L1 ? t : h2);
  centers.forEach((p, i) => {
    const [sx, sz] = lat(...legOf(i));
    for (let w = -1; w <= 1; w++) pb.cell(p.x + sx * w, y, p.z + sz * w, 'eda');
  });
  if (bends) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) pb.cell(K.x + dx, y, K.z + dz, 'eda');
  const hibi = kind === 'hibi_naka' || kind === 'hibi_oo';
  const nearCorner = (p: Pt3): boolean => bends === 1 && Math.max(Math.abs(p.x - K.x), Math.abs(p.z - K.z)) <= 2;
  // たいまつ: 口から 2〜3 マス・そのあと 6 マスごと こうご
  let sg = rng() < 0.5 ? -1 : 1;
  const f0 = E.torchFrom[0] - 1 + Math.floor(rng() * (E.torchFrom[1] - E.torchFrom[0] + 1));
  for (let i = f0; i < L - 1; i += 6) {
    if (hibi && i >= L - 3) continue;
    if (i >= L - 2 || nearCorner(centers[i]!)) continue;
    const [sx, sz] = lat(...legOf(i));
    pb.put(centers[i]!.x + sx * sg, y, centers[i]!.z + sz * sg, TORCH);
    sg = -sg;
  }
  if (bends) pb.put(K.x + 1, y, K.z + 1, TORCH);
  const at = centers[L - 1]!;
  const [ex, ez] = legOf(L - 1);
  const frames: FrameMark[] = [];
  const chestKeys: number[] = [];
  const end = buildEnd({ seed: c.seed, depth: c.style.depth, rng, kind, at, dx: ex, dz: ez, gap: 0, gapPart: 'eda', band: -1, pair: true, pb, taken: (k) => c.fit.b.air.has(k) || c.fit.b.put.has(k), frames, chestKeys });
  // わく: 口と 6 マスごと
  let n = 0;
  for (let i = 0; i < L - 3; i += 6) {
    if (nearCorner(centers[i]!)) continue;
    const [sx, sz] = lat(...legOf(i));
    frames.push({ x: centers[i]!.x, z: centers[i]!.z, y, px: sx, pz: sz, broken: old ? n % 5 < 3 : rng() < TUNE.brokenFrameShare });
    n++;
  }
  // くずれた いし: むかしの えだ道の 半分は 口の 内がわ 1 マス・はば 3・足と 頭
  const rubble: Pt[] = [];
  if (old && rng() < E.rubbleShare) {
    const p = centers[0]!;
    const [sx, sz] = lat(t[0], t[1]);
    for (let w = -1; w <= 1; w++) for (let h = 0; h < 2; h++) rubble.push({ x: p.x + sx * w, y: y + h, z: p.z + sz * w });
    for (const r of rubble) pb.put(r.x, r.y, r.z, BLOCK_INDEX.kuzure_ishi);
  }
  // むかしの えだ道: 床に とぎれとぎれの ふるい レール〔3 マスに 2 マス〕
  if (old) {
    centers.forEach((p, i) => {
      if (i % 3 === 2 || i === 0 || i >= L - 1 || nearCorner(p)) return;
      const k = keyOf(p.x, y, p.z);
      if (!pb.puts.has(k)) pb.puts.set(k, legOf(i)[0] !== 0 ? BLOCK_INDEX.furui_rail_x : BLOCK_INDEX.furui_rail_z);
    });
  }
  const first = centers[0]!;
  const piece: Piece = { cells: pb.cells, puts: [...pb.puts], attach: { x: first.x, z: first.z, dx: t[0], dz: t[1], y } };
  const branch: Branch = {
    side: sideIdx,
    from: { x: m.x + t[0], y, z: m.z + t[1] },
    to: { x: at.x, y, z: at.z },
    length: L,
    bends,
    old,
    rubble,
    end,
    eda: pb.cells.filter((q) => q.part === 'eda').map((q) => keyOf(q.x, q.y, q.z)),
  };
  frames.push({ x: first.x, z: first.z, y, px: lat(t[0], t[1])[0], pz: lat(t[0], t[1])[1], broken: old });
  return { piece, branch, frames, chestKeys };
}

/** 横穴 1 本に えだ道を want 本 ふやす〔足せた 分だけ 返す〕 */
export function planEdaOn(c: EdaCtx, sideIdx: number, spots: { m: Pt; t: [number, number] }[], want: number, room: number, existing: Pt[]): Branch[] {
  const out: Branch[] = [];
  const cands = [...spots];
  for (let w = 0; w < want && out.length < room; w++) {
    const old = c.rng() < E.oldShare;
    const kind = pickEndKind(c.rng);
    let done = false;
    for (let t = 0; t < TUNE.edaTries && !done && cands.length > 0; t++) {
      if (c.work.eda++ >= SHAPE_TABLE.limit.tries.eda) return out;
      const ix = Math.floor(c.rng() * cands.length);
      const sp = cands[ix]!;
      const from = { x: sp.m.x + sp.t[0], z: sp.m.z + sp.t[1] };
      if (existing.some((p) => Math.max(Math.abs(p.x - from.x), Math.abs(p.z - from.z)) < E.mouthGapEda)) {
        cands.splice(ix, 1);
        continue;
      }
      const made = makeEda(c, sp.m, sp.t, old, kind, sideIdx);
      if (!made) continue;
      if (!c.fit.add(made.piece)) continue;
      for (const k of made.chestKeys) c.chestKeys.add(k);
      c.frames.push(...made.frames);
      out.push(made.branch);
      existing.push({ x: from.x, y: sp.m.y, z: from.z });
      done = true;
    }
  }
  return out;
}

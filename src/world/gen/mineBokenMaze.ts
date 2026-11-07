import { BLOCK_INDEX } from "../blocks/blockTypes";
import {
  DEAD_END_TABLE as DT,
  SHAPE_TABLE,
  STYLE_TABLE,
  BOKEN_TUNING as TUNE,
} from "./mineBokenConfig";
import { PieceB, buildEnd, pickEndKind, type DeadEndOut } from "./mineBokenEnd";
import type { Fit, Piece } from "./mineBokenFit";
import type { FloorGeo, FrameMark } from "./mineBokenFloors";
import { lat } from "./mineBokenRoad";
import { roadSpots } from "./mineBokenSides";
import type { BokenStyle } from "./mineBokenStyle";
import type { DeadEndKind } from "./mineBokenConfig";
import type { Pt } from "./mineShaftTypes";
import type { Rng } from "./random";

/** 迷路の 階（MINE-1E §4.6）: 本道の かべに ひらく ます 4×4 か 5×5 の 小さな 迷路。計算だけ〔世界には さわらない〕。 */

const TORCH = BLOCK_INDEX.torch;
const M = SHAPE_TABLE.maze;
const PITCH = M.cell + M.wall;

export interface MazeOut {
  box: { x0: number; z0: number; x1: number; z1: number };
  y: number;
  grid: 4 | 5;
  entrance: Pt;
  deadEnds: DeadEndOut[];
  farthest: number;
}
export interface MazeCtx {
  fit: Fit;
  rng: Rng;
  seed: number;
  style: BokenStyle;
  chestKeys: Set<number>;
  frames: FrameMark[];
}

interface Graph {
  edges: Set<number>;
  leaves: number[];
  dist: number[];
  ent: number;
}

/** ますの つながり方を くじで つくる〔木 ＋ 輪 ＋ 行きどまりを 外がわの ますだけに〕 */
function genGraph(rng: Rng, g: number, ent: number): Graph | null {
  const N = g * g;
  const key = (a: number, b: number): number => (a < b ? a * N + b : b * N + a);
  const nbs = (c: number): number[] => {
    const i = Math.floor(c / g);
    const j = c % g;
    const o: number[] = [];
    if (i > 0) o.push(c - g);
    if (i < g - 1) o.push(c + g);
    if (j > 0) o.push(c - 1);
    if (j < g - 1) o.push(c + 1);
    return o;
  };
  const allowed = (c: number): boolean => {
    const i = Math.floor(c / g);
    const j = c % g;
    return i >= 1 && (i === g - 1 || j === 0 || j === g - 1);
  };
  for (let t = 0; t < 300; t++) {
    const edges = new Set<number>();
    const seen = new Set<number>([ent]);
    const stack = [ent];
    while (stack.length > 0) {
      const c = stack[stack.length - 1]!;
      const open = nbs(c).filter((n) => !seen.has(n));
      if (open.length === 0) {
        stack.pop();
        continue;
      }
      const n = open[Math.floor(rng() * open.length)]!;
      seen.add(n);
      edges.add(key(c, n));
      stack.push(n);
    }
    const deg = (): number[] => {
      const d = new Array<number>(N).fill(0);
      for (const e of edges) {
        d[Math.floor(e / N)]!++;
        d[e % N]!++;
      }
      return d;
    };
    const extra = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < extra; k++) {
      const c = Math.floor(rng() * N);
      const o = nbs(c).filter((n) => !edges.has(key(c, n)));
      if (o.length > 0) edges.add(key(c, o[Math.floor(rng() * o.length)]!));
    }
    // 行きどまりが 外がわの ますでない ものは 道を つないで 輪に する
    let d = deg();
    for (let c = 0; c < N; c++) {
      if (d[c] !== 1 || c === ent || allowed(c)) continue;
      const o = nbs(c).filter((n) => !edges.has(key(c, n)));
      if (o.length === 0) continue;
      edges.add(key(c, o[Math.floor(rng() * o.length)]!));
      d = deg();
    }
    d = deg();
    const leaves = [...d.keys()].filter((c) => d[c] === 1 && c !== ent);
    if (
      leaves.length < M.deadEnds[0] ||
      leaves.length > M.deadEnds[1] ||
      !leaves.every(allowed)
    )
      continue;
    // 同じ 面で となりあう 行きどまりは へやが ぶつかるので ゆるさない
    if (leaves.some((a) => leaves.some((b) => a < b && nbs(a).includes(b))))
      continue;
    const forks = d.filter((x, c) => x >= 3 || (c === ent && x >= 2)).length;
    if (forks < M.forks || edges.size - N + 1 < M.loops) continue;
    const dist = new Array<number>(N).fill(-1);
    dist[ent] = 0;
    const q = [ent];
    for (let h = 0; h < q.length; h++) {
      const c = q[h]!;
      for (const n of nbs(c))
        if (edges.has(key(c, n)) && dist[n] === -1) {
          dist[n] = dist[c]! + 1;
          q.push(n);
        }
    }
    // 入口の まえの 2 歩 ＋ 1 ますが 4 歩
    if (dist.some((x) => x < 0 || 2 + PITCH * x > M.walkMax)) continue;
    return { edges, leaves, dist, ent };
  }
  return null;
}

/** 迷路を 階 `fl` の 本道に つける。つけられなければ null〔Fit には 何も 足さない〕 */
export function placeMaze(
  c: MazeCtx,
  fl: FloorGeo,
  mouths: { x: number; z: number }[],
): { maze: MazeOut; ends: Piece[]; mouth: { x: number; z: number } } | null {
  const { fit, rng } = c;
  const lev = STYLE_TABLE.level.find((l) => l.id === c.style.level)!;
  const g = lev.mazeGrid!;
  const spots = roadSpots(fl).sort(() => rng() - 0.5);
  let strictLeft = M.strictTries;
  for (const sp of spots.slice(0, 2 * TUNE.roadTries)) {
    const o = fl.main[sp.i]!;
    if (
      mouths.some(
        (m) =>
          Math.max(Math.abs(m.x - o.x), Math.abs(m.z - o.z)) < TUNE.mouthGap,
      )
    )
      continue;
    const fr = sp.hub.frame;
    const s0 = rng() < 0.5 ? -1 : 1;
    for (const sgn of [s0, -s0]) {
      const tx = fr.lx * sgn;
      const tz = fr.lz * sgn;
      const dx = fr.ux;
      const dz = fr.uz;
      const j0 = Math.floor(rng() * g);
      const ent = j0; // (i = 0, j = j0)
      const W = (b: number, a: number): { x: number; z: number } => ({
        x: o.x + tx * b + dx * a,
        z: o.z + tz * b + dz * a,
      });
      const graph = genGraph(rng, g, ent);
      if (!graph) continue;
      const y = fl.y;
      const centre = (idx: number): { x: number; z: number } =>
        W(2 + PITCH * (1 + Math.floor(idx / g)) - 2, ((idx % g) - j0) * PITCH);
      const pb = new PieceB();
      const open = W(2, 0);
      pb.cell(open.x, y, open.z, "maze");
      const hibiCells = new Set<number>();
      const kinds = new Map<number, DeadEndKind>();
      const far = graph.leaves.reduce(
        (best, l) => (graph.dist[l]! > graph.dist[best]! ? l : best),
        graph.leaves[0]!,
      );
      for (const l of graph.leaves) {
        const k =
          l === far
            ? rng() < DT.mazeFarthest.oo
              ? "oo"
              : "naka"
            : pickEndKind(rng);
        kinds.set(l, k);
        if (k === "hibi_naka" || k === "hibi_oo") hibiCells.add(l);
      }
      // ますの 床と かべの 穴
      const N = g * g;
      for (let idx = 0; idx < N; idx++) {
        const m = centre(idx);
        for (let a = -1; a <= 1; a++)
          for (let b = -1; b <= 1; b++)
            pb.cell(m.x + tx * b + dx * a, y, m.z + tz * b + dz * a, "maze");
      }
      for (const e of graph.edges) {
        const p = centre(Math.floor(e / N));
        const q = centre(e % N);
        pb.cell((p.x + q.x) / 2, y, (p.z + q.z) / 2, "maze");
      }
      // たいまつ: ます 1 つ おきの すみ〔行きどまりの ひび 手前の ますは その 1 本だけ〕
      const par = [0, 1]
        .map((r) =>
          [...Array(N).keys()].filter(
            (idx) => (Math.floor(idx / g) + (idx % g) + r) % 2 === 0,
          ),
        )
        .sort((p, q) => p.length - q.length)[0]!;
      for (const idx of par) {
        if (hibiCells.has(idx)) continue;
        const m = centre(idx);
        const sa = (idx * 7 + 3) % 2 === 0 ? 1 : -1;
        const sb = (idx * 5 + 1) % 2 === 0 ? 1 : -1;
        pb.put(m.x + dx * sa + tx * sb, y, m.z + dz * sa + tz * sb, TORCH);
      }
      const box = (() => {
        const pts = [
          W(2, -PITCH * j0 - 2),
          W(2 + PITCH * g, -PITCH * j0 - 2 + PITCH * g),
        ];
        return {
          x0: Math.min(pts[0]!.x, pts[1]!.x),
          z0: Math.min(pts[0]!.z, pts[1]!.z),
          x1: Math.max(pts[0]!.x, pts[1]!.x),
          z1: Math.max(pts[0]!.z, pts[1]!.z),
        };
      })();
      const base: Piece = {
        cells: pb.cells,
        puts: [...pb.puts],
        attach: { x: open.x, z: open.z, dx: tx, dz: tz, y },
      };
      // 行きどまりの 外へ: へやを つける
      const endPieces = new Map<
        number,
        { piece: Piece; end: DeadEndOut; chest: number[]; frames: FrameMark[] }
      >();
      const mk = (
        l: number,
        kind: DeadEndKind,
      ): {
        piece: Piece;
        end: DeadEndOut;
        chest: number[];
        frames: FrameMark[];
      } => {
        const i = Math.floor(l / g);
        const j = l % g;
        let ox = 0;
        let oz = 0;
        if (
          i === g - 1 && (j === 0 || j === g - 1) ? rng() < 0.5 : i === g - 1
        ) {
          ox = tx;
          oz = tz;
        } else {
          const s = j === 0 ? -1 : 1;
          ox = dx * s;
          oz = dz * s;
        }
        const m = centre(l);
        const pe = new PieceB();
        const frames: FrameMark[] = [];
        const chest: number[] = [];
        const at = { x: m.x + ox, y, z: m.z + oz };
        const end = buildEnd({
          seed: c.seed,
          depth: c.style.depth,
          rng,
          kind,
          at,
          dx: ox,
          dz: oz,
          gap: 1,
          gapPart: "maze",
          band: -2,
          pair: false,
          pb: pe,
          taken: (k) => fit.b.air.has(k) || fit.b.put.has(k) || pb.has(k),
          frames,
          chestKeys: chest,
        });
        const first = { x: at.x + ox, z: at.z + oz };
        return {
          piece: {
            cells: pe.cells,
            puts: [...pe.puts],
            attach: { x: first.x, z: first.z, dx: ox, dz: oz, y },
          },
          end,
          chest,
          frames,
        };
      };
      if (!fit.check(base)) continue;
      const farEnd = mk(far, kinds.get(far)!);
      if (!fit.check(farEnd.piece)) continue;
      // へやの ある 行きどまりが 入らない ときは、はじめの 何回かは 迷路ごと やりなおす〔「あたり」に かたよらない ため〕
      const made = new Map<number, ReturnType<typeof mk>>();
      let roomsFit = true;
      for (const l of graph.leaves) {
        if (l === far) continue;
        const e = mk(l, kinds.get(l)!);
        made.set(l, e);
        if (!fit.check(e.piece)) roomsFit = false;
      }
      if (!roomsFit && strictLeft-- > 0) continue;
      fit.add(base);
      fit.add(farEnd.piece);
      endPieces.set(far, farEnd);
      for (const l of graph.leaves) {
        if (l === far) continue;
        let e = made.get(l)!;
        if (!fit.add(e.piece)) {
          e = mk(l, "atari");
          fit.add(e.piece);
        }
        endPieces.set(l, e);
      }
      const ends: Piece[] = [];
      const deadEnds: DeadEndOut[] = [];
      for (const l of graph.leaves) {
        const e = endPieces.get(l)!;
        deadEnds.push(e.end);
        for (const k of e.chest) c.chestKeys.add(k);
        c.frames.push(...e.frames);
      }
      c.frames.push({
        x: open.x,
        z: open.z,
        y,
        px: lat(tx, tz)[0],
        pz: lat(tx, tz)[1],
        broken: false,
      });
      const maze: MazeOut = {
        box,
        y,
        grid: g as 4 | 5,
        entrance: { x: open.x, y, z: open.z },
        deadEnds,
        farthest: graph.leaves.indexOf(far),
      };
      return { maze, ends, mouth: { x: o.x, z: o.z } };
    }
  }
  return null;
}

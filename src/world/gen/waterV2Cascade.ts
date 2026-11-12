import { hash01 } from './random';
import { basinCells, basinNorm, depthAt, DIR4, Edit, makeBasin, rimColumn, waterColumn, type Basin, type Dir, type Ground } from './waterV2Kit';
import { WATER_BLOCKS as B, WATER_TUNE as T } from './waterV2Table';

/**
 * はりだした 段々の 滝（カスケード）の 計画: 水源の 池 → 滝 → 受け皿（岩の うつわ。かべから 外へ はりだし、下は 地面まで ささえ岩）→ 滝 → … → すそ。
 * 先に ぜんぶ 決めて、全部 成り立った ときだけ 置く（途中で だめなら 段を へらして やりなおす = 深さ優先で さがす）。
 * 受け皿の 池は 次の 滝の 水源（落ち口 = わきどころの 列を 池の ふちに 置く）。1 つの 滝の しくみ（わきどころ ＋ たきつぼ）は 今までと 同じ。
 */

const C = T.cascade;
type Cell = [number, number];
const key = (x: number, z: number): number => x * 100003 + z;

/** 池 1 つの 外へ 出る 滝（落ち口） */
interface CascadeStage {
  d: Dir;
  w: number;
  lip: Cell[];
  front: Cell[];
  /** 池の 水の 列（落ち口より 前は 切る）・まわりの 岩の 列 */
  source: Cell[];
  ring: Cell[];
}

export interface Cascade {
  /** 池（0 = 水源、あとは 受け皿）。滝は stages[i] が ponds[i] から ponds[i + 1] へ */
  ponds: Basin[];
  stages: CascadeStage[];
}

/** もう 使った 列（水・ふち・落ち口と そのよこ） */
interface Occupied {
  water: Set<number>;
  ring: Set<number>;
  solid: Set<number>;
}

/** 池 b の 向き d・はば w の 落ち口と 水・ふちの 列。置けなければ null。keep = 水に のこす はずの 列（前の 滝の 落ちる 先） */
function stageOf(g: Ground, free: (x: number, z: number) => boolean, b: Basin, d: Dir, w: number, keep: readonly Cell[]): CascadeStage | null {
  const px = -d[1];
  const pz = d[0];
  const cx = Math.floor(b.cx);
  const cz = Math.floor(b.cz);
  let k = 0;
  while (k < 40 && basinNorm(b, cx + d[0] * k, cz + d[1] * k) <= 1) k++;
  const mid = Math.floor((w - 1) / 2);
  const lx = cx + d[0] * k - mid * px;
  const lz = cz + d[1] * k - mid * pz;
  const lip: Cell[] = [];
  const front: Cell[] = [];
  for (let j = 0; j < w; j++) {
    const x = lx + j * px;
    const z = lz + j * pz;
    if (g(x, z) < 0 || g(x + d[0], z + d[1]) < 0 || !free(x, z) || !free(x + d[0], z + d[1]) || g(x, z) > b.level + C.lipCut || g(x, z) < b.level - C.fillMax) return null;
    lip.push([x, z]);
    front.push([x + d[0], z + d[1]]);
  }
  const source: Cell[] = [];
  const ring = new Map<number, Cell>();
  let ok = true;
  const addRing = (x: number, z: number): void => {
    if (g(x, z) < 0 || !free(x, z)) ok = false;
    ring.set(key(x, z), [x, z]);
  };
  for (const { x, z, n } of basinCells(b)) {
    const u = (x - lx) * d[0] + (z - lz) * d[1];
    const v = (x - lx) * px + (z - lz) * pz;
    if (u > 0 || (u === 0 && v >= 0 && v < w)) continue; // 落ち口の 列と がけの 前
    if (n <= 1 && u <= -1) {
      const h = g(x, z);
      if (h < 0 || !free(x, z) || h > b.level + C.srcCut || h < b.level - C.fillMax) ok = false;
      source.push([x, z]);
    } else addRing(x, z);
  }
  for (let v = -1; v <= w; v++) {
    const x = lx + v * px;
    const z = lz + v * pz;
    if (v < 0 || v >= w) addRing(x, z);
    const bx = x - d[0];
    const bz = z - d[1];
    if (!source.some(([sx, sz]) => sx === bx && sz === bz)) addRing(bx, bz);
  }
  if (!ok || source.length < 8) return null;
  const wet = new Set(source.map(([x, z]) => key(x, z)));
  if (keep.some(([x, z]) => !wet.has(key(x, z)))) return null;
  return { d, w, lip, front, source, ring: [...ring.values()].filter(([x, z]) => !wet.has(key(x, z))) };
}

/** 落ち口の あとの 占有（水・ふち・落ち口と そのよこ）を 足した もの */
function occupy(occ: Occupied, st: CascadeStage): Occupied {
  const o: Occupied = { water: new Set(occ.water), ring: new Set(occ.ring), solid: new Set(occ.solid) };
  for (const [x, z] of st.source) o.water.add(key(x, z));
  for (const [x, z] of st.ring) o.ring.add(key(x, z));
  const px = -st.d[1];
  const pz = st.d[0];
  for (let v = -1; v <= st.w; v++) o.solid.add(key(st.lip[0]![0] + v * px, st.lip[0]![1] + v * pz));
  return o;
}

/** 受け皿の 候補（半径の 大きい 方から）。落ちる 先の 列が ぜんぶ 水に なり、まわりに ぶつからない もの */
function vessels(g: Ground, free: (x: number, z: number) => boolean, seed: number, top: number, st: CascadeStage, occ: Occupied): Basin[] {
  const out: Basin[] = [];
  const { d, front } = st;
  const mx = front.reduce((s, f) => s + f[0] + 0.5, 0) / front.length;
  const mz = front.reduce((s, f) => s + f[1] + 0.5, 0) / front.length;
  for (const r of C.radius) {
    const cx = mx + d[0] * r * 0.75;
    const cz = mz + d[1] * r * 0.75;
    const gc = g(Math.floor(cx), Math.floor(cz));
    if (gc < 0) continue;
    // 落差の 大きい 方から ためす（すそまで 少ない 段で おりる。地面が 高ければ cut まで ほる・ひくければ 下を ささえ岩で うめる）
    const levels = C.dropTry.map((dr) => top - dr);
    for (const level of levels) {
      if (gc - level > C.cut) continue;
      const b = makeBasin(seed, cx, cz, r, level, C.depth);
      if (!front.every(([x, z]) => basinNorm(b, x, z) <= 0.95)) continue;
      let ok = true;
      for (const { x, z, n } of basinCells(b)) {
        const h = g(x, z);
        const k = key(x, z);
        // 受け皿の ふち（n > 1）は 上の 池の 下の 高さ（水面 − 落差）に 書く ので、上の 池・落ち口と かさなって よい
        if (h < 0 || !free(x, z) || (n <= 1 && (occ.solid.has(k) || occ.water.has(k) || occ.ring.has(k)))) {
          ok = false;
          break;
        }
        if (n <= 1 ? h > level + C.cut || h < level - C.depth - C.fillMax : h < level - C.fillMax) {
          ok = false;
          break;
        }
      }
      if (ok) {
        out.push(b);
        break;
      }
    }
  }
  return out;
}

/** 計画を 探す。atFoot(b) = その 池が 山の すそか。accept(計画, すそで 終わった か) が true を 返したら そこで 終わり */
export function planCascade(g: Ground, free: (x: number, z: number) => boolean, seed: number, spot: { x: number; z: number }, atFoot: (b: Basin) => boolean, minFalls: number, accept: (c: Cascade, ended: boolean) => boolean): boolean {
  let nodes = 0;
  const widths = (b: Basin, x: number): number[] => {
    const pref = C.width[0] + Math.floor(hash01(seed, x, Math.floor(b.cz), 9) * (C.width[1] - C.width[0] + 1));
    return pref === C.width[0] ? [pref] : [pref, C.width[0]];
  };
  const dirsOf = (b: Basin, back: Dir | null): Dir[] => {
    const lowAt = (d: Dir): number => g(Math.floor(b.cx) + d[0] * (b.r + 6), Math.floor(b.cz) + d[1] * (b.r + 6));
    return DIR4.filter((d) => back === null || !(d[0] === -back[0] && d[1] === -back[1])).map((d) => ({ d, h: lowAt(d) })).filter((q) => q.h >= 0).sort((p, q) => p.h - q.h).map((q) => q.d);
  };
  const go = (ponds: Basin[], stages: CascadeStage[], occ: Occupied): boolean => {
    const b = ponds[ponds.length - 1]!;
    const falls = stages.length;
    if (falls > 0 && atFoot(b)) return falls >= minFalls && accept({ ponds, stages }, true);
    if (falls < C.maxFalls) {
      for (const d of dirsOf(b, falls > 0 ? stages[falls - 1]!.d : null)) {
        for (const w of widths(b, Math.floor(b.cx))) {
          if (nodes++ > C.nodes) return false;
          const st = stageOf(g, free, b, d, w, falls > 0 ? stages[falls - 1]!.front : []);
          if (st === null) continue;
          const occ2 = occupy(occ, st);
          for (const v of vessels(g, free, seed + falls * 7 + 1, b.level, st, occ2)) {
            if (go([...ponds, v], [...stages, st], occ2)) return true;
          }
        }
      }
    }
    return falls >= minFalls && falls > 0 && accept({ ponds, stages }, false);
  };
  const empty: Occupied = { water: new Set(), ring: new Set(), solid: new Set() };
  const ground = g(spot.x, spot.z);
  if (ground < 0) return false;
  // 水源の 池の 水面は 地面の 高さから 少し 下げた 高さも ためす（ほった ぶん、前の がけが ひくく なる）
  for (const lower of C.srcLower) {
    for (const r of C.srcRadius) {
      const b = makeBasin(seed, spot.x + 0.5, spot.z + 0.5, r, ground - lower, T.fall.sourceDepth);
      if (go([b], [], empty)) return true;
      if (nodes > C.nodes) return false;
    }
  }
  return false;
}

/** 計画の ブロックを 書く: 池 → 落ち口（わきどころ・下は ささえ岩）→ 落ちる 先の たきつぼ（いちばん あと） */
export function buildCascade(ed: Edit, g: Ground, seed: number, c: Cascade): void {
  c.ponds.forEach((b, i) => {
    const st = c.stages[i];
    if (st === undefined) {
      for (const { x, z, n } of basinCells(b)) {
        if (n <= 1) waterColumn(ed, seed + i, x, z, g(x, z), b.level, depthAt(b, n));
        else rimColumn(ed, seed + i, x, z, g(x, z), b.level, B.rim, false);
      }
      return;
    }
    for (const [x, z] of st.source) waterColumn(ed, seed + i, x, z, g(x, z), b.level, depthAt(b, basinNorm(b, x, z)));
    for (const [x, z] of st.ring) rimColumn(ed, seed + i, x, z, g(x, z), b.level, B.rim, false);
  });
  c.stages.forEach((st, i) => {
    const top = c.ponds[i]!.level;
    for (const [x, z] of st.lip) {
      for (let y = g(x, z) + 1; y < top; y++) ed.set(x, y, z, B.fill); // うしろが ささえられる ように 地面から ぜんぶ 岩
      ed.set(x, top, z, B.spring);
      for (let y = top + 1; y <= Math.max(g(x, z), ed.topOf(x, z)); y++) ed.set(x, y, z, B.air);
    }
  });
  c.stages.forEach((st, i) => {
    const v = c.ponds[i + 1]!;
    for (const [x, z] of st.front) ed.set(x, v.level - depthAt(v, basinNorm(v, x, z)), z, B.pit);
  });
}

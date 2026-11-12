import { hash01 } from './random';
import type { BlockId } from '../../contracts';
import { basinCells, basinNorm, depthAt, DIR4, Edit, makeBasin, pick, RING, waterColumn, type Basin, type Dir, type Ground } from './waterV2Kit';
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
    // 落ち口の すぐ うしろ（わきどころの 列）は 水に せず 岩の ぜき: うしろが たまりだと、水が へった ぶん わきどころが 勝手に 水を 足してしまう（水の 量が ふえる）
    if (n <= 1 && u <= -2) {
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

type VShape = NonNullable<Basin['shape']>;

/** 中心 (cx, cz)・半径 r・形 shape の 受け皿が 置けるか（落差の 大きい 方から ためす。地面が 高ければ cut まで ほる・ひくければ 下を ささえ岩で うめる） */
function tryVessel(g: Ground, free: (x: number, z: number) => boolean, seed: number, top: number, st: CascadeStage, occ: Occupied, cx: number, cz: number, r: number, shape: VShape | undefined): Basin | null {
  const gc = g(Math.floor(cx), Math.floor(cz));
  if (gc < 0) return null;
  for (const dr of C.dropTry) {
    const level = top - dr;
    if (gc - level > C.cut) continue;
    const b = makeBasin(seed, cx, cz, r, level, C.depth);
    if (shape !== undefined) b.shape = shape;
    if (!st.front.every(([x, z]) => basinNorm(b, x, z) <= 0.95)) continue;
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
    if (ok) return b;
  }
  return null;
}

/** 受け皿の 候補（半径の 大きい 方から）。落ちる 先の 列が ぜんぶ 水に なり、まわりに ぶつからない もの。形は シードで 丸・だ円・半月を まぜる */
function vessels(g: Ground, free: (x: number, z: number) => boolean, seed: number, top: number, st: CascadeStage, occ: Occupied): Basin[] {
  const out: Basin[] = [];
  const { d, front } = st;
  const mx = front.reduce((s, f) => s + f[0] + 0.5, 0) / front.length;
  const mz = front.reduce((s, f) => s + f[1] + 0.5, 0) / front.length;
  const kx = Math.floor(mx);
  const kz = Math.floor(mz);
  const SH = C.shapes;
  for (const r of C.radius) {
    const roll = hash01(seed, kx, kz, 17 + r);
    const kinds: ('circle' | 'ellipse' | 'moon')[] = roll < SH.ellipse ? ['ellipse', 'circle'] : roll < SH.ellipse + SH.moon ? ['moon', 'circle'] : ['circle'];
    for (const kind of kinds) {
      const ax = kind === 'ellipse' ? SH.axRange[0] + hash01(seed, kx, kz, 18) * (SH.axRange[1] - SH.axRange[0]) : 1;
      const flat = kind === 'moon' ? SH.moonFlat : 1;
      const off = (r * 0.75 * flat) / Math.sqrt(ax); // 落ちる 先が 水に なる ように、中心を 外へ ずらす 量
      const shape: VShape | undefined = kind === 'circle' ? undefined : { ux: d[0], uz: d[1], ax, flat };
      const b = tryVessel(g, free, seed, top, st, occ, mx + d[0] * off, mz + d[1] * off, r, shape);
      if (b !== null) {
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
  // 落ち口の はば: 池が 大きい ほど 広い（半径 × widthPerR を 3〜5 に おさめる。ときどき 1 へらす）。入らなければ 3 まで せまく する
  const widths = (b: Basin, x: number): number[] => {
    const want = Math.round(b.r * C.widthPerR) - (hash01(seed, x, Math.floor(b.cz), 9) < C.widthLess ? 1 : 0);
    const top = Math.min(C.width[1], Math.max(C.width[0], want));
    const out: number[] = [];
    for (let w = top; w >= C.width[0]; w--) out.push(w);
    return out;
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

/** 受け皿・水源の 池の ふちの 列: 水面まで 岩で うめ、上は 山の 岩が 多め・水ぎわに 石づみ（こけの いし）が 少し・ふちの 高さは 0〜1 ゆらす。高い かべは そのまま（雪も のせない） */
function rimOf(ed: Edit, seed: number, x: number, z: number, ground: number, level: number, wet: boolean): void {
  if (ground > level) return;
  for (let y = ground + 1; y < level; y++) ed.set(x, y, z, B.fill);
  const roll = hash01(seed, x, z, 2);
  if (roll < C.rimRock) {
    ed.set(x, level, z, B.fill);
    if (hash01(seed, x, z, 3) < C.rimUp) ed.set(x, level + 1, z, B.fill);
  } else if (roll < C.rimRock + C.rimStone) ed.set(x, level, z, wet ? pick(seed, B.rim, x, z, 5) : B.fill);
  else ed.set(x, level, z, ground < level ? B.fill : B.shore);
}

/** 計画の ブロックを 書く: 池 → 落ち口（わきどころ・下は ささえ岩）→ 落ちる 先の たきつぼ（いちばん あと）。ささえ岩は 山の 岩（rock）に する */
export function buildCascade(ed: Edit, g: Ground, seed: number, c: Cascade, rock: (x: number, y: number, z: number) => BlockId): void {
  c.ponds.forEach((b, i) => {
    const st = c.stages[i];
    const wetEdge = 1 + 1 / b.r;
    if (st === undefined) {
      for (const { x, z, n } of basinCells(b)) {
        if (n <= 1) waterColumn(ed, seed + i, x, z, g(x, z), b.level, depthAt(b, n));
        else rimOf(ed, seed + i, x, z, g(x, z), b.level, n < wetEdge);
      }
      return;
    }
    for (const [x, z] of st.source) waterColumn(ed, seed + i, x, z, g(x, z), b.level, depthAt(b, basinNorm(b, x, z)));
    for (const [x, z] of st.ring) rimOf(ed, seed + i, x, z, g(x, z), b.level, basinNorm(b, x, z) < wetEdge);
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
  ed.recolor(B.fill, rock);
}

/**
 * 受け皿の ささえ（川を 決めた あとで 足す）: 山の 岩で、池の まわりに 下へ 行くほど ひろがる がけの こぶ（1 だん 下がる ごとに 半径 +0〜1。シードで がたがた）を 作り、
 * 池と かべの すき間（池から 落ち口の 列まで）も うめて、かならず 山の かべに つなげる。taken(x, z) = もう 使った 列（川など）は さける
 */
export function buildSupports(ed: Edit, g: Ground, seed: number, c: Cascade, rock: (x: number, y: number, z: number) => BlockId, free: (x: number, z: number) => boolean, taken: (x: number, z: number) => boolean): void {
  const F = C.flare;
  c.stages.forEach((st, i) => {
    const v = c.ponds[i + 1]!;
    const sh = v.shape;
    const sa = Math.sqrt(sh?.ax ?? 1);
    // 下へ 1 だん ごとの 半径（0 = いちばん 上。+0 か +1 ずつ ふえる）
    const rad: number[] = [0];
    for (let k = 1; k <= F.steps; k++) rad.push(rad[k - 1]! + (hash01(seed + i, k, 41, 1) < F.chance ? 1 : 0));
    const stepOf = (e: number): number => (e <= 0 ? 0 : rad.findIndex((q) => q >= e));
    const d = st.d;
    const lip = st.lip[Math.floor(st.lip.length / 2)]!;
    const pLip = (lip[0] + 0.5 - v.cx) * d[0] + (lip[1] + 0.5 - v.cz) * d[1]; // 池の まん中から 落ち口までの きょり（マイナス = かべがわ）
    const halfW = v.r * sa * (1 + v.amp * 0.5) + RING;
    const nEdge = 1 + RING / v.r;
    const R = Math.ceil(Math.max(v.r * sa * (1 + v.amp) + RING + rad[F.steps]!, Math.abs(pLip) + 2));
    for (let z = Math.floor(v.cz) - R; z <= Math.floor(v.cz) + R; z++) {
      for (let x = Math.floor(v.cx) - R; x <= Math.floor(v.cx) + R; x++) {
        const n = basinNorm(v, x, z);
        if (n <= nEdge) continue; // 池と ふちは もう 書いた
        const dx = x + 0.5 - v.cx;
        const dz = z + 0.5 - v.cz;
        const p = dx * d[0] + dz * d[1];
        const q = -dx * d[1] + dz * d[0];
        let e = (n - nEdge) * v.r;
        if (p <= F.apron && p >= pLip - 1) e = Math.min(e, Math.max(0, Math.abs(q) - halfW)); // かべがわの すき間
        e += (hash01(seed + i, x, z, 43) - 0.5) * F.wobble;
        const s = stepOf(e);
        if (s < 0) continue;
        const gy = g(x, z);
        if (gy < 0 || !free(x, z) || ed.has(x, z) || taken(x, z)) continue;
        for (let y = gy + 1; y <= v.level - 1 - s; y++) ed.set(x, y, z, rock(x, y, z));
      }
    }
  });
}

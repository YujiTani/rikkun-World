/**
 * 地上から 見えない 地下を 描かない（#405）。
 *
 * セクション（16³）の 面どうしが、光を通す マスで つながっているかを 先に 覚える。
 * 描く直前に、カメラの いる セクションから その つながりを たどる。
 * 穴の 大きさで 画面の 範囲を せばめるので、穴の 向こうだけが 残る。
 * 地面の メッシュは、空気の セクションから その面が 画面に 入っていれば 描く（穴が なくても）。
 * たどる 回数には 上限がある。超えた コマは かくさない（欠けて 見えるより 描きすぎを 選ぶ）。
 */

/** 面: 0 +y, 1 −y, 2 +x, 3 −x, 4 +z, 5 −z */
const FACE_N = 6;
const FACE_BIT = [1, 2, 4, 8, 16, 32] as const;
const OPPOSITE = [1, 0, 3, 2, 5, 4] as const;
const DX = [0, 0, 1, -1, 0, 0] as const;
const DY = [1, -1, 0, 0, 0, 0] as const;
const DZ = [0, 0, 0, 0, 1, -1] as const;

/** 画面の 範囲を この 分割数で 覚える（−1〜1 を 0〜GRID）。粗いと 穴の ふちで 欠け、細かいと さがしが 伸びる */
const GRID = 1024;
const RECT_FULL = GRID * 2;

/** 1 回の 視点で キューから 取り出す 回数の 上限（回） */
const CAVE_SEARCH_BUDGET = 8192;
/** 同じ 入り口を 広げ直す 回数の 上限（回）。超えたら その 入り口は 今の 画面いっぱいまで 広げる */
const GROW_CAP = 8;

/** 1 セクションの 面の つながり。portal は 面ごと u0,u1,v0,v1（0〜15。開いていなければ u0 > u1） */
export interface FaceGraph {
  open: number;
  reach: Uint8Array;
  portal: Int16Array;
}

function fillPortal(p: Int16Array, u0: number, u1: number, v0: number, v1: number): void {
  for (let f = 0; f < FACE_N; f++) {
    const o = f * 4;
    p[o] = u0;
    p[o + 1] = u1;
    p[o + 2] = v0;
    p[o + 3] = v1;
  }
}

function makeGraph(open: number, reachBits: number, u0: number, u1: number, v0: number, v1: number): FaceGraph {
  const reach = new Uint8Array(FACE_N);
  reach.fill(reachBits);
  const portal = new Int16Array(FACE_N * 4);
  fillPortal(portal, u0, u1, v0, v1);
  return { open, reach, portal };
}

/** 6 面が 全部 つながり、穴は 面いっぱい（空気の セクション） */
export const OPEN_GRAPH: FaceGraph = makeGraph(63, 63, 0, 15, 0, 15);
/** どの 面も あいていない（中まで ふさがった セクション） */
export const CLOSED_GRAPH: FaceGraph = makeGraph(0, 0, 16, -1, 16, -1);

const BUILD_VIS = new Uint8Array(4096);
const BUILD_Q = new Int32Array(4096);

function touch(portal: Int16Array, face: number, u: number, v: number): void {
  const o = face * 4;
  if (u < portal[o]) portal[o] = u;
  if (u > portal[o + 1]) portal[o + 1] = u;
  if (v < portal[o + 2]) portal[o + 2] = v;
  if (v > portal[o + 3]) portal[o + 3] = v;
}

function stampFaces(lx: number, ly: number, lz: number, portal: Int16Array): number {
  let bits = 0;
  if (ly === 15) {
    bits |= 1;
    touch(portal, 0, lx, lz);
  }
  if (ly === 0) {
    bits |= 2;
    touch(portal, 1, lx, lz);
  }
  if (lx === 15) {
    bits |= 4;
    touch(portal, 2, ly, lz);
  }
  if (lx === 0) {
    bits |= 8;
    touch(portal, 3, ly, lz);
  }
  if (lz === 15) {
    bits |= 16;
    touch(portal, 4, lx, ly);
  }
  if (lz === 0) {
    bits |= 32;
    touch(portal, 5, lx, ly);
  }
  return bits;
}

/** blocked でない マスを 1 かたまり 塗り、触れた 面の ビットを 返す。portal は 広げるだけ */
function flood(
  lx0: number,
  ly0: number,
  lz0: number,
  blocked: (lx: number, ly: number, lz: number) => boolean,
  portal: Int16Array,
  vis: Uint8Array,
  queue: Int32Array,
): number {
  let qt = 0;
  let qh = 0;
  const start = (ly0 << 8) | (lz0 << 4) | lx0;
  vis[start] = 1;
  queue[qt++] = start;
  let bits = 0;
  while (qh < qt) {
    const i = queue[qh++]!;
    const lx = i & 15;
    const lz = (i >> 4) & 15;
    const ly = i >> 8;
    bits |= stampFaces(lx, ly, lz, portal);
    const n = (j: number, lx2: number, ly2: number, lz2: number): void => {
      if (vis[j] || blocked(lx2, ly2, lz2)) return;
      vis[j] = 1;
      queue[qt++] = j;
    };
    if (lx < 15) n(i + 1, lx + 1, ly, lz);
    if (lx > 0) n(i - 1, lx - 1, ly, lz);
    if (lz < 15) n(i + 16, lx, ly, lz + 1);
    if (lz > 0) n(i - 16, lx, ly, lz - 1);
    if (ly < 15) n(i + 256, lx, ly + 1, lz);
    if (ly > 0) n(i - 256, lx, ly - 1, lz);
  }
  return bits;
}

/** セクション 16³ の 面の つながり。blocked = その マスは 見通しを ふさぐ */
export function buildFaceGraph(blocked: (lx: number, ly: number, lz: number) => boolean): FaceGraph {
  BUILD_VIS.fill(0);
  const portal = new Int16Array(FACE_N * 4);
  fillPortal(portal, 16, -1, 16, -1);
  const reach = new Uint8Array(FACE_N);
  let open = 0;
  for (let ly = 0; ly < 16; ly++) {
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const i = (ly << 8) | (lz << 4) | lx;
        if (BUILD_VIS[i] || blocked(lx, ly, lz)) continue;
        const bits = flood(lx, ly, lz, blocked, portal, BUILD_VIS, BUILD_Q);
        open |= bits;
        for (let f = 0; f < FACE_N; f++) if (bits & FACE_BIT[f]) reach[f] |= bits;
      }
    }
  }
  return { open, reach, portal };
}

export interface Projected {
  x: number;
  y: number;
  behind: boolean;
}

/** 世界の 点を 画面の −1〜1 に 書く。うしろなら behind。out は 呼び出し側が 使い回す */
export type ProjectFn = (x: number, y: number, z: number, out: Projected) => void;

export interface CaveNode {
  /** null = まだ（見通しは 全部 あいていると みなす） */
  graph: FaceGraph | null;
}

export interface CaveStats {
  /** キューから 取り出した 回数（回） */
  steps: number;
  /** 上限の 中で たどりきったか。false の コマは メッシュを かくさない */
  complete: boolean;
  /** メッシュを 見せた セクションの 数 */
  shown: number;
  /** かくした セクションの 数 */
  hidden: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const sectionKey = (cx: number, sy: number, cz: number): number => ((cx + 2048) << 17) | ((cz + 2048) << 5) | (sy & 31);

function qmin(n: number): number {
  const c = n < -1 ? -1 : n > 1 ? 1 : n;
  return Math.floor((c + 1) * GRID);
}
function qmax(n: number): number {
  const c = n < -1 ? -1 : n > 1 ? 1 : n;
  return Math.ceil((c + 1) * GRID);
}

function packRect(r: Rect): number {
  return r.x0 + r.y0 * 4096 + r.x1 * 16777216 + r.y1 * 68719476736;
}
function unpackRect(n: number, out: Rect): void {
  out.x0 = n % 4096;
  out.y0 = Math.floor(n / 4096) % 4096;
  out.x1 = Math.floor(n / 16777216) % 4096;
  out.y1 = Math.floor(n / 68719476736) % 4096;
}

function contains(a: Rect, b: Rect): boolean {
  return b.x0 >= a.x0 && b.y0 >= a.y0 && b.x1 <= a.x1 && b.y1 <= a.y1;
}

/** 穴の 四角を 画面の 範囲に する。全部 うしろなら null。前後に またぐときは 今の 範囲を そのまま（欠けない） */
function portalRect(project: ProjectFn, scratch: Projected, plane: Float64Array, cur: Rect, out: Rect): Rect | null {
  let front = false;
  let behind = false;
  let x0 = RECT_FULL;
  let y0 = RECT_FULL;
  let x1 = 0;
  let y1 = 0;
  let rawX0 = Infinity;
  let rawY0 = Infinity;
  let rawX1 = -Infinity;
  let rawY1 = -Infinity;
  for (let i = 0; i < 4; i++) {
    project(plane[i * 3]!, plane[i * 3 + 1]!, plane[i * 3 + 2]!, scratch);
    if (scratch.behind) {
      behind = true;
      continue;
    }
    front = true;
    if (scratch.x < rawX0) rawX0 = scratch.x;
    if (scratch.y < rawY0) rawY0 = scratch.y;
    if (scratch.x > rawX1) rawX1 = scratch.x;
    if (scratch.y > rawY1) rawY1 = scratch.y;
    const px = qmin(scratch.x);
    const py = qmin(scratch.y);
    const px2 = qmax(scratch.x);
    const py2 = qmax(scratch.y);
    if (px < x0) x0 = px;
    if (py < y0) y0 = py;
    if (px2 > x1) x1 = px2;
    if (py2 > y1) y1 = py2;
  }
  if (!front) return null;
  if (behind) {
    out.x0 = cur.x0;
    out.y0 = cur.y0;
    out.x1 = cur.x1;
    out.y1 = cur.y1;
    return out;
  }
  // 画面の 外（端に 張りついていない）は 見えない
  if (rawX1 < -1 || rawX0 > 1 || rawY1 < -1 || rawY0 > 1) return null;
  out.x0 = x0 > cur.x0 ? x0 : cur.x0;
  out.y0 = y0 > cur.y0 ? y0 : cur.y0;
  out.x1 = x1 < cur.x1 ? x1 : cur.x1;
  out.y1 = y1 < cur.y1 ? y1 : cur.y1;
  if (out.x0 > out.x1 || out.y0 > out.y1) return null;
  return out;
}

function writeCorners(cx: number, sy: number, cz: number, face: number, u0: number, u1: number, v0: number, v1: number, out: Float64Array): void {
  const x0 = cx * 16;
  const y0 = sy * 16;
  const z0 = cz * 16;
  const ua = u0;
  const ub = u1 + 1;
  const va = v0;
  const vb = v1 + 1;
  const put = (i: number, x: number, y: number, z: number): void => {
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
  };
  if (face === 0 || face === 1) {
    const y = face === 0 ? y0 + 16 : y0;
    put(0, x0 + ua, y, z0 + va);
    put(3, x0 + ub, y, z0 + va);
    put(6, x0 + ua, y, z0 + vb);
    put(9, x0 + ub, y, z0 + vb);
    return;
  }
  if (face === 2 || face === 3) {
    const x = face === 2 ? x0 + 16 : x0;
    put(0, x, y0 + ua, z0 + va);
    put(3, x, y0 + ub, z0 + va);
    put(6, x, y0 + ua, z0 + vb);
    put(9, x, y0 + ub, z0 + vb);
    return;
  }
  const z = face === 4 ? z0 + 16 : z0;
  put(0, x0 + ua, y0 + va, z);
  put(3, x0 + ub, y0 + va, z);
  put(6, x0 + ua, y0 + vb, z);
  put(9, x0 + ub, y0 + vb, z);
}

interface SearchOpt {
  eye: { x: number; y: number; z: number };
  project: ProjectFn;
  at: (cx: number, sy: number, cz: number) => CaveNode | null;
  /** その マスは 見通しを ふさぐか（目の いる セクションだけ 使う） */
  blocked: (x: number, y: number, z: number) => boolean;
  budget?: number;
}

/**
 * カメラから 見える セクションを さがす。使い回しの 入れ物を 持つ（毎コマ 新しい 配列を 作らない）。
 * isDrawn は 直前の run の 結果。complete が false のときは 呼ばない（全部 見せる）。
 */
export class CaveSearch {
  private frame = 1;
  private readonly drawGen = new Map<number, number>();
  private readonly stampGen = new Map<number, number>();
  private readonly stampRect = new Map<number, number>();
  private readonly stampGrow = new Map<number, number>();
  private readonly qCx = new Int32Array(CAVE_SEARCH_BUDGET);
  private readonly qSy = new Int32Array(CAVE_SEARCH_BUDGET);
  private readonly qCz = new Int32Array(CAVE_SEARCH_BUDGET);
  private readonly qFace = new Int8Array(CAVE_SEARCH_BUDGET);
  private readonly qRect = new Float64Array(CAVE_SEARCH_BUDGET * 4);
  private readonly eyeVis = new Uint8Array(4096);
  private readonly eyeQ = new Int32Array(4096);
  private readonly eyePortal = new Int16Array(FACE_N * 4);
  private readonly corners = new Float64Array(12);
  private readonly scratch: Projected = { x: 0, y: 0, behind: false };
  private readonly cur: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private readonly next: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private readonly stored: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private readonly full: Rect = { x0: 0, y0: 0, x1: RECT_FULL, y1: RECT_FULL };
  private eyeX = 1e9;
  private eyeY = 1e9;
  private eyeZ = 1e9;
  private eyeGen = 0;
  private eyeBits = 63;
  private last: CaveStats = { steps: 0, complete: true, shown: 0, hidden: 0 };

  stats(): CaveStats {
    return this.last;
  }

  isDrawn(cx: number, sy: number, cz: number): boolean {
    return this.drawGen.get(sectionKey(cx, sy, cz)) === this.frame;
  }

  run(opt: SearchOpt): CaveStats {
    // 長く 歩いても 覚えが ふえ続けない（セクション 4 万を 超えたら 捨てて 作り直す）
    if (this.drawGen.size > 40000) {
      this.drawGen.clear();
      this.stampGen.clear();
      this.stampRect.clear();
      this.stampGrow.clear();
    }
    this.frame++;
    const budget = opt.budget ?? CAVE_SEARCH_BUDGET;
    const ix = Math.floor(opt.eye.x);
    const iy = Math.floor(opt.eye.y);
    const iz = Math.floor(opt.eye.z);
    const cx = ix >> 4;
    let sy = iy >> 4;
    const cz = iz >> 4;
    // カメラが セクションの 外（空の 上・地面の 下）でも、読みこんである 列の いちばん近い 段から 見る
    let start = opt.at(cx, sy, cz);
    if (!start) {
      const dir = sy > 0 ? -1 : 1;
      for (let i = 0; i < 24 && !start; i++) {
        sy += dir;
        if (sy < 0) break;
        start = opt.at(cx, sy, cz);
      }
    }
    if (!start) {
      this.last = { steps: 0, complete: false, shown: 0, hidden: 0 };
      return this.last;
    }
    this.prepareEye(opt, start.graph, ix, iy, iz, cx, sy, cz);
    let qh = 0;
    let qn = 0;
    let steps = 0;
    let complete = true;
    // 空の セクションは 入り口の 面を 区別しない（同じ 画面なら 1 回）。穴のある セクションは 入った 面ごと
    const push = (ncx: number, nsy: number, ncz: number, face: number, x0: number, y0: number, x1: number, y1: number, openNeighbor: boolean): void => {
      const sk = sectionKey(ncx, nsy, ncz) * 8 + (openNeighbor ? 0 : face + 1);
      let rx0 = x0;
      let ry0 = y0;
      let rx1 = x1;
      let ry1 = y1;
      if (this.stampGen.get(sk) === this.frame) {
        unpackRect(this.stampRect.get(sk)!, this.stored);
        if (rx0 >= this.stored.x0 && ry0 >= this.stored.y0 && rx1 <= this.stored.x1 && ry1 <= this.stored.y1) return;
        const grow = this.stampGrow.get(sk) ?? 0;
        if (grow >= GROW_CAP) {
          if (contains(this.stored, this.full)) return;
          rx0 = 0;
          ry0 = 0;
          rx1 = RECT_FULL;
          ry1 = RECT_FULL;
        } else {
          rx0 = Math.min(this.stored.x0, rx0);
          ry0 = Math.min(this.stored.y0, ry0);
          rx1 = Math.max(this.stored.x1, rx1);
          ry1 = Math.max(this.stored.y1, ry1);
          if (rx0 === this.stored.x0 && ry0 === this.stored.y0 && rx1 === this.stored.x1 && ry1 === this.stored.y1) return;
        }
        this.stampGrow.set(sk, grow + 1);
      } else this.stampGrow.set(sk, 0);
      if (qn >= budget) {
        complete = false;
        return;
      }
      this.stampGen.set(sk, this.frame);
      this.stampRect.set(sk, packRect({ x0: rx0, y0: ry0, x1: rx1, y1: ry1 }));
      this.qCx[qn] = ncx;
      this.qSy[qn] = nsy;
      this.qCz[qn] = ncz;
      this.qFace[qn] = face;
      const o = qn * 4;
      this.qRect[o] = rx0;
      this.qRect[o + 1] = ry0;
      this.qRect[o + 2] = rx1;
      this.qRect[o + 3] = ry1;
      qn++;
    };
    this.mark(cx, sy, cz);
    push(cx, sy, cz, -1, 0, 0, RECT_FULL, RECT_FULL, start.graph === OPEN_GRAPH);
    while (qh < qn) {
      if (steps >= budget) {
        complete = false;
        break;
      }
      steps++;
      const scx = this.qCx[qh]!;
      const ssy = this.qSy[qh]!;
      const scz = this.qCz[qh]!;
      const entry = this.qFace[qh]!;
      const o = qh * 4;
      this.cur.x0 = this.qRect[o]!;
      this.cur.y0 = this.qRect[o + 1]!;
      this.cur.x1 = this.qRect[o + 2]!;
      this.cur.y1 = this.qRect[o + 3]!;
      qh++;
      const node = opt.at(scx, ssy, scz);
      if (!node) continue;
      this.mark(scx, ssy, scz);
      const graph = node.graph;
      const fromEye = entry < 0 && scx === cx && ssy === sy && scz === cz;
      let exits = 63;
      let portals: Int16Array | null = null;
      if (fromEye) {
        exits = this.eyeBits;
        portals = this.eyePortal;
      } else if (graph) {
        exits = entry < 0 ? graph.open : graph.reach[entry] ?? graph.open;
        portals = graph.portal;
      }
      const openAir = graph === OPEN_GRAPH;
      for (let f = 0; f < FACE_N; f++) {
        if ((exits & FACE_BIT[f]) === 0) continue;
        if (f === entry) continue;
        const nbx = scx + DX[f];
        const nby = ssy + DY[f];
        const nbz = scz + DZ[f];
        const nb = opt.at(nbx, nby, nbz);
        if (!nb) continue;
        const ng = nb.graph;
        // 空から 空へは さえぎる ものが ない。上の 空は 地面を かくさないので 進まない。うしろの 空にも 進まない
        if (openAir && ng === OPEN_GRAPH) {
          if (f === 0) continue;
          writeCorners(scx, ssy, scz, f, 0, 15, 0, 15, this.corners);
          if (!portalRect(opt.project, this.scratch, this.corners, this.cur, this.next)) continue;
          this.mark(nbx, nby, nbz);
          push(nbx, nby, nbz, OPPOSITE[f], this.cur.x0, this.cur.y0, this.cur.x1, this.cur.y1, true);
          continue;
        }
        const u = this.bounds(portals, f, fromEye);
        if (!u) continue;
        writeCorners(scx, ssy, scz, f, u[0], u[1], u[2], u[3], this.corners);
        const seenRect = portalRect(opt.project, this.scratch, this.corners, this.cur, this.next);
        if (!seenRect) continue;
        this.mark(nbx, nby, nbz);
        if (!this.canPass(ng, OPPOSITE[f], u)) continue;
        const hole = this.overlap(ng, OPPOSITE[f], u);
        // 広い 開口（地面の 横の 空）は 画面を せばめない。狭い 穴（坑道・たて穴）だけ せばめる
        const narrow = hole[1] - hole[0] <= 6 && hole[3] - hole[2] <= 6;
        if (!narrow) {
          push(nbx, nby, nbz, OPPOSITE[f], this.cur.x0, this.cur.y0, this.cur.x1, this.cur.y1, ng === OPEN_GRAPH);
          continue;
        }
        writeCorners(scx, ssy, scz, f, hole[0], hole[1], hole[2], hole[3], this.corners);
        const tight = portalRect(opt.project, this.scratch, this.corners, this.cur, this.next);
        if (!tight) continue;
        push(nbx, nby, nbz, OPPOSITE[f], tight.x0, tight.y0, tight.x1, tight.y1, ng === OPEN_GRAPH);
      }
    }
    this.last = { steps, complete, shown: 0, hidden: 0 };
    return this.last;
  }

  private mark(cx: number, sy: number, cz: number): void {
    this.drawGen.set(sectionKey(cx, sy, cz), this.frame);
  }

  /** 目の マスから 出られる 面。同じ マス・同じ 世代なら 塗り直さない */
  private prepareEye(opt: SearchOpt, graph: FaceGraph | null, ix: number, iy: number, iz: number, cx: number, sy: number, cz: number): void {
    const gen = graph ? 1 : 0;
    if (ix === this.eyeX && iy === this.eyeY && iz === this.eyeZ && gen === this.eyeGen && graph === OPEN_GRAPH) return;
    this.eyeX = ix;
    this.eyeY = iy;
    this.eyeZ = iz;
    this.eyeGen = gen;
    fillPortal(this.eyePortal, 16, -1, 16, -1);
    if (!graph || graph === OPEN_GRAPH) {
      this.eyeBits = 63;
      fillPortal(this.eyePortal, 0, 15, 0, 15);
      return;
    }
    if (graph === CLOSED_GRAPH) {
      this.eyeBits = 0;
      return;
    }
    const lx = ix - cx * 16;
    const ly = iy - sy * 16;
    const lz = iz - cz * 16;
    const inside = lx >= 0 && ly >= 0 && lz >= 0 && lx < 16 && ly < 16 && lz < 16;
    const solid = inside && opt.blocked(ix, iy, iz);
    if (!inside || solid) {
      this.eyeBits = graph.open;
      this.eyePortal.set(graph.portal);
      return;
    }
    this.eyeVis.fill(0);
    this.eyeBits = flood(lx, ly, lz, (x, y, z) => opt.blocked(cx * 16 + x, sy * 16 + y, cz * 16 + z), this.eyePortal, this.eyeVis, this.eyeQ);
  }

  /** 面 f の 穴の 範囲。無ければ null。portals が 目の 成分の とき、空の 面は 使わない */
  private bounds(portals: Int16Array | null, face: number, fromEye: boolean): [number, number, number, number] | null {
    if (!portals) return [0, 15, 0, 15];
    const o = face * 4;
    const u0 = portals[o]!;
    const u1 = portals[o + 1]!;
    const v0 = portals[o + 2]!;
    const v1 = portals[o + 3]!;
    if (u0 > u1 || v0 > v1) return fromEye ? null : [0, 15, 0, 15];
    return [u0, u1, v0, v1];
  }

  private canPass(graph: FaceGraph | null, face: number, hole: [number, number, number, number]): boolean {
    if (!graph) return true;
    if ((graph.open & FACE_BIT[face]) === 0) return false;
    const o = face * 4;
    const u0 = Math.max(hole[0], graph.portal[o]!);
    const u1 = Math.min(hole[1], graph.portal[o + 1]!);
    const v0 = Math.max(hole[2], graph.portal[o + 2]!);
    const v1 = Math.min(hole[3], graph.portal[o + 3]!);
    return u0 <= u1 && v0 <= v1;
  }

  private overlap(graph: FaceGraph | null, face: number, hole: [number, number, number, number]): [number, number, number, number] {
    if (!graph) return hole;
    const o = face * 4;
    return [
      Math.max(hole[0], graph.portal[o]!),
      Math.min(hole[1], graph.portal[o + 1]!),
      Math.max(hole[2], graph.portal[o + 2]!),
      Math.min(hole[3], graph.portal[o + 3]!),
    ];
  }
}

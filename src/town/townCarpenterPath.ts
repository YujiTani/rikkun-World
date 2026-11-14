import { TOWN } from './townTuning';

/**
 * 街の だいくさんの 道さがし（A*。8 方向・まっすぐ 1 ・ななめ 1.4）。立てる 所と 段差（上 1・下 2）は 持ち主から 聞く。
 * 窓（横 pathWindow マス）の 中だけ しらべ、1 回に pathExpand マス まで。作り直さない 入れ物を 使いまわす（毎フレーム new しない）。
 */
const C = TOWN.repair.carpenter;
const W = C.pathWindow;
const UP = 1;
const DOWN = 2;
const DIAG = Math.SQRT2;

/** 行き先: 1 マス か、まとまりの 四角から dMin〜dMax マスの 輪（足場の わくは 1 マス） */
export type Goal = { kind: 'cell'; x: number; z: number } | { kind: 'rect'; minX: number; maxX: number; minZ: number; maxZ: number; dMin: number; dMax: number; /** 立つ 足もとの 高さの はんい（屋根の 上などを さける。なければ 問わない） */ yMin?: number; yMax?: number; /** true を 返す 足もとは 立つ 所に しない（建物の 中など。なければ 問わない） */ reject?: (x: number, y: number, z: number) => boolean };

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export class PathFinder {
  private readonly ys = new Int16Array(W * W);
  private readonly g = new Float32Array(W * W);
  private readonly from = new Int32Array(W * W);
  private readonly closed = new Uint8Array(W * W);
  private readonly seen = new Uint8Array(W * W);
  private readonly heap = new Int32Array(C.pathExpand * 8 + 16);
  private readonly hf = new Float32Array(C.pathExpand * 8 + 16);
  private x0 = 0;
  private z0 = 0;

  /** stand(x, z, fromY) ＝ いまの 高さ fromY から 足を おける 足もとの y（立てなければ null。屋根の 下・橋の 上 などは 高さで 見わける）。blocked(x, z) ＝ 足場の 中など 通らない マス */
  constructor(
    private readonly stand: (x: number, z: number, fromY: number) => number | null,
    private readonly blocked: (x: number, z: number) => boolean,
  ) {}

  /** (sx, sz) の 足もとの 高さ sy から goal まで。道（マスの x, z, 足もとの y の 3 つ ずつ。出発の マスは ふくまない）を out に 書く。着けなければ false */
  find(sx: number, sz: number, sy: number, goal: Goal, out: number[]): boolean {
    out.length = 0;
    const gx = goal.kind === 'cell' ? goal.x : (goal.minX + goal.maxX) >> 1;
    const gz = goal.kind === 'cell' ? goal.z : (goal.minZ + goal.maxZ) >> 1;
    if (Math.abs(gx - sx) > W - 24 || Math.abs(gz - sz) > W - 24) return false;
    this.x0 = ((sx + gx) >> 1) - (W >> 1);
    this.z0 = ((sz + gz) >> 1) - (W >> 1);
    this.closed.fill(0);
    this.seen.fill(0);
    const start = this.idx(sx, sz);
    if (start < 0) return false;
    this.ys[start] = sy;
    if (this.isGoal(sx, sz, sy, goal)) return true; // もう 着いて いる
    let n = 0;
    this.g[start] = 0;
    this.seen[start] = 1;
    this.from[start] = -1;
    n = this.push(n, start, this.h(sx, sz, goal));
    let expanded = 0;
    while (n > 0 && expanded < C.pathExpand) {
      const cur = this.heap[0]!;
      n = this.pop(n);
      if (this.closed[cur]) continue;
      this.closed[cur] = 1;
      expanded++;
      const cx = this.x0 + (cur % W);
      const cz = this.z0 + Math.floor(cur / W);
      const cy = this.ys[cur]!;
      if (this.isGoal(cx, cz, cy, goal)) return this.trace(cur, out);
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k]!;
        const nz = cz + DZ[k]!;
        const ni = this.idx(nx, nz);
        if (ni < 0 || this.closed[ni]) continue;
        const ny = this.step(nx, nz, cy);
        if (ny < 0) continue;
        // ななめは となりの 2 マスも 通れる とき だけ（かどを 切らない）
        if (k >= 4 && (this.step(cx + DX[k]!, cz, cy) < 0 || this.step(cx, cz + DZ[k]!, cy) < 0)) continue;
        const ng = this.g[cur]! + (k >= 4 ? DIAG : 1);
        if (this.seen[ni] === 1 && ng >= this.g[ni]!) continue;
        this.g[ni] = ng;
        this.from[ni] = cur;
        this.ys[ni] = ny;
        this.seen[ni] = 1;
        n = this.push(n, ni, ng + this.h(nx, nz, goal));
      }
    }
    return false;
  }

  // ---- 中

  private idx(x: number, z: number): number {
    const u = x - this.x0;
    const v = z - this.z0;
    return u < 0 || v < 0 || u >= W || v >= W ? -1 : v * W + u;
  }

  /** (x, z) へ いまの 高さ fromY から 1 歩で 行ける 足もとの y（行けなければ −1）。窓の 外・足場の 中は −1 */
  private step(x: number, z: number, fromY: number): number {
    if (this.idx(x, z) < 0 || this.blocked(x, z)) return -1;
    const y = this.stand(x, z, fromY);
    return y === null || y - fromY > UP || fromY - y > DOWN ? -1 : y;
  }

  private isGoal(x: number, z: number, y: number, goal: Goal): boolean {
    if (goal.kind === 'cell') return x === goal.x && z === goal.z;
    const d = this.ring(x, z, goal);
    if (d < goal.dMin || d > goal.dMax) return false;
    if (goal.reject?.(x, y, z) === true) return false;
    return (goal.yMin === undefined || y >= goal.yMin) && (goal.yMax === undefined || y <= goal.yMax);
  }

  private ring(x: number, z: number, r: { minX: number; maxX: number; minZ: number; maxZ: number }): number {
    return Math.max(r.minX - x, 0, x - r.maxX, r.minZ - z, 0, z - r.maxZ);
  }

  private h(x: number, z: number, goal: Goal): number {
    if (goal.kind === 'cell') return Math.max(Math.abs(goal.x - x), Math.abs(goal.z - z));
    return Math.max(0, this.ring(x, z, goal) - goal.dMax);
  }

  private readonly rev: number[] = [];

  private trace(end: number, out: number[]): boolean {
    const rev = this.rev;
    rev.length = 0; // 使いまわす（毎回 new しない）
    for (let c = end; c >= 0 && this.from[c] !== -1; c = this.from[c]!) rev.push(c);
    for (let i = rev.length - 1; i >= 0; i--) {
      const c = rev[i]!;
      const x = this.x0 + (c % W);
      const z = this.z0 + Math.floor(c / W);
      out.push(x, z, this.ys[c]!);
    }
    return true;
  }

  // 2 分 ヒープ（f の 小さい 順）
  private push(n: number, node: number, f: number): number {
    let i = n;
    this.heap[i] = node;
    this.hf[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.hf[p]! <= this.hf[i]!) break;
      this.swap(i, p);
      i = p;
    }
    return n + 1;
  }

  private pop(n: number): number {
    n--;
    this.heap[0] = this.heap[n]!;
    this.hf[0] = this.hf[n]!;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.hf[l]! < this.hf[m]!) m = l;
      if (r < n && this.hf[r]! < this.hf[m]!) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return n;
  }

  private swap(a: number, b: number): void {
    const t = this.heap[a]!;
    this.heap[a] = this.heap[b]!;
    this.heap[b] = t;
    const f = this.hf[a]!;
    this.hf[a] = this.hf[b]!;
    this.hf[b] = f;
  }
}

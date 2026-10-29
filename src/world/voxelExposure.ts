import { CHUNK_SIZE, SECTION_SIZE } from '../contracts';
import { scanColumn, type ColumnInfo } from './micro/worldColumns';
import { SECTION_VOLUME, sectionGet, sectionToArray } from './sections';
import { SEALS, columnKey, type Column } from './voxelColumn';

/** 「見えない」印と 地下の空気（exposure）が 世界から 読む・頼むもの（ChunkedVoxelWorld の一部。4-7） */
interface ExposureHost {
  readonly size: { readonly y: number };
  readonly edgeClosedBelow: number;
  getIndex(x: number, y: number, z: number): number;
  topY(x: number, z: number): number;
  colAt(cx: number, cz: number): Column | null;
  markSectionDirty(cx: number, sy: number, cz: number): void;
}

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const DUG_CAP = 20000;
/** expPending の印: 列ぜんぶ */
const EXP_FULL = 16;

/**
 * セクションの「見えない」印（VOX-plan §6）と、地下の空気が 空にとどいているか（exposure）の数えなおし。
 * ChunkedVoxelWorld から分けた（4-7）。列の辞書は 世界と同じものを 読む。
 */
export class WorldExposure {
  hiddenUsed = false;
  /** 列ごとの「地下の空気」の数えなおし待ち（EXP_FULL = その列ぜんぶ / 下の 4 ビット = 捨てた・足した となりに面した側だけ）。数えたマスは ちぢまない（Column.exp） */
  private readonly expPending = new Map<Column, number>();
  /** ほった穴（空気などに変えたマス）の記録 [x,y,z]…。exposure を作りなおすとき、空にとどいている しるしとして使う */
  private readonly dugCells: number[] = [];
  /** faceHasSurface の作業用 */
  private readonly surfaceInfo: ColumnInfo = { ty: -1, kind: 0, reach: 0, rockOk: false };

  constructor(
    private readonly columns: Map<number, Column>,
    private readonly host: ExposureHost,
  ) {}

  /**
   * 「見えない」印（VOX-plan §6）: セクションの中が全部 ふさがったブロックで、6 方向のとなりの接する面も全部
   * ふさがっている。読みこんでいないとなり・空に向いた面は「あいている」とみなす。下の世界の底はふさがっている。
   * ただし、となりの接する面が 地面の表面ブロック（小ブロック地形で描く。高さ S が上のへりより下までへこむ）なら
   * 「ふさがっている」とは みなさない（#142: 段差の下の固いブロックの面が、S と上のへりの間に見える）。
   * 読みこんでいないセクションは false。
   */
  isSectionHidden(cx: number, sy: number, cz: number): boolean {
    const col = this.host.colAt(cx, cz);
    if (!col || sy < 0 || sy >= col.sections.length) return false;
    this.hiddenUsed = true;
    this.flushExposure();
    let h = col.hidden[sy];
    if (h < 0) {
      h = this.computeHidden(col, sy) ? 1 : 0;
      col.hidden[sy] = h;
    }
    return h === 1;
  }

  private computeHidden(col: Column, sy: number): boolean {
    this.flushExposure();
    if (!this.sectionClosed(col, sy)) return false;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const ny = sy + dy;
      if (ny < 0) continue; // 世界の底
      const n = this.columns.get(columnKey(col.cx + dx, col.cz + dz));
      if (n === undefined && dy === 0 && sy * SECTION_SIZE + SECTION_SIZE - 1 < this.host.edgeClosedBelow) continue;
      if (n === undefined || ny >= n.sections.length) return false;
      if (!this.faceClosed(n, ny, -dx, -dy, -dz)) return false;
    }
    // となりの接する面が 地面の表面ブロックなら見える（下のとなりは 上に固いブロックがあるので 表面ブロックではない）
    for (const [dx, dy, dz] of NEIGHBORS) {
      if (dy < 0) continue;
      if (this.faceHasSurface(col.cx + dx, sy + dy, col.cz + dz, -dx, -dy, -dz)) return false;
    }
    return true;
  }

  /**
   * セクション (cx, sy, cz) の (fx, fy, fz) 向きの外側の面（端の 16×16）に、その列の地面の表面ブロック
   * （worldColumns の scanColumn の ty）が あるか。よこの面（fy = 0）は 16 列（どの高さでも）、上下の面（fy ≠ 0）は 256 列（その段だけ）を 調べる。
   */
  private faceHasSurface(cx: number, sy: number, cz: number, fx: number, fy: number, fz: number): boolean {
    const info = this.surfaceInfo;
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const y0 = sy * SECTION_SIZE;
    if (fy !== 0) {
      const y = fy > 0 ? y0 + SECTION_SIZE - 1 : y0;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          scanColumn(this.host, x0 + lx, z0 + lz, info);
          if (info.ty === y) return true;
        }
      }
      return false;
    }
    for (let c = 0; c < CHUNK_SIZE; c++) {
      const wx = x0 + (fx !== 0 ? (fx > 0 ? CHUNK_SIZE - 1 : 0) : c);
      const wz = z0 + (fz !== 0 ? (fz > 0 ? CHUNK_SIZE - 1 : 0) : c);
      scanColumn(this.host, wx, wz, info);
      if (info.ty >= y0 && info.ty < y0 + SECTION_SIZE) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ 地下の空気（exposure）

  /**
   * ふさがったブロック、または「空にとどいていない地下の空気」か。空気は、空・読みこんでいない列・世界の上・
   * ほった穴に つながっていれば「あいている」。exposure を先に作っておくこと。
   */
  private blockClosed(col: Column, sy: number, li: number, b: number): boolean {
    if (SEALS[b] === 1) return true;
    if (b !== 0) return false;
    const lx = li & 15;
    const lz = (li >> 4) & 15;
    const y = sy * SECTION_SIZE + (li >> 8);
    if (y > this.skyOf(col)[(lz << 4) | lx]) return false;
    const bits = col.exp[sy];
    return bits === null || (bits[li >> 3] & (1 << (li & 7))) === 0;
  }

  private sectionClosed(col: Column, sy: number): boolean {
    const s = col.sections[sy];
    if (s.kind === 'uniform') {
      if (SEALS[s.block] === 1) return true;
      if (s.block !== 0) return false;
    } else if (s.kind === 'palette') {
      let allSealed = true;
      for (const b of s.palette) {
        if (SEALS[b] === 1) continue;
        allSealed = false;
        if (b !== 0) return false;
      }
      if (allSealed) return true;
    }
    for (let li = 0; li < SECTION_VOLUME; li++) if (!this.blockClosed(col, sy, li, sectionGet(s, li))) return false;
    return true;
  }

  /** セクション (col, sy) の (dx,dy,dz) 向きの外側の面（端の 16×16）が 全部「ふさがった / 地下の空気」か */
  private faceClosed(col: Column, sy: number, dx: number, dy: number, dz: number): boolean {
    const s = col.sections[sy];
    if (s.kind === 'uniform' && SEALS[s.block] === 1) return true;
    const fixed = (d: number) => (d > 0 ? 15 : 0);
    for (let a = 0; a < 16; a++) {
      for (let c = 0; c < 16; c++) {
        let li: number;
        if (dx !== 0) li = (a << 8) | (c << 4) | fixed(dx);
        else if (dy !== 0) li = (fixed(dy) << 8) | (a << 4) | c;
        else li = (a << 8) | (fixed(dz) << 4) | c;
        if (!this.blockClosed(col, sy, li, sectionGet(s, li))) return false;
      }
    }
    return true;
  }

  private skyOf(col: Column): Int16Array {
    if (col.sky !== null) return col.sky;
    const sky = new Int16Array(256);
    const ox = col.cx * CHUNK_SIZE;
    const oz = col.cz * CHUNK_SIZE;
    let mx = -1;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const t = this.host.topY(ox + lx, oz + lz);
        sky[(lz << 4) | lx] = t;
        if (t > mx) mx = t;
      }
    }
    col.sky = sky;
    col.skyMax = mx;
    return sky;
  }

  /** (x,y,z) が 空・読みこんでいない所・世界の上か（そのマスが空気かは 見ない） */
  private skyish(x: number, y: number, z: number): boolean {
    if (y >= this.host.size.y) return true;
    if (y < 0) return false;
    const c = this.columns.get(columnKey(x >> 4, z >> 4));
    if (c === undefined) return y >= this.host.edgeClosedBelow;
    return y > this.skyOf(c)[((z & 15) << 4) | (x & 15)];
  }

  /** 印をつける。もうついていたら false */
  private expAdd(col: Column, sy: number, li: number): boolean {
    let bits = col.exp[sy];
    if (bits === null) bits = col.exp[sy] = new Uint8Array(SECTION_VOLUME >> 3);
    const m = 1 << (li & 7);
    if ((bits[li >> 3] & m) !== 0) return false;
    bits[li >> 3] |= m;
    return true;
  }

  /** 数えなおし待ちの列の数（テスト用） */
  exposurePending(): number {
    return this.expPending.size;
  }

  /** たまった数えなおしを いま片づける（毎コマ renderer から。最初にほる・読む人が 一度に まとめて 作り直しを起こさないように） */
  settleExposure(): void {
    if (this.hiddenUsed) this.flushExposure();
  }

  /** 数えなおし待ちの列を 数えなおす（hidden を読む前・ほる前に呼ぶ）。足した空気が 数えずみの列にとどいたら その絵を作りなおす */
  private flushExposure(): void {
    if (this.expPending.size === 0) return;
    const pending = [...this.expPending];
    this.expPending.clear();
    const q: number[] = [];
    const added: number[] = [];
    const fresh = new Set<Column>();
    for (const [col, mask] of pending) {
      if (this.columns.get(columnKey(col.cx, col.cz)) !== col) continue;
      if ((mask & EXP_FULL) !== 0) {
        this.seedColumn(col, q);
        fresh.add(col);
      } else {
        for (let side = 0; side < 4; side++) if ((mask & (1 << side)) !== 0) this.seedSide(col, side, q, added);
      }
    }
    if (fresh.size > 0) {
      const dug = this.dugCells;
      for (let i = 0; i < dug.length; i += 3) {
        const x = dug[i];
        const y = dug[i + 1];
        const z = dug[i + 2];
        const col = this.columns.get(columnKey(x >> 4, z >> 4));
        if (col === undefined || !fresh.has(col) || this.host.getIndex(x, y, z) !== 0) continue;
        if (this.expAdd(col, y >> 4, ((y & 15) << 8) | ((z & 15) << 4) | (x & 15))) q.push(x, y, z);
      }
    }
    this.spreadExposure(q, added);
    this.notifyExposed(added, fresh);
  }

  /** 空になった（地下の空気が空にとどいた）マスの セクションと となりを 作りなおす。skip の列は 新しいので 何もしない */
  private notifyExposed(added: number[], skip: ReadonlySet<Column> | null): void {
    if (added.length === 0) return;
    const secs = new Set<number>();
    for (let i = 0; i < added.length; i += 3) secs.add(((added[i] >> 4) + 4096) * 8192 * 32 + ((added[i + 2] >> 4) + 4096) * 32 + (added[i + 1] >> 4));
    for (const id of secs) {
      const sy = id % 32;
      const cz = (Math.floor(id / 32) % 8192) - 4096;
      const cx = Math.floor(id / (8192 * 32)) - 4096;
      const c = this.columns.get(columnKey(cx, cz));
      if (c !== undefined && skip?.has(c)) continue;
      this.staleAround(cx, sy, cz);
      this.host.markSectionDirty(cx, sy, cz);
      for (const [dx, dy, dz] of NEIGHBORS) this.host.markSectionDirty(cx + dx, sy + dy, cz + dz);
    }
  }

  /** 新しい列 1 つぶんの「空にとどいている地下の空気」を数える（となりの数えずみの空気からも つなぐ） */
  private seedColumn(col: Column, q: number[]): void {
    const sky = this.skyOf(col);
    const ox = col.cx * CHUNK_SIZE;
    const oz = col.cz * CHUNK_SIZE;
    for (let sy = 0; sy < col.sections.length; sy++) {
      const y0 = sy * SECTION_SIZE;
      if (y0 > col.skyMax) break;
      const s = col.sections[sy];
      if (s.kind === 'uniform' ? s.block !== 0 : s.kind === 'palette' && !s.palette.includes(0)) continue;
      const d = s.kind === 'uniform' ? null : sectionToArray(s);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const top = Math.min(SECTION_SIZE - 1, sky[(lz << 4) | lx] - y0);
          for (let ly = 0; ly <= top; ly++) {
            if (d !== null && d[(ly << 8) | (lz << 4) | lx] !== 0) continue;
            const y = y0 + ly;
            const x = ox + lx;
            const z = oz + lz;
            // 上が空 / よこが 空・読みこんでいない列（下は 自分より低いので 空ではない）
            const open =
              y + 1 > sky[(lz << 4) | lx] ||
              (lx < 15 ? y > sky[(lz << 4) | (lx + 1)] : this.skyish(x + 1, y, z)) ||
              (lx > 0 ? y > sky[(lz << 4) | (lx - 1)] : this.skyish(x - 1, y, z)) ||
              (lz < 15 ? y > sky[((lz + 1) << 4) | lx] : this.skyish(x, y, z + 1)) ||
              (lz > 0 ? y > sky[((lz - 1) << 4) | lx] : this.skyish(x, y, z - 1));
            if (open && this.expAdd(col, sy, (ly << 8) | (lz << 4) | lx)) q.push(x, y, z);
          }
        }
      }
    }
    // となりの列で もう空にとどいている空気に つながる
    for (let side = 0; side < 4; side++) this.joinSide(col, side, q);
  }

  /** side: 0 = +x, 1 = −x, 2 = +z, 3 = −z の ふち。col のふちの空気が、となりの数えずみの空気につながっていれば 数える */
  private joinSide(col: Column, side: number, q: number[]): void {
    const dx = side === 0 ? 1 : side === 1 ? -1 : 0;
    const dz = side === 2 ? 1 : side === 3 ? -1 : 0;
    const nb = this.columns.get(columnKey(col.cx + dx, col.cz + dz));
    if (nb === undefined) return;
    const sky = this.skyOf(col);
    const edge = dx !== 0 ? (dx > 0 ? 15 : 0) : dz > 0 ? 15 : 0;
    const nEdge = 15 - edge;
    for (let sy = 0; sy < col.sections.length; sy++) {
      const nbits = nb.exp[sy];
      if (nbits === null) continue;
      for (let ly = 0; ly < SECTION_SIZE; ly++) {
        for (let a = 0; a < 16; a++) {
          const lx = dx !== 0 ? edge : a;
          const lz = dx !== 0 ? a : edge;
          const li = (ly << 8) | (lz << 4) | lx;
          const nli = (ly << 8) | ((dx !== 0 ? a : nEdge) << 4) | (dx !== 0 ? nEdge : a);
          if ((nbits[nli >> 3] & (1 << (nli & 7))) === 0) continue;
          const y = sy * SECTION_SIZE + ly;
          if (y > sky[(lz << 4) | lx]) continue;
          if (sectionGet(col.sections[sy], li) !== 0) continue;
          if (this.expAdd(col, sy, li)) q.push(col.cx * CHUNK_SIZE + lx, y, col.cz * CHUNK_SIZE + lz);
        }
      }
    }
  }

  /** 数えずみの列の side のふちを、いまの となり（読みこんでいない / 空）に合わせて 数えなおす */
  private seedSide(col: Column, side: number, q: number[], added: number[]): void {
    const dx = side === 0 ? 1 : side === 1 ? -1 : 0;
    const dz = side === 2 ? 1 : side === 3 ? -1 : 0;
    const sky = this.skyOf(col);
    const edge = dx !== 0 ? (dx > 0 ? 15 : 0) : dz > 0 ? 15 : 0;
    const ox = col.cx * CHUNK_SIZE;
    const oz = col.cz * CHUNK_SIZE;
    const loadedNb = this.columns.has(columnKey(col.cx + dx, col.cz + dz));
    for (let a = 0; a < 16; a++) {
      const lx = dx !== 0 ? edge : a;
      const lz = dx !== 0 ? a : edge;
      const top = sky[(lz << 4) | lx];
      for (let y = 0; y <= top; y++) {
        if (loadedNb) break; // となりがいれば 空気は そちらから つながる（足した列の joinSide）
        if (y < this.host.edgeClosedBelow) continue;
        const sy = y >> 4;
        const li = ((y & 15) << 8) | (lz << 4) | lx;
        if (sectionGet(col.sections[sy], li) !== 0) continue;
        if (this.expAdd(col, sy, li)) {
          q.push(ox + lx, y, oz + lz);
          added.push(ox + lx, y, oz + lz);
        }
      }
    }
  }

  /** q（x,y,z の並び）の空気から、つながった地下の空気へ 広げる（広がったマスを added に足す） */
  private spreadExposure(q: number[], added: number[] | null): void {
    for (let qi = 0; qi < q.length; qi += 3) {
      const x = q[qi];
      const y = q[qi + 1];
      const z = q[qi + 2];
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (this.host.getIndex(nx, ny, nz) !== 0) continue;
        const col = this.host.colAt(nx >> 4, nz >> 4)!;
        if (ny > this.skyOf(col)[((nz & 15) << 4) | (nx & 15)]) continue; // 空
        if (!this.expAdd(col, ny >> 4, ((ny & 15) << 8) | ((nz & 15) << 4) | (nx & 15))) continue;
        q.push(nx, ny, nz);
        added?.push(nx, ny, nz);
      }
    }
  }

  /** ほった（空気などに変えた）マス: 空にとどいていることにして、つながった地下の空気も 見えるようにする */
  noteDug(col: Column, x: number, y: number, z: number): void {
    if (y > this.skyOf(col)[((z & 15) << 4) | (x & 15)]) return; // 空の中
    if (this.dugCells.length < DUG_CAP * 3) this.dugCells.push(x, y, z);
    if (!this.hiddenUsed) return;
    this.flushExposure();
    if (!this.expAdd(col, y >> 4, ((y & 15) << 8) | ((z & 15) << 4) | (x & 15))) return;
    const added: number[] = [];
    this.spreadExposure([x, y, z], added);
    if (added.length === 0) return;
    this.notifyExposed(added, null);
  }

  /** ブロックを変えた: だれかが 印を読んでいれば、まわりの印を つけなおす。底の段（ly=0）のマスは 1 つ下のセクションも */
  noteBlockChanged(cx: number, sy: number, cz: number, ly: number): void {
    if (!this.hiddenUsed) return;
    this.staleAround(cx, sy, cz);
    // 底の段（ly=0）のマス: 列の表面（ty）が 1 つ下のセクションの いちばん上の段と行き来するので、そちらのとなりの印も見なおす
    if (ly === 0 && sy > 0) this.staleAround(cx, sy - 1, cz);
  }

  /** 列 (cx, cz) の読みこみ・捨て: その列（あれば）と、4 つのとなりの その側が 数えなおし待ちになる。ほかの列の数えたマスは そのまま */
  invalidateExposure(cx: number, cz: number): void {
    const own = this.columns.get(columnKey(cx, cz));
    if (own !== undefined) {
      own.hidden.fill(-1);
      this.expPending.set(own, (this.expPending.get(own) ?? 0) | EXP_FULL);
    }
    for (let side = 0; side < 4; side++) {
      const dx = side === 0 ? 1 : side === 1 ? -1 : 0;
      const dz = side === 2 ? 1 : side === 3 ? -1 : 0;
      const nb = this.columns.get(columnKey(cx + dx, cz + dz));
      if (nb === undefined) continue;
      // nb から見て、この列は 逆向きの側
      this.expPending.set(nb, (this.expPending.get(nb) ?? 0) | (1 << (side ^ 1)));
    }
  }

  /** 自分と 6 つのとなりの印を つけなおす */
  staleAround(cx: number, sy: number, cz: number): void {
    if (!this.hiddenUsed) return; // まだ だれも 印を読んでいなければ、全部 しなおし待ちのまま
    this.staleOne(cx, sy, cz);
    for (const [dx, dy, dz] of NEIGHBORS) this.staleOne(cx + dx, sy + dy, cz + dz);
  }

  private staleOne(cx: number, sy: number, cz: number): void {
    const c = this.columns.get(columnKey(cx, cz));
    if (c && sy >= 0 && sy < c.hidden.length) c.hidden[sy] = -1;
  }

  staleNeighborsOfColumn(cx: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.columns.get(columnKey(cx + dx, cz + dz));
        if (c) c.hidden.fill(-1);
      }
  }
}

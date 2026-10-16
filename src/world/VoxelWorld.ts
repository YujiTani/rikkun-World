import {
  CHUNK_SIZE,
  SECTION_SIZE,
  WORLD_HEIGHT,
  WORLD_SIZE,
  type BlockId,
  type ChunkColumn,
  type LoadedBounds,
  type SectionData,
  type VoxelWorld,
} from '../contracts';
import { BLOCK_TYPES, blockIdFromIndex, blockIndexOf, isOpaqueIndex, isSolidIndex } from './blocks/blockTypes';
import { OPACITY } from './light/opacity';
import { SECTION_VOLUME, compactSection, localIndex, sectionGet, sectionSet, sectionToArray, uniformSection } from './sections';

export { CHUNK_SIZE, SECTION_SIZE, WORLD_SIZE };
export type { LoadedBounds };

/** 列の辞書のキー（数 1 つ）。VOX-plan §2 */
export function columnKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** 光も通さない 本当に ふさがったブロック（「見えない」印の判定用） */
const SEALS: Uint8Array = Uint8Array.from(BLOCK_TYPES, (_, i) => (isOpaqueIndex(i) && isSolidIndex(i) && OPACITY[i] === 15 ? 1 : 0));

/** 1 列（16×WORLD_HEIGHT×16）。ChunkColumn の形で持つ */
class Column implements ChunkColumn {
  readonly sections: SectionData[];
  /** セクションごとの「見えない」印: -1 = 計算しなおし待ち、0 = 見える、1 = 見えない */
  readonly hidden: Int8Array;
  constructor(
    readonly cx: number,
    readonly cz: number,
    sections: SectionData[],
  ) {
    this.sections = sections;
    this.hidden = new Int8Array(sections.length).fill(-1);
    this.fast = new Array<Uint8Array | null>(sections.length).fill(null);
    this.uni = new Int16Array(sections.length);
    for (let sy = 0; sy < sections.length; sy++) this.sync(sy);
  }
  /** 読み出しを速くする写し: full なら その配列、それ以外は null（sections と同じものを指す） */
  readonly fast: (Uint8Array | null)[];
  /** 描画側に「変わった」と伝える印（World が持つ一覧に入っているか・どのセクションか） */
  colDirty = false;
  secListed = false;
  secBits = 0;
  /** uniform なら その番号、palette なら -2、full なら -1 */
  readonly uni: Int16Array;

  /** sections[sy] を入れかえたら呼ぶ */
  sync(sy: number): void {
    const s = this.sections[sy];
    this.fast[sy] = s.kind === 'full' ? s.data : null;
    this.uni[sy] = s.kind === 'uniform' ? s.block : s.kind === 'full' ? -1 : -2;
  }
}

export interface SectionPos {
  cx: number;
  sy: number;
  cz: number;
}

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * 列の辞書 + 1 列 WORLD_HEIGHT/16 個のセクション で ブロックを持つ VoxelWorld（VOX-A）。
 * 読みこんでいない マス・高さの外は 'outside'。変わったチャンク（列）・セクションを覚えておく。
 */
export class ChunkedVoxelWorld implements VoxelWorld {
  readonly size: { readonly y: number };
  /** セクションの数（高さを 16 で切り上げたもの） */
  private readonly nSections: number;
  private readonly columns = new Map<number, Column>();
  private readonly dirtyColList: Column[] = [];
  private readonly dirtySecList: Column[] = [];
  private hiddenUsed = false;
  private lastCx = NaN;
  private lastCz = NaN;
  private lastCol: Column | null = null;
  private b: LoadedBounds = { x0: 0, z0: 0, x1: 0, z1: 0 };
  /** 光の計算し直し用: 前回の takeChangeBox() からあとに変わったマスをふくむ箱（無ければ null） */
  private changeBox: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null = null;

  /**
   * extent: 読みこんでおく範囲（原点から x×z マス ぶんの列を 空気で作る）。
   * y は高さ（なければ WORLD_HEIGHT。高さの外は 'outside'。テストや試作が 小さい・高い世界を作るため）。
   * 今の島は WORLD_SIZE。
   */
  constructor(extent: { x: number; z: number; y?: number } = WORLD_SIZE) {
    const height = extent.y ?? WORLD_HEIGHT;
    this.size = { y: height };
    this.nSections = Math.ceil(height / SECTION_SIZE);
    const nx = Math.ceil(extent.x / CHUNK_SIZE);
    const nz = Math.ceil(extent.z / CHUNK_SIZE);
    for (let cz = 0; cz < nz; cz++) for (let cx = 0; cx < nx; cx++) this.addColumn(this.emptyColumn(cx, cz));
  }

  // ------------------------------------------------------------ 列

  private emptyColumn(cx: number, cz: number): Column {
    return new Column(cx, cz, Array.from({ length: this.nSections }, () => uniformSection(0)));
  }

  /** 列を 1 つ足す（もうあれば置きかえる）。sections は WORLD_HEIGHT/16 個 */
  loadColumn(column: ChunkColumn): void {
    if (column.sections.length !== this.nSections) throw new Error('セクションの数がちがいます');
    this.addColumn(new Column(column.cx, column.cz, column.sections.slice()));
  }

  /** 列を捨てる。あったら true */
  unloadColumn(cx: number, cz: number): boolean {
    const key = columnKey(cx, cz);
    if (!this.columns.delete(key)) return false;
    this.forgetLast();
    this.recomputeBounds();
    this.staleNeighborsOfColumn(cx, cz);
    return true;
  }

  column(cx: number, cz: number): ChunkColumn | undefined {
    return this.columns.get(columnKey(cx, cz));
  }

  columnCount(): number {
    return this.columns.size;
  }

  /** 読みこんである列の (cx, cz) */
  loadedColumns(): { cx: number; cz: number }[] {
    return [...this.columns.values()].map((c) => ({ cx: c.cx, cz: c.cz }));
  }

  /** 読みこんである列をふくむ いちばん小さい長方形（ブロック座標。何も無ければ 0） */
  loadedBounds(): LoadedBounds {
    return { ...this.b };
  }

  private addColumn(col: Column): void {
    const key = columnKey(col.cx, col.cz);
    this.columns.set(key, col);
    this.forgetLast();
    this.markCol(col);
    this.markAllSecs(col);
    this.recomputeBounds();
    this.staleNeighborsOfColumn(col.cx, col.cz);
  }

  private recomputeBounds(): void {
    if (this.columns.size === 0) {
      this.b = { x0: 0, z0: 0, x1: 0, z1: 0 };
      return;
    }
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const c of this.columns.values()) {
      if (c.cx < x0) x0 = c.cx;
      if (c.cz < z0) z0 = c.cz;
      if (c.cx > x1) x1 = c.cx;
      if (c.cz > z1) z1 = c.cz;
    }
    this.b = { x0: x0 * CHUNK_SIZE, z0: z0 * CHUNK_SIZE, x1: (x1 + 1) * CHUNK_SIZE, z1: (z1 + 1) * CHUNK_SIZE };
  }

  private colAt(cx: number, cz: number): Column | null {
    if (cx === this.lastCx && cz === this.lastCz) return this.lastCol;
    const c = this.columns.get(columnKey(cx, cz)) ?? null;
    this.lastCx = cx;
    this.lastCz = cz;
    this.lastCol = c;
    return c;
  }

  private forgetLast(): void {
    this.lastCx = NaN;
    this.lastCz = NaN;
    this.lastCol = null;
  }

  isLoaded(x: number, z: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    return this.colAt(Math.floor(x) >> 4, Math.floor(z) >> 4) !== null;
  }

  // ------------------------------------------------------------ 読み書き

  /** ブロックの番号（BLOCK_TYPES の順）。読みこんでいない・高さの外は -1。描画の高速な読み出し用 */
  getIndex(x: number, y: number, z: number): number {
    if (x !== (x | 0) || y !== (y | 0) || z !== (z | 0) || y < 0 || y >= this.size.y) return -1;
    const col = this.colAt(x >> 4, z >> 4);
    if (col === null) return -1;
    const sy = y >> 4;
    const d = col.fast[sy];
    if (d !== null) return d[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)];
    const u = col.uni[sy];
    if (u >= 0) return u;
    return sectionGet(col.sections[sy], ((y & 15) << 8) | ((z & 15) << 4) | (x & 15));
  }

  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    const i = this.getIndex(x, y, z);
    return i < 0 ? 'outside' : blockIdFromIndex(i);
  }

  /** 書く。変えたら true（同じ値でも true）。dirty などは呼ぶ側で */
  private put(col: Column, x: number, y: number, z: number, b: number): boolean {
    const sy = y >> 4;
    const li = ((y & 15) << 8) | ((z & 15) << 4) | (x & 15);
    const d = col.fast[sy];
    if (d !== null) {
      if (d[li] === b) return false;
      d[li] = b;
      return true;
    }
    const s = col.sections[sy];
    if (sectionGet(s, li) === b) return false;
    const ns = sectionSet(s, li, b);
    if (ns !== s) {
      col.sections[sy] = ns;
      col.sync(sy);
    }
    return true;
  }

  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    const b = blockIndexOf(id);
    if (b < 0 || x !== (x | 0) || y !== (y | 0) || z !== (z | 0) || y < 0 || y >= this.size.y) return false;
    const col = this.colAt(x >> 4, z >> 4);
    if (col === null) return false;
    const sy = y >> 4;
    const d = col.fast[sy];
    if (d !== null) {
      // いちばん多い道: full のセクションの中を 同じセクションのまま 書きつづける
      const li = ((y & 15) << 8) | ((z & 15) << 4) | (x & 15);
      if (d[li] === b) return true;
      d[li] = b;
      this.noteDirty(col, x, y, z);
      const cb = this.changeBox;
      if (cb === null) this.changeBox = { x0: x, y0: y, z0: z, x1: x, y1: y, z1: z };
      else {
        if (x < cb.x0) cb.x0 = x;
        if (y < cb.y0) cb.y0 = y;
        if (z < cb.z0) cb.z0 = z;
        if (x > cb.x1) cb.x1 = x;
        if (y > cb.y1) cb.y1 = y;
        if (z > cb.z1) cb.z1 = z;
      }
      return true;
    }
    if (!this.put(col, x, y, z, b)) return true;
    this.noteDirty(col, x, y, z);
    this.noteChange(x, y, z, x, y, z);
    return true;
  }

  /** 変えたマスの dirty とステイルの印 */
  private noteDirty(col: Column, x: number, y: number, z: number): void {
    const sy = y >> 4;
    this.markCol(col);
    this.markSec(col, sy);
    const lx = x & 15;
    const lz = z & 15;
    const ly = y & 15;
    if (lx === 0 || lx === 15 || lz === 0 || lz === 15 || ly === 0 || ly === 15) this.markEdgeNeighbors(col, sy, lx, ly, lz);
    if (this.hiddenUsed) this.staleAround(col.cx, sy, col.cz);
  }

  private markCol(c: Column): void {
    if (!c.colDirty) {
      c.colDirty = true;
      this.dirtyColList.push(c);
    }
  }

  private markSec(c: Column, sy: number): void {
    c.secBits |= 1 << sy;
    if (!c.secListed) {
      c.secListed = true;
      this.dirtySecList.push(c);
    }
  }

  private markAllSecs(c: Column): void {
    c.secBits = c.sections.length >= 31 ? -1 : (1 << c.sections.length) - 1;
    if (!c.secListed) {
      c.secListed = true;
      this.dirtySecList.push(c);
    }
  }

  /** 列のふち・セクションのふちのマスが変わった: となりの列・セクションも作り直す（ブロックの変化は reach 1） */
  private markEdgeNeighbors(col: Column, sy: number, lx: number, ly: number, lz: number): void {
    const nx = lx === 0 ? -1 : lx === 15 ? 1 : 0;
    const nz = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    if (nx !== 0) this.markNeighbor(col.cx + nx, sy, col.cz, true);
    if (nz !== 0) this.markNeighbor(col.cx, sy, col.cz + nz, true);
    if (ly === 0 && sy > 0) this.markSec(col, sy - 1);
    if (ly === 15 && sy + 1 < this.nSections) this.markSec(col, sy + 1);
  }

  private markNeighbor(cx: number, sy: number, cz: number, col: boolean): void {
    const c = this.columns.get(columnKey(cx, cz));
    if (!c) return;
    if (col) this.markCol(c);
    this.markSec(c, sy);
  }

  /** M7: id は変えずに、そのマスのチャンクだけ 見た目を作り直させる（作物の段階）。光は 計算し直さない */
  touch(x: number, y: number, z: number): void {
    if (this.getIndex(x, y, z) < 0) return;
    const col = this.colAt(x >> 4, z >> 4);
    if (col) this.noteDirty(col, x, y, z);
  }

  isSolid(x: number, y: number, z: number): boolean {
    const i = this.getIndex(x, y, z);
    return i >= 0 && isSolidIndex(i);
  }

  /** 2 つの角をふくむ箱の中をすべて id にする。変えたブロックの数を返す（読みこんでいない所・高さの外は変えない） */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): number {
    const b = blockIndexOf(id);
    if (b < 0) return 0;
    const xa = Math.ceil(Math.min(x0, x1));
    const ya = Math.max(0, Math.ceil(Math.min(y0, y1)));
    const za = Math.ceil(Math.min(z0, z1));
    const xb = Math.floor(Math.max(x0, x1));
    const yb = Math.min(this.size.y - 1, Math.floor(Math.max(y0, y1)));
    const zb = Math.floor(Math.max(z0, z1));
    let changed = 0;
    let cminx = Infinity;
    let cminy = Infinity;
    let cminz = Infinity;
    let cmaxx = -Infinity;
    let cmaxy = -Infinity;
    let cmaxz = -Infinity;
    for (let z = za; z <= zb; z++) {
      for (let x = xa; x <= xb; x++) {
        const col = this.colAt(x >> 4, z >> 4);
        if (col === null) continue;
        for (let y = ya; y <= yb; y++) {
          if (!this.put(col, x, y, z, b)) continue;
          changed++;
          this.noteDirty(col, x, y, z);
          if (x < cminx) cminx = x;
          if (y < cminy) cminy = y;
          if (z < cminz) cminz = z;
          if (x > cmaxx) cmaxx = x;
          if (y > cmaxy) cmaxy = y;
          if (z > cmaxz) cmaxz = z;
        }
      }
    }
    if (changed > 0) this.noteChange(cminx, cminy, cminz, cmaxx, cmaxy, cmaxz);
    return changed;
  }

  private noteChange(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const b = this.changeBox;
    if (!b) {
      this.changeBox = { x0, y0, z0, x1, y1, z1 };
      return;
    }
    if (x0 < b.x0) b.x0 = x0;
    if (y0 < b.y0) b.y0 = y0;
    if (z0 < b.z0) b.z0 = z0;
    if (x1 > b.x1) b.x1 = x1;
    if (y1 > b.y1) b.y1 = y1;
    if (z1 > b.z1) b.z1 = z1;
  }

  /** 変わったマスをふくむ箱を渡して、覚えているのを空にする（光の計算し直し用） */
  takeChangeBox(): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null {
    const b = this.changeBox;
    this.changeBox = null;
    return b;
  }

  /**
   * 原点から (sx, size.y, sz) の四角の全ブロック番号を、平らな番号 (y * sz + z) * sx + x で out に写す
   * （保存の「島とちがうマス」の比べ用。読みこんでいない所は書きかえない）
   */
  fillFlat(out: Uint8Array, sx: number, sz: number): void {
    for (const c of this.columns.values()) {
      const bx = c.cx * CHUNK_SIZE;
      const bz = c.cz * CHUNK_SIZE;
      if (bx < 0 || bz < 0 || bx >= sx || bz >= sz) continue;
      const w = Math.min(CHUNK_SIZE, sx - bx);
      for (let sy = 0; sy < c.sections.length; sy++) {
        const arr = sectionToArray(c.sections[sy]);
        for (let ly = 0; ly < SECTION_SIZE; ly++) {
          const y = sy * SECTION_SIZE + ly;
          if (y >= this.size.y) break;
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const z = bz + lz;
            if (z >= sz) break;
            const o = (ly * 16 + lz) * 16;
            out.set(arr.subarray(o, o + w), (y * sz + z) * sx + bx);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ セクション

  /** セクションの中身（読みこんでいなければ undefined）。読むだけ */
  section(cx: number, sy: number, cz: number): SectionData | undefined {
    return this.colAt(cx, cz)?.sections[sy];
  }

  /** セクションの形を いちばん小さくする（中身は同じ）。形が変わったら true */
  compactSection(cx: number, sy: number, cz: number): boolean {
    const col = this.colAt(cx, cz);
    if (!col || sy < 0 || sy >= col.sections.length) return false;
    const before = col.sections[sy];
    const after = compactSection(before);
    col.sections[sy] = after;
    col.sync(sy);
    return after !== before;
  }

  /** ぜんぶのセクションを compactSection する */
  compactAll(): void {
    for (const c of this.columns.values()) {
      for (let sy = 0; sy < c.sections.length; sy++) {
        c.sections[sy] = compactSection(c.sections[sy]);
        c.sync(sy);
      }
    }
  }

  /**
   * 「見えない」印（VOX-plan §6）: セクションの中が全部 ふさがったブロックで、6 方向のとなりの接する面も全部
   * ふさがっている。読みこんでいないとなり・空に向いた面は「あいている」とみなす。下の世界の底はふさがっている。
   * 読みこんでいないセクションは false。
   */
  isSectionHidden(cx: number, sy: number, cz: number): boolean {
    const col = this.colAt(cx, cz);
    if (!col || sy < 0 || sy >= col.sections.length) return false;
    this.hiddenUsed = true;
    let h = col.hidden[sy];
    if (h < 0) {
      h = this.computeHidden(col, sy) ? 1 : 0;
      col.hidden[sy] = h;
    }
    return h === 1;
  }

  private computeHidden(col: Column, sy: number): boolean {
    if (!sectionAllSealed(col.sections[sy])) return false;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const ny = sy + dy;
      if (ny < 0) continue; // 世界の底
      const n = this.columns.get(columnKey(col.cx + dx, col.cz + dz));
      if (n === undefined || ny >= n.sections.length) return false;
      if (!faceSealed(n.sections[ny], -dx, -dy, -dz)) return false;
    }
    return true;
  }

  /** 自分と 6 つのとなりの印を つけなおす */
  private staleAround(cx: number, sy: number, cz: number): void {
    if (!this.hiddenUsed) return; // まだ だれも 印を読んでいなければ、全部 しなおし待ちのまま
    this.staleOne(cx, sy, cz);
    for (const [dx, dy, dz] of NEIGHBORS) this.staleOne(cx + dx, sy + dy, cz + dz);
  }

  private staleOne(cx: number, sy: number, cz: number): void {
    const c = this.columns.get(columnKey(cx, cz));
    if (c && sy >= 0 && sy < c.hidden.length) c.hidden[sy] = -1;
  }

  private staleNeighborsOfColumn(cx: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.columns.get(columnKey(cx + dx, cz + dz));
        if (c) c.hidden.fill(-1);
      }
  }

  /** 変わったセクションを渡して、覚えているのを空にする */
  takeDirtySections(): SectionPos[] {
    const out: SectionPos[] = [];
    for (const c of this.dirtySecList) {
      if (this.columns.get(columnKey(c.cx, c.cz)) === c) {
        for (let sy = 0; sy < c.sections.length; sy++) if ((c.secBits & (1 << sy)) !== 0) out.push({ cx: c.cx, sy, cz: c.cz });
      }
      c.secBits = 0;
      c.secListed = false;
    }
    this.dirtySecList.length = 0;
    return out;
  }

  // ------------------------------------------------------------ 数える・ハッシュ

  /** 種類ごとの個数（0 個の種類もふくむ） */
  countBlocks(): Record<BlockId, number> {
    const counts = new Array<number>(BLOCK_TYPES.length).fill(0);
    for (const c of this.columns.values()) {
      for (const s of c.sections) {
        if (s.kind === 'uniform') counts[s.block] += SECTION_VOLUME;
        else {
          const arr = sectionToArray(s);
          for (let i = 0; i < SECTION_VOLUME; i++) counts[arr[i]]++;
        }
      }
    }
    const out = {} as Record<BlockId, number>;
    BLOCK_TYPES.forEach((t, i) => {
      out[t.id] = counts[i];
    });
    return out;
  }

  /** 読みこんだ範囲の全ブロックから作った文字列（FNV-1a。順は y, z, x）。同じ世界なら同じ */
  hash(): string {
    const { x0, z0, x1, z1 } = this.b;
    let h = 0x811c9dc5;
    let n = 0;
    for (let y = 0; y < this.size.y; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const v = this.getIndex(x, y, z);
          h ^= v < 0 ? 0 : v;
          h = Math.imul(h, 0x01000193);
          n++;
        }
      }
    }
    return (h >>> 0).toString(16).padStart(8, '0') + `-${n}`;
  }

  // ------------------------------------------------------------ 描画側への「変わった」

  /** 今の描画が使う 横の列の数（読みこんだ範囲の右端まで。原点が 0 の島向け。VOX-C で辞書に置きかえる） */
  get chunksX(): number {
    return Math.max(0, Math.ceil(this.b.x1 / CHUNK_SIZE));
  }
  get chunksZ(): number {
    return Math.max(0, Math.ceil(this.b.z1 / CHUNK_SIZE));
  }

  chunkIndex(cx: number, cz: number): number {
    return cz * this.chunksX + cx;
  }

  /**
   * (x, z) の列が変わった。チャンクの端なら、となりのチャンクの面も変わる。
   * reach: ふちから何マスまで となりに伝えるか（ブロックの変化は 1。光は面の角が 2 マス先まで読むので 2）
   */
  markDirty(x: number, z: number, reach = 1): void {
    const cx = x >> 4;
    const cz = z >> 4;
    const lx = x & 15;
    const lz = z & 15;
    const dx = lx < reach ? -1 : lx >= CHUNK_SIZE - reach ? 1 : 0;
    const dz = lz < reach ? -1 : lz >= CHUNK_SIZE - reach ? 1 : 0;
    this.dirtyWhole(cx, cz);
    if (dx !== 0) this.dirtyWhole(cx + dx, cz);
    if (dz !== 0) this.dirtyWhole(cx, cz + dz);
    if (dx !== 0 && dz !== 0 && reach > 1) this.dirtyWhole(cx + dx, cz + dz);
  }

  private dirtyWhole(cx: number, cz: number): void {
    const c = this.columns.get(columnKey(cx, cz));
    if (!c) return;
    this.markCol(c);
    this.markAllSecs(c);
  }

  /** 変わったチャンクの番号（chunkIndex）を渡して、覚えているのを空にする */
  takeDirtyChunks(): number[] {
    const out: number[] = [];
    for (const c of this.dirtyColList) {
      if (this.columns.get(columnKey(c.cx, c.cz)) === c) out.push(this.chunkIndex(c.cx, c.cz));
      c.colDirty = false;
    }
    this.dirtyColList.length = 0;
    return out;
  }

  hasDirtyChunks(): boolean {
    return this.dirtyColList.length > 0;
  }
}

/** 今までの名前（テスト・つなぎ込みが使っている） */
export { ChunkedVoxelWorld as ArrayVoxelWorld };

function sectionAllSealed(s: SectionData): boolean {
  if (s.kind === 'uniform') return SEALS[s.block] === 1;
  if (s.kind === 'palette') {
    for (const b of s.palette) if (SEALS[b] === 0) return false;
    return true;
  }
  const d = s.data;
  for (let i = 0; i < SECTION_VOLUME; i++) if (SEALS[d[i]] === 0) return false;
  return true;
}

/** セクション s の (dx,dy,dz) 向きの外側の面（その向きの端の 16×16）が全部ふさがっているか */
function faceSealed(s: SectionData, dx: number, dy: number, dz: number): boolean {
  if (s.kind === 'uniform') return SEALS[s.block] === 1;
  if (s.kind === 'palette') {
    let all = true;
    for (const b of s.palette) if (SEALS[b] === 0) all = false;
    if (all) return true;
  }
  const fixed = (d: number) => (d > 0 ? 15 : 0);
  for (let a = 0; a < 16; a++) {
    for (let c = 0; c < 16; c++) {
      let lx: number;
      let ly: number;
      let lz: number;
      if (dx !== 0) [lx, ly, lz] = [fixed(dx), a, c];
      else if (dy !== 0) [lx, ly, lz] = [a, fixed(dy), c];
      else [lx, ly, lz] = [a, c, fixed(dz)];
      if (SEALS[sectionGet(s, localIndex(lx, ly, lz))] === 0) return false;
    }
  }
  return true;
}

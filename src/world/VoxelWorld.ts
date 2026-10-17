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
import { scanColumn, type ColumnInfo } from './micro/worldColumns';
import { BLOCK_TYPES, blockIdFromIndex, blockIndexOf, isOpaqueIndex, isSolidIndex } from './blocks/blockTypes';
import { OPACITY } from './light/opacity';
import { SECTION_VOLUME, compactSection, sectionGet, sectionSet, sectionToArray, uniformSection } from './sections';

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
    this.exp = new Array<Uint8Array | null>(sections.length).fill(null);
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
  /** secBits のうち、ブロックを変えたことでついた分（光だけの変化とは分けて、描画が「プレイヤーが変えた所」を先に作れるように） */
  blockBits = 0;
  /** 保存のための印（World が持つ一覧に入っているか） */
  saveDirty = false;
  /** uniform なら その番号、palette なら -2、full なら -1 */
  readonly uni: Int16Array;
  /** 「空」の高さ: 16×16 の各マスの topY（最初に必要になった時の値。ほっても かえない）。exposure 用 */
  sky: Int16Array | null = null;
  /** sky の最大 */
  skyMax = -1;
  /** 空にとどいている地下の空気のマス（セクションごとの 4096 ビット。無ければ null） */
  readonly exp: (Uint8Array | null)[];

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

export interface ChangeBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

export interface ColumnEvent {
  cx: number;
  cz: number;
  /** true = 読みこんだ、false = 捨てた */
  loaded: boolean;
}

/** 変えた箱を ためておく数の上限（これを超えたら 最後の箱にまとめる） */
const CHANGE_BOX_CAP = 64;

/** 変えたマスの記録に入れる数の上限（これを超えたら 保険ではなく ふつうの保存にたよる） */
const CHANGE_LOG_CAP = 40000;

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
  /**
   * この高さより下は、読みこんでいない列の横を「ふさがっている」とみなす（世界のふちの地下。生成がつなぐ）。0 = みなさない。
   * 海のふちの 海ゆかより下は 外から見えないので、ふちの列の地下も「見えない」にできる。
   */
  edgeClosedBelow = 0;
  /** 空・読みこんでいない所・ほった穴に つながった「地下の空気」を数えてあるか（false = 作りなおし待ち。数えたマスは ちぢまない。Column.exp） */
  private exposureBuilt = false;
  /** ほった穴（空気などに変えたマス）の記録 [x,y,z]…。exposure を作りなおすとき、空にとどいている しるしとして使う */
  private dugCells: number[] = [];
  /** faceHasSurface の作業用 */
  private readonly surfaceInfo: ColumnInfo = { ty: -1, kind: 0, reach: 0, rockOk: false };
  /** 小ブロック地形の「森の重み」（0〜1）を ブロックの列 (bx, bz) で返す窓口。生成がつなぐ。なければ 草原（0） */
  microForest: ((bx: number, bz: number) => number) | null = null;
  private lastCx = NaN;
  private lastCz = NaN;
  private lastCol: Column | null = null;
  private b: LoadedBounds = { x0: 0, z0: 0, x1: 0, z1: 0 };
  /** 光の計算し直し用: 前回の takeChangeBox() からあとに変わったマスをふくむ箱（無ければ null） */
  /** 保存用: さわった列（描画の dirty とは別）。保存が takeSaveDirty() で受け取る */
  private readonly saveDirtyList: Column[] = [];
  /** 保存用: 前の保存から変えたマスの記録 [x,y,z,番号]…（pagehide の保険。VOX-plan §7） */
  private changeLog: number[] = [];
  /** これまでに捨てた記録の数（保存が「ここまで書けた」を数で言えるように） */
  private changeLogBase = 0;
  private changeLogFull = false;
  private changeBoxes: ChangeBox[] = [];
  /** 光のための「列を読みこんだ / 捨てた」記録。takeColumnEvents() を一度呼んでから ためはじめる */
  private columnEvents: ColumnEvent[] | null = null;

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
    this.invalidateExposure();
    this.forgetLast();
    this.recomputeBounds();
    this.staleNeighborsOfColumn(cx, cz);
    // 光: まわりの列の光を作り直す。この列の光は捨てる（VOX-A のレビュー台帳「中」: 契約は takeColumnEvents）
    this.columnEvents?.push({ cx, cz, loaded: false });
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
    this.invalidateExposure();
    this.forgetLast();
    this.markCol(col);
    this.markAllSecs(col);
    this.recomputeBounds();
    this.staleNeighborsOfColumn(col.cx, col.cz);
    this.columnEvents?.push({ cx: col.cx, cz: col.cz, loaded: true });
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

  /**
   * その列の いちばん上の「空気でない」ブロックの y（全部空気・読みこんでいない・x,z が整数でないときは -1）。
   * 空気だけのセクションは 飛ばすので、高さ 352 でも 速い（地面をさがす所は ここから下へ見る）。
   */
  topY(x: number, z: number): number {
    if (x !== (x | 0) || z !== (z | 0)) return -1;
    const col = this.colAt(x >> 4, z >> 4);
    if (col === null) return -1;
    const lx = x & 15;
    const lz = z & 15;
    const base = (lz << 4) | lx;
    for (let sy = col.sections.length - 1; sy >= 0; sy--) {
      const u = col.uni[sy];
      if (u === 0) continue; // 全部空気
      if (u > 0) return Math.min(sy * SECTION_SIZE + 15, this.size.y - 1);
      const d = col.fast[sy];
      if (d !== null) {
        for (let ly = 15; ly >= 0; ly--) if (d[(ly << 8) | base] !== 0) return sy * SECTION_SIZE + ly;
      } else {
        const sec = col.sections[sy];
        for (let ly = 15; ly >= 0; ly--) if (sectionGet(sec, (ly << 8) | base) !== 0) return sy * SECTION_SIZE + ly;
      }
    }
    return -1;
  }

  /**
   * `want(番号)` が true の ブロックの場所を ぜんぶ `found` に渡す。
   * セクションごとに 「ほしい番号が 入っているか」を先に見て、入っていないセクション（地下の いし・空）は 飛ばす。
   * 高さ 352 でも 速い（農業・スプリンクラーの 見直しが 全マスを 見ないため）。
   */
  scanBlocks(want: (index: number) => boolean, found: (x: number, y: number, z: number, index: number) => void): void {
    for (const col of this.columns.values()) {
      const ox = col.cx * CHUNK_SIZE;
      const oz = col.cz * CHUNK_SIZE;
      for (let sy = 0; sy < col.sections.length; sy++) {
        const sec = col.sections[sy];
        if (sec.kind === 'uniform') {
          if (!want(sec.block)) continue;
        } else if (sec.kind === 'palette') {
          let any = false;
          for (let k = 0; k < sec.palette.length; k++) if (want(sec.palette[k])) any = true;
          if (!any) continue;
        }
        const d = sectionToArray(sec);
        for (let i = 0; i < 4096; i++) {
          const b = d[i];
          if (b !== 0 && want(b)) found(ox + (i & 15), sy * SECTION_SIZE + (i >> 8), oz + ((i >> 4) & 15), b);
        }
      }
    }
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
      this.noteSave(col, x, y, z, b);
      this.noteDirty(col, x, y, z);
      if (SEALS[b] === 0) this.noteDug(col, x, y, z);
      this.noteChange(x, y, z, x, y, z);
      return true;
    }
    if (!this.put(col, x, y, z, b)) return true;
    this.noteSave(col, x, y, z, b);
    this.noteDirty(col, x, y, z);
    if (SEALS[b] === 0) this.noteDug(col, x, y, z);
    this.noteChange(x, y, z, x, y, z);
    return true;
  }

  /** 保存用: 列を「さわった」に入れ、変えたマスを記録に足す */
  private noteSave(col: Column, x: number, y: number, z: number, b: number): void {
    if (!col.saveDirty) {
      col.saveDirty = true;
      this.saveDirtyList.push(col);
    }
    const log = this.changeLog;
    if (log.length < CHANGE_LOG_CAP * 4) log.push(x, y, z, b);
    else this.changeLogFull = true;
  }

  /** さわった列の数 */
  saveDirtyCount(): number {
    let n = 0;
    for (const c of this.saveDirtyList) if (this.columns.get(columnKey(c.cx, c.cz)) === c) n++;
    return n;
  }

  /** さわった列を渡して、覚えているのを空にする（書けなかったら requeueSaveDirty で戻す） */
  takeSaveDirty(): ChunkColumn[] {
    const out: ChunkColumn[] = [];
    for (const c of this.saveDirtyList) {
      if (this.columns.get(columnKey(c.cx, c.cz)) === c) out.push(c);
      c.saveDirty = false;
    }
    this.saveDirtyList.length = 0;
    return out;
  }

  /** 書けなかった列を「さわった」に戻す */
  requeueSaveDirty(cols: readonly { cx: number; cz: number }[]): void {
    for (const p of cols) {
      const c = this.columns.get(columnKey(p.cx, p.cz));
      if (c && !c.saveDirty) {
        c.saveDirty = true;
        this.saveDirtyList.push(c);
      }
    }
  }

  /** 記録の「いま」の位置（捨てた分もふくめた通し番号）/ 一覧 [x,y,z,番号]…（先頭は 通し番号 changeLogStart()）/ 通し番号 end の前を捨てる / 入りきらなかったか */
  changeLogEnd(): number {
    return this.changeLogBase + (this.changeLog.length >> 2);
  }
  changeLogStart(): number {
    return this.changeLogBase;
  }
  changeLogCount(): number {
    return this.changeLog.length >> 2;
  }
  changeLogCells(): readonly number[] {
    return this.changeLog;
  }
  dropChangeLogTo(end: number): void {
    const n = Math.min(end - this.changeLogBase, this.changeLog.length >> 2);
    if (n <= 0) return;
    if (n * 4 >= this.changeLog.length) this.changeLog = [];
    else this.changeLog.splice(0, n * 4);
    this.changeLogBase += n;
    this.changeLogFull = false;
  }
  changeLogOverflowed(): boolean {
    return this.changeLogFull;
  }

  /** ぜんぶの列を「さわった」にする（保存を消したあと、今の世界を丸ごと書きなおすため） */
  markAllSaveDirty(): void {
    this.requeueSaveDirty(this.loadedColumns());
  }

  /** 保存の印をぜんぶ捨てる（島を作った直後・保存を読んだ直後） */
  resetSaveTracking(): void {
    this.takeSaveDirty();
    this.changeLogBase += this.changeLog.length >> 2;
    this.changeLog = [];
    this.changeLogFull = false;
  }

  /** 変えたマスの dirty とステイルの印 */
  private noteDirty(col: Column, x: number, y: number, z: number): void {
    const sy = y >> 4;
    this.markCol(col);
    this.markSec(col, sy, true);
    const lx = x & 15;
    const lz = z & 15;
    const ly = y & 15;
    if (lx <= 1 || lx >= 14 || lz <= 1 || lz >= 14 || ly <= 1 || ly >= 14) this.markEdgeNeighbors(col, sy, lx, ly, lz);
    if (this.hiddenUsed) this.staleAround(col.cx, sy, col.cz);
  }

  private markCol(c: Column): void {
    if (!c.colDirty) {
      c.colDirty = true;
      this.dirtyColList.push(c);
    }
  }

  private markSec(c: Column, sy: number, byBlock = false): void {
    c.secBits |= 1 << sy;
    if (byBlock) c.blockBits |= 1 << sy;
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

  /**
   * 列のふち・セクションのふちから 2 ブロック以内のマスが変わった: となりの列・セクションも作り直す。
   * 小ブロックの地形（prepareTerrain）は となりを 2 ブロック先まで読むので、0・15 だけでは足りない。
   */
  private markEdgeNeighbors(col: Column, sy: number, lx: number, ly: number, lz: number): void {
    const nx = lx <= 1 ? -1 : lx >= 14 ? 1 : 0;
    const nz = lz <= 1 ? -1 : lz >= 14 ? 1 : 0;
    if (nx !== 0) this.markNeighbor(col.cx + nx, sy, col.cz, true);
    if (nz !== 0) this.markNeighbor(col.cx, sy, col.cz + nz, true);
    if (ly <= 1 && sy > 0) this.markSec(col, sy - 1, true);
    if (ly >= 14 && sy + 1 < this.nSections) this.markSec(col, sy + 1, true);
  }

  private markNeighbor(cx: number, sy: number, cz: number, col: boolean): void {
    const c = this.columns.get(columnKey(cx, cz));
    if (!c) return;
    if (col) this.markCol(c);
    this.markSec(c, sy, true);
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
          this.noteSave(col, x, y, z, b);
          this.noteDirty(col, x, y, z);
          if (SEALS[b] === 0) this.noteDug(col, x, y, z);
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
    const bs = this.changeBoxes;
    const n = bs.length;
    if (n > 0) {
      const b = bs[n - 1];
      const near = x0 <= b.x1 + 2 && x1 >= b.x0 - 2 && y0 <= b.y1 + 2 && y1 >= b.y0 - 2 && z0 <= b.z1 + 2 && z1 >= b.z0 - 2;
      if (near || n >= CHANGE_BOX_CAP) {
        if (x0 < b.x0) b.x0 = x0;
        if (y0 < b.y0) b.y0 = y0;
        if (z0 < b.z0) b.z0 = z0;
        if (x1 > b.x1) b.x1 = x1;
        if (y1 > b.y1) b.y1 = y1;
        if (z1 > b.z1) b.z1 = z1;
        return;
      }
    }
    bs.push({ x0, y0, z0, x1, y1, z1 });
  }

  /** 変わったマスの箱たちを渡して、覚えているのを空にする（光の計算し直し用。近い変化は 1 つの箱にまとまる） */
  takeChangeBoxes(): ChangeBox[] {
    const out = this.changeBoxes;
    this.changeBoxes = [];
    return out;
  }

  /** 変わったマスをふくむ 1 つの箱（takeChangeBoxes を合わせたもの）を渡して、空にする */
  takeChangeBox(): ChangeBox | null {
    const bs = this.takeChangeBoxes();
    if (bs.length === 0) return null;
    const u = { ...bs[0] };
    for (const b of bs) {
      u.x0 = Math.min(u.x0, b.x0);
      u.y0 = Math.min(u.y0, b.y0);
      u.z0 = Math.min(u.z0, b.z0);
      u.x1 = Math.max(u.x1, b.x1);
      u.y1 = Math.max(u.y1, b.y1);
      u.z1 = Math.max(u.z1, b.z1);
    }
    return u;
  }

  /**
   * 列を読みこんだ / 捨てた記録を渡して、空にする。最初に呼んだときから ためはじめる（光が呼ぶ）。
   * 契約: 列の出し入れで、まわり（3×3 の列）の光を作り直すのは 光の側の しごと。世界は この記録を残すだけ。
   */
  takeColumnEvents(): ColumnEvent[] {
    const out = this.columnEvents ?? [];
    this.columnEvents = [];
    return out;
  }

  /**
   * 原点から (sx, size.y, sz) の四角の全ブロック番号を、平らな番号 (y * sz + z) * sx + x で out に写す
   * （テスト用。保存は VOX-F から さわった列だけを書くので、これは使わない。読みこんでいない所は書きかえない）
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
   * ただし、となりの接する面が 地面の表面ブロック（小ブロック地形で描く。高さ S が上のへりより下までへこむ）なら
   * 「ふさがっている」とは みなさない（#142: 段差の下の固いブロックの面が、S と上のへりの間に見える）。
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
    if (!this.exposureBuilt) this.buildExposure();
    if (!this.sectionClosed(col, sy)) return false;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const ny = sy + dy;
      if (ny < 0) continue; // 世界の底
      const n = this.columns.get(columnKey(col.cx + dx, col.cz + dz));
      if (n === undefined && dy === 0 && sy * SECTION_SIZE + SECTION_SIZE - 1 < this.edgeClosedBelow) continue;
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
          scanColumn(this, x0 + lx, z0 + lz, info);
          if (info.ty === y) return true;
        }
      }
      return false;
    }
    for (let c = 0; c < CHUNK_SIZE; c++) {
      const wx = x0 + (fx !== 0 ? (fx > 0 ? CHUNK_SIZE - 1 : 0) : c);
      const wz = z0 + (fz !== 0 ? (fz > 0 ? CHUNK_SIZE - 1 : 0) : c);
      scanColumn(this, wx, wz, info);
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
        const t = this.topY(ox + lx, oz + lz);
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
    if (y >= this.size.y) return true;
    if (y < 0) return false;
    const c = this.columns.get(columnKey(x >> 4, z >> 4));
    if (c === undefined) return y >= this.edgeClosedBelow;
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

  /** 空にとどいている地下の空気を すべて数えなおす（読みこみ・捨てたあと、はじめて印を読むとき） */
  private buildExposure(): void {
    this.exposureBuilt = true;
    const q: number[] = [];
    for (const col of this.columns.values()) {
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
    }
    const dug = this.dugCells;
    for (let i = 0; i < dug.length; i += 3) {
      const x = dug[i];
      const y = dug[i + 1];
      const z = dug[i + 2];
      if (this.getIndex(x, y, z) !== 0) continue;
      const col = this.colAt(x >> 4, z >> 4)!;
      if (this.expAdd(col, y >> 4, ((y & 15) << 8) | ((z & 15) << 4) | (x & 15))) q.push(x, y, z);
    }
    this.spreadExposure(q, null);
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
        if (this.getIndex(nx, ny, nz) !== 0) continue;
        const col = this.colAt(nx >> 4, nz >> 4)!;
        if (ny > this.skyOf(col)[((nz & 15) << 4) | (nx & 15)]) continue; // 空
        if (!this.expAdd(col, ny >> 4, ((ny & 15) << 8) | ((nz & 15) << 4) | (nx & 15))) continue;
        q.push(nx, ny, nz);
        added?.push(nx, ny, nz);
      }
    }
  }

  /** ほった（空気などに変えた）マス: 空にとどいていることにして、つながった地下の空気も 見えるようにする */
  private noteDug(col: Column, x: number, y: number, z: number): void {
    if (y > this.skyOf(col)[((z & 15) << 4) | (x & 15)]) return; // 空の中
    if (this.dugCells.length < DUG_CAP * 3) this.dugCells.push(x, y, z);
    if (!this.exposureBuilt) return;
    if (!this.expAdd(col, y >> 4, ((y & 15) << 8) | ((z & 15) << 4) | (x & 15))) return;
    const added: number[] = [];
    this.spreadExposure([x, y, z], added);
    if (added.length === 0) return;
    // 遠くのセクションまで 空にとどいた: そのセクションと、となりを 作りなおす
    const secs = new Set<number>();
    for (let i = 0; i < added.length; i += 3) secs.add(((added[i] >> 4) + 4096) * 8192 * 32 + ((added[i + 2] >> 4) + 4096) * 32 + (added[i + 1] >> 4));
    for (const id of secs) {
      const sy = id % 32;
      const cz = (Math.floor(id / 32) % 8192) - 4096;
      const cx = Math.floor(id / (8192 * 32)) - 4096;
      this.staleAround(cx, sy, cz);
      this.markSectionDirty(cx, sy, cz);
      for (const [dx, dy, dz] of NEIGHBORS) this.markSectionDirty(cx + dx, sy + dy, cz + dz);
    }
  }

  /** 列の読みこみ・捨て: 空にとどいているかの答えが かわる。つぎに印を読むとき作りなおす */
  private invalidateExposure(): void {
    if (!this.exposureBuilt) return;
    this.exposureBuilt = false;
    for (const c of this.columns.values()) {
      c.hidden.fill(-1);
      c.exp.fill(null);
    }
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

  /** まだ光が受けとっていない「変わった」の数（変えたマスの箱・列の出入り）。setBlock のすぐあとは 0 でない */
  uncollectedLightChanges(): number {
    return this.changeBoxes.length + (this.columnEvents?.length ?? 0);
  }

  /** まだメッシュ側が受けとっていない「変わった」セクションを持つ列の数 */
  uncollectedMeshChanges(): number {
    return this.dirtySecList.length;
  }

  /** 変わったセクションを渡して、覚えているのを空にする */
  takeDirtySections(): SectionPos[] {
    return this.takeDirtySectionsEx().map(({ cx, sy, cz }) => ({ cx, sy, cz }));
  }

  /** takeDirtySections に、「ブロックを変えたことで変わった」か（false = 光だけ）をつけたもの */
  takeDirtySectionsEx(): (SectionPos & { block: boolean })[] {
    const out: (SectionPos & { block: boolean })[] = [];
    for (const c of this.dirtySecList) {
      if (this.columns.get(columnKey(c.cx, c.cz)) === c) {
        for (let sy = 0; sy < c.sections.length; sy++) {
          if ((c.secBits & (1 << sy)) !== 0) out.push({ cx: c.cx, sy, cz: c.cz, block: (c.blockBits & (1 << sy)) !== 0 });
        }
      }
      c.secBits = 0;
      c.blockBits = 0;
      c.secListed = false;
    }
    this.dirtySecList.length = 0;
    return out;
  }

  /** 光が変わった: そのセクションだけ メッシュの作り直しに入れる（列の dirty にも入る）。読みこんでいない所は何もしない */
  markSectionDirty(cx: number, sy: number, cz: number): void {
    const c = this.columns.get(columnKey(cx, cz));
    if (!c || sy < 0 || sy >= c.sections.length) return;
    this.markCol(c);
    this.markSec(c, sy);
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

  /** 1 列だけのハッシュ（FNV-1a。順は y, z, x）。読みこんでいなければ 'none' */
  hashColumn(cx: number, cz: number): string {
    if (this.colAt(cx, cz) === null) return 'none';
    let h = 0x811c9dc5;
    for (let y = 0; y < this.size.y; y++)
      for (let z = cz * 16; z < cz * 16 + 16; z++)
        for (let x = cx * 16; x < cx * 16 + 16; x++) {
          h ^= this.getIndex(x, y, z);
          h = Math.imul(h, 0x01000193);
        }
    return (h >>> 0).toString(16).padStart(8, '0');
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

const DUG_CAP = 20000;

import {
  CHUNK_SIZE,
  SECTION_SIZE,
  WORLD_HEIGHT,
  WORLD_LIMIT,
  WORLD_SIZE,
  type BlockId,
  type ChunkColumn,
  type LoadedBounds,
  type SectionData,
  type VoxelWorld,
} from '../contracts';
import { blockIdFromIndex, blockIndexOf, isSolidIndex } from './blocks/blockTypes';
import { compactSection, sectionGet, sectionSet, sectionToArray, uniformSection } from './sections';
import { cellInWall } from './wall';
import { Column, SEALS, columnKey } from './voxelColumn';
import { countBlocks, fillFlat, hashColumn, hashWorld } from './voxelStats';
import { WorldExposure } from './voxelExposure';
import type { ChangeBox, ColumnEvent, SectionPos } from './voxelTypes';

export { CHUNK_SIZE, SECTION_SIZE, WORLD_SIZE };
export type { LoadedBounds };
export type { ChangeBox, ColumnEvent, SectionPos };
export { columnKey };

/** LIVE-2: さく（当たりの 高さ 2 の もと） */
const FENCE_INDEX = blockIndexOf('toriya_fence');

/** 変えた箱を ためておく数の上限（これを超えたら 最後の箱にまとめる） */
const CHANGE_BOX_CAP = 64;

/** 変えたマスの記録に入れる数の上限（これを超えたら 保険ではなく ふつうの保存にたよる） */
const CHANGE_LOG_CAP = 40000;

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
  /**
   * この高さより下は、読みこんでいない列の横を「ふさがっている」とみなす（世界のふちの地下。生成がつなぐ）。0 = みなさない。
   * 海のふちの 海ゆかより下は 外から見えないので、ふちの列の地下も「見えない」にできる。
   */
  edgeClosedBelow = 0;
  /** 「見えない」印と 地下の空気の数えなおし（voxelExposure.ts） */
  private readonly exposure = new WorldExposure(this.columns, this);
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
    this.exposure.invalidateExposure(cx, cz);
    this.forgetLast();
    this.boundsAfterRemove(cx, cz);
    this.exposure.staleNeighborsOfColumn(cx, cz);
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
    this.exposure.invalidateExposure(col.cx, col.cz);
    this.forgetLast();
    this.markCol(col);
    this.markAllSecs(col);
    this.boundsAfterAdd(col.cx, col.cz);
    this.exposure.staleNeighborsOfColumn(col.cx, col.cz);
    this.columnEvents?.push({ cx: col.cx, cz: col.cz, loaded: true });
  }

  /** 列の番号のはし（loadedBounds の元。列の出入りで 少しずつ直す） */
  private bc = { x0: 0, z0: 0, x1: -1, z1: -1 };

  private boundsAfterAdd(cx: number, cz: number): void {
    const c = this.bc;
    if (this.columns.size === 1) {
      c.x0 = c.x1 = cx;
      c.z0 = c.z1 = cz;
    } else {
      if (cx < c.x0) c.x0 = cx;
      if (cz < c.z0) c.z0 = cz;
      if (cx > c.x1) c.x1 = cx;
      if (cz > c.z1) c.z1 = cz;
    }
    this.syncBounds();
  }

  private boundsAfterRemove(cx: number, cz: number): void {
    const c = this.bc;
    if (this.columns.size === 0) {
      c.x0 = c.z0 = 0;
      c.x1 = c.z1 = -1;
    } else if (cx === c.x0 || cx === c.x1 || cz === c.z0 || cz === c.z1) {
      let x0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let z1 = -Infinity;
      for (const k of this.columns.values()) {
        if (k.cx < x0) x0 = k.cx;
        if (k.cz < z0) z0 = k.cz;
        if (k.cx > x1) x1 = k.cx;
        if (k.cz > z1) z1 = k.cz;
      }
      c.x0 = x0;
      c.z0 = z0;
      c.x1 = x1;
      c.z1 = z1;
    }
    this.syncBounds();
  }

  private syncBounds(): void {
    const c = this.bc;
    this.b =
      this.columns.size === 0
        ? { x0: 0, z0: 0, x1: 0, z1: 0 }
        : { x0: c.x0 * CHUNK_SIZE, z0: c.z0 * CHUNK_SIZE, x1: (c.x1 + 1) * CHUNK_SIZE, z1: (c.z1 + 1) * CHUNK_SIZE };
  }

  /** 列（なければ null）。直前の列を覚えている。ExposureHost の窓口 */
  colAt(cx: number, cz: number): Column | null {
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
    if (b < 0 || x !== (x | 0) || y !== (y | 0) || z !== (z | 0) || y < 0 || y >= this.size.y || !cellInWall(x, z)) return false; // 壁の外は ほれない・おけない（W4）
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
      if (SEALS[b] === 0) this.exposure.noteDug(col, x, y, z);
      this.noteChange(x, y, z, x, y, z);
      return true;
    }
    if (!this.put(col, x, y, z, b)) return true;
    this.noteSave(col, x, y, z, b);
    this.noteDirty(col, x, y, z);
    if (SEALS[b] === 0) this.exposure.noteDug(col, x, y, z);
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

  /** その列は さわった（保存がまだ書いていない）か */
  isSaveDirty(cx: number, cz: number): boolean {
    return this.columns.get(columnKey(cx, cz))?.saveDirty === true;
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
    this.exposure.noteBlockChanged(col.cx, sy, col.cz, ly);
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
    const ny = ly <= 1 ? -1 : ly >= 14 ? 1 : 0;
    // ななめ（x と z、x と y、z と y、3 つとも）も入れる: AO の角や 段差の下のすき間が 古いまま残らないように
    for (const ax of nx !== 0 ? [0, nx] : [0]) {
      for (const az of nz !== 0 ? [0, nz] : [0]) {
        for (const ay of ny !== 0 ? [0, ny] : [0]) {
          if (ax === 0 && az === 0 && ay === 0) continue;
          const nsy = sy + ay;
          if (nsy < 0 || nsy >= this.nSections) continue;
          if (ax !== 0 || az !== 0) this.markNeighbor(col.cx + ax, nsy, col.cz + az, true);
          else this.markSec(col, nsy, true);
        }
      }
    }
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

  /** LIVE-2: プレイヤー用。さく（とりごや）の すぐ上の 1 マスも 固い（当たりの 高さ 2） */
  isSolidForPlayer(x: number, y: number, z: number): boolean {
    const i = this.getIndex(x, y, z);
    if (i >= 0 && isSolidIndex(i)) return true;
    return i >= 0 && y > 0 && this.getIndex(x, y - 1, z) === FENCE_INDEX;
  }

  /** 2 つの角をふくむ箱の中をすべて id にする。変えたブロックの数を返す（読みこんでいない所・高さの外は変えない） */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): number {
    const b = blockIndexOf(id);
    if (b < 0) return 0;
    const xa = Math.max(-WORLD_LIMIT, Math.ceil(Math.min(x0, x1)));
    const ya = Math.max(0, Math.ceil(Math.min(y0, y1)));
    const za = Math.max(-WORLD_LIMIT, Math.ceil(Math.min(z0, z1)));
    const xb = Math.min(WORLD_LIMIT - 1, Math.floor(Math.max(x0, x1)));
    const yb = Math.min(this.size.y - 1, Math.floor(Math.max(y0, y1)));
    const zb = Math.min(WORLD_LIMIT - 1, Math.floor(Math.max(z0, z1)));
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
          if (SEALS[b] === 0) this.exposure.noteDug(col, x, y, z);
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
    fillFlat(this.columns, this.size.y, out, sx, sz);
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
    return this.exposure.isSectionHidden(cx, sy, cz);
  }

  /** 数えなおし待ちの列の数（テスト用） */
  exposurePending(): number {
    return this.exposure.exposurePending();
  }

  /** たまった数えなおしを いま片づける（毎コマ renderer から。最初にほる・読む人が 一度に まとめて 作り直しを起こさないように） */
  settleExposure(): void {
    this.exposure.settleExposure();
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
    return countBlocks(this.columns);
  }

  /** 読みこんだ範囲の全ブロックから作った文字列（FNV-1a。順は y, z, x）。同じ世界なら同じ */
  hash(): string {
    return hashWorld(this.columns, this);
  }

  /** 1 列だけのハッシュ（FNV-1a。順は y, z, x）。読みこんでいなければ 'none' */
  hashColumn(cx: number, cz: number): string {
    return hashColumn(this, cx, cz);
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

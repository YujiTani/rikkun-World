import type { ChunkColumn } from '../contracts';
import { NewerFormatError, unpackColumn, type PersistBackend } from './backend';
import { CHUNK_FORMAT_VERSION, decodeSections, encodeSections, padSections } from './chunkCodec';
import { colKey } from '../world/stream/ring';
import type { StreamIO } from '../world/stream/ChunkStream';

/**
 * 列の出どころ・保存先（ChunkStream の StreamIO）。VOX-D D1〜D5。
 * - 一覧（keys）にある列は、いるときに 1 列だけ readChunk で読む。読めない・こわれている → null（stream が 生成して saveDirty にする）。
 * - 保存できないとき（persistent() が false）は、捨てる列を ページの中の入れ物（kept）に縮めて預け、もどったらそこから読む（D5）。
 */
export interface ColumnIODeps {
  db: PersistBackend | null;
  saveId: string;
  nSections: number;
  /** 保存にある列（colKey）。書けた列は noteWritten で足す */
  keys: Set<number>;
  generate: (cx: number, cz: number) => ChunkColumn;
  /** 保存が 使えるか（?nosave=1・IndexedDB なし・読むだけ では false） */
  saveOn: () => boolean;
  /** いま保存を書いている最中か / 書いている列か / 保存を始めてよいか / 保存を始める */
  saving: () => boolean;
  writing: (cx: number, cz: number) => boolean;
  canFlush: () => boolean;
  flush: () => void;
  /** こわれた列・新しすぎる形式の列を 見つけた */
  onCorrupt?: (cx: number, cz: number) => void;
  onNewer?: () => void;
}

export class ColumnIO implements StreamIO {
  /** ページの中の入れ物: colKey → 縮めた列 */
  private readonly kept = new Map<number, Uint8Array>();
  /** 数える用 */
  readCalls = 0;

  constructor(private readonly d: ColumnIODeps) {}

  generate(cx: number, cz: number): ChunkColumn {
    return this.d.generate(cx, cz);
  }

  has(cx: number, cz: number): boolean {
    const k = colKey(cx, cz);
    return this.kept.has(k) || (this.d.db !== null && this.d.keys.has(k));
  }

  read(cx: number, cz: number): ChunkColumn | null | Promise<ChunkColumn | null> {
    const k = colKey(cx, cz);
    const raw = this.kept.get(k);
    if (raw !== undefined) {
      try {
        return { cx, cz, sections: padSections(decodeSections(raw, this.d.nSections, CHUNK_FORMAT_VERSION), this.d.nSections) };
      } catch {
        this.d.onCorrupt?.(cx, cz);
        return null;
      }
    }
    const db = this.d.db;
    if (db === null || !this.d.keys.has(k)) return null;
    this.readCalls++;
    return db.readChunk(this.d.saveId, cx, cz).then(
      async (rec) => {
        if (rec === null) return null;
        try {
          return await unpackColumn(rec, this.d.nSections);
        } catch (e) {
          if (e instanceof NewerFormatError) this.d.onNewer?.();
          else this.d.onCorrupt?.(cx, cz);
          return null;
        }
      },
      () => null,
    );
  }

  persistent(): boolean {
    return this.d.db !== null && this.d.saveOn();
  }

  keep(col: ChunkColumn): void {
    this.kept.set(colKey(col.cx, col.cz), encodeSections(col.sections));
  }

  canFlush(): boolean {
    return this.d.canFlush();
  }
  flush(): void {
    this.d.flush();
  }
  writing(cx: number, cz: number): boolean {
    return this.d.writing(cx, cz);
  }
  saving(): boolean {
    return this.d.saving();
  }

  /** 書けた列を 一覧に足す */
  noteWritten(cols: readonly { cx: number; cz: number }[]): void {
    for (const c of cols) this.d.keys.add(colKey(c.cx, c.cz));
  }

  /** 預かっている列の数（テスト用） */
  keptCount(): number {
    return this.kept.size;
  }
}

import type { ChunkColumn, ChunkStore } from '../contracts';
import { CHUNK_FORMAT_VERSION, decodeSections, deflateRaw, encodeSections, inflateRaw, padSections } from './chunkCodec';

/** 1 列の保存（IndexedDB の `chunks` の値）。data = encodeSections を deflate-raw したもの */
export interface StoredChunk {
  cx: number;
  cz: number;
  v: number;
  gen: number;
  /** セクションの数 */
  h: number;
  data: Uint8Array;
}

/** `meta` の値: 今の JSON の「blocks 以外」 */
export type StoredMeta = Record<string, unknown>;

/** 保存先（IndexedDB 版とメモリ版）。write は 列たちと meta を 1 つのトランザクションで書く（全部か、何もか） */
export interface PersistBackend {
  readAll(saveId: string): Promise<{ meta: StoredMeta | null; chunks: StoredChunk[] }>;
  readChunk(saveId: string, cx: number, cz: number): Promise<StoredChunk | null>;
  write(saveId: string, chunks: readonly StoredChunk[], meta: StoredMeta | null): Promise<void>;
  /** ファイルから読んだとき: そのセーブの中身を ぜんぶ入れかえる */
  replaceAll(saveId: string, chunks: readonly StoredChunk[], meta: StoredMeta | null): Promise<void>;
  clear(saveId: string): Promise<void>;
}

export const DB_NAME = 'rikkun-world';
export const SAVE_ID = 'main';

const copyChunk = (c: StoredChunk): StoredChunk => ({ ...c, data: c.data.slice() });

/** テストや IndexedDB が使えないときの入れ物 */
export class MemoryBackend implements PersistBackend {
  readonly chunks = new Map<string, StoredChunk>();
  readonly metas = new Map<string, StoredMeta>();
  /** true にすると write が失敗する（テスト用） */
  failWrites = false;
  writes = 0;
  private key = (id: string, cx: number, cz: number) => `${id}/${cx}/${cz}`;

  async readAll(id: string) {
    const chunks = [...this.chunks.entries()].filter(([k]) => k.startsWith(`${id}/`)).map(([, c]) => copyChunk(c));
    const m = this.metas.get(id);
    return { meta: m ? (structuredClone(m) as StoredMeta) : null, chunks };
  }
  async readChunk(id: string, cx: number, cz: number) {
    const c = this.chunks.get(this.key(id, cx, cz));
    return c ? copyChunk(c) : null;
  }
  async write(id: string, chunks: readonly StoredChunk[], meta: StoredMeta | null) {
    if (this.failWrites) throw new Error('write failed');
    this.writes++;
    for (const c of chunks) this.chunks.set(this.key(id, c.cx, c.cz), copyChunk(c));
    if (meta) this.metas.set(id, structuredClone(meta) as StoredMeta);
  }
  async replaceAll(id: string, chunks: readonly StoredChunk[], meta: StoredMeta | null) {
    await this.clear(id);
    await this.write(id, chunks, meta);
  }
  async clear(id: string) {
    for (const k of [...this.chunks.keys()]) if (k.startsWith(`${id}/`)) this.chunks.delete(k);
    this.metas.delete(id);
  }
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, ng) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error ?? new Error('IDB request failed'));
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((ok, ng) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ng(tx.error ?? new Error('IDB transaction failed'));
    tx.onabort = () => ng(tx.error ?? new Error('IDB transaction aborted'));
  });

/** IndexedDB 版。DB `rikkun-world`（版 1）、ストア `chunks`（キー [saveId,cx,cz]）と `meta`（キー saveId） */
export class IdbBackend implements PersistBackend {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<IdbBackend> {
    const r = factory.open(name, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    return new IdbBackend(await req(r));
  }

  close(): void {
    this.db.close();
  }

  private range(id: string): IDBKeyRange {
    return IDBKeyRange.bound([id, -Infinity, -Infinity], [id, Infinity, Infinity]);
  }

  async readAll(id: string) {
    const tx = this.db.transaction(['chunks', 'meta'], 'readonly');
    const cs = tx.objectStore('chunks');
    const [keys, values, meta] = await Promise.all([req(cs.getAllKeys(this.range(id))), req(cs.getAll(this.range(id))), req(tx.objectStore('meta').get(id))]);
    const chunks: StoredChunk[] = [];
    keys.forEach((k, i) => {
      const v = values[i] as Partial<StoredChunk> | null;
      const key = k as unknown as [string, number, number];
      if (v && typeof v === 'object') chunks.push({ ...(v as StoredChunk), cx: key[1], cz: key[2] });
    });
    return { meta: (meta ?? null) as StoredMeta | null, chunks };
  }

  async readChunk(id: string, cx: number, cz: number) {
    const v = (await req(this.db.transaction('chunks', 'readonly').objectStore('chunks').get([id, cx, cz]))) as StoredChunk | undefined;
    return v ? { ...v, cx, cz } : null;
  }

  async write(id: string, chunks: readonly StoredChunk[], meta: StoredMeta | null) {
    const tx = this.db.transaction(['chunks', 'meta'], 'readwrite');
    const cs = tx.objectStore('chunks');
    for (const c of chunks) cs.put({ v: c.v, gen: c.gen, h: c.h, data: c.data }, [id, c.cx, c.cz]);
    if (meta) tx.objectStore('meta').put(meta, id);
    await done(tx);
  }

  async replaceAll(id: string, chunks: readonly StoredChunk[], meta: StoredMeta | null) {
    const tx = this.db.transaction(['chunks', 'meta'], 'readwrite');
    const cs = tx.objectStore('chunks');
    cs.delete(this.range(id));
    tx.objectStore('meta').delete(id);
    for (const c of chunks) cs.put({ v: c.v, gen: c.gen, h: c.h, data: c.data }, [id, c.cx, c.cz]);
    if (meta) tx.objectStore('meta').put(meta, id);
    await done(tx);
  }

  async clear(id: string) {
    const tx = this.db.transaction(['chunks', 'meta'], 'readwrite');
    tx.objectStore('chunks').delete(this.range(id));
    tx.objectStore('meta').delete(id);
    await done(tx);
  }
}

/** IndexedDB が開けなければ null（遊びは続く。保存はしない） */
export async function openIdb(): Promise<IdbBackend | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    return await IdbBackend.open();
  } catch {
    return null;
  }
}

/** 縮めた record にする（縮めるのは非同期） */
export async function packColumn(cx: number, cz: number, raw: Uint8Array, gen: number, h: number): Promise<StoredChunk> {
  return { cx, cz, v: CHUNK_FORMAT_VERSION, gen, h, data: await deflateRaw(raw) };
}

/** record を列にする。版が新しすぎる・こわれている → Error。高さが低い保存は上を空気で足す */
export async function unpackColumn(rec: StoredChunk, nSections: number): Promise<ChunkColumn> {
  if (!Number.isInteger(rec.cx) || !Number.isInteger(rec.cz)) throw new Error('列の場所がおかしい');
  if (rec.v !== CHUNK_FORMAT_VERSION) throw new Error(`形式の版 ${String(rec.v)} は読めない`);
  if (!Number.isInteger(rec.h) || rec.h < 1 || rec.h > nSections) throw new Error('高さがおかしい');
  if (!(rec.data instanceof Uint8Array)) throw new Error('data がおかしい');
  const raw = await inflateRaw(rec.data);
  return { cx: rec.cx, cz: rec.cz, sections: padSections(decodeSections(raw, rec.h), nSections) };
}

/** contracts.ts の ChunkStore（1 列ずつ読み書き）。nSections = 世界の セクションの数 */
export function createChunkStore(backend: PersistBackend, saveId: string, nSections: number, gen: number): ChunkStore {
  return {
    async load(cx, cz) {
      const rec = await backend.readChunk(saveId, cx, cz);
      if (!rec) return null;
      try {
        return await unpackColumn(rec, nSections);
      } catch {
        return null; // こわれた列は 生成に戻す
      }
    },
    async save(column) {
      const rec = await packColumn(column.cx, column.cz, encodeSections(column.sections), gen, column.sections.length);
      await backend.write(saveId, [rec], null);
    },
  };
}

/** 起動のとき 1 回だけ「消さないで」とたのむ（だめでも・なくても 遊べる。待たない）。たのんだら true */
export function requestPersist(storage: { persist?: () => Promise<boolean> } | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage): boolean {
  try {
    if (!storage || typeof storage.persist !== 'function') return false;
    void storage.persist().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

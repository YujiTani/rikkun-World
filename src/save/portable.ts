import { validMeta } from './restore';
import { gunzip, gzip } from './chunkCodec';
import type { PersistBackend, StoredChunk, StoredMeta } from './backend';

/** ファイルに出す / 読む（大人向け。Safari の 7 日消去にそなえる）。全レコード + meta を JSON にして gzip した `.rikkun.gz` */
export const EXPORT_FORMAT = 'rikkun-world-save';
export const EXPORT_FILE_NAME = 'rikkun-world.rikkun.gz';

const toB64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (t: string): Uint8Array => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

export async function exportSave(db: PersistBackend, saveId: string): Promise<Uint8Array> {
  const { meta, chunks } = await db.readAll(saveId);
  if (!meta) throw new Error('まだ ほぞんが ありません');
  const text = JSON.stringify({
    format: EXPORT_FORMAT,
    v: 1,
    meta,
    chunks: chunks.map((c) => ({ cx: c.cx, cz: c.cz, v: c.v, gen: c.gen, h: c.h, data: toB64(c.data) })),
  });
  return gzip(new TextEncoder().encode(text));
}

/** ファイルの中身を 検査して、そのセーブを入れかえる。使えなければ Error（何も変えない）。戻り値 = 列の数 */
export async function importSave(db: PersistBackend, saveId: string, file: Uint8Array, seed: number): Promise<number> {
  let doc: { format?: unknown; v?: unknown; meta?: unknown; chunks?: unknown };
  try {
    doc = JSON.parse(new TextDecoder().decode(await gunzip(file)));
  } catch {
    throw new Error('ファイルが よめません');
  }
  if (doc.format !== EXPORT_FORMAT || doc.v !== 1 || !Array.isArray(doc.chunks)) throw new Error('りっくんワールドの ファイルでは ありません');
  if (!validMeta(doc.meta, seed)) throw new Error('この せかいの ファイルでは ありません');
  const chunks: StoredChunk[] = [];
  for (const c of doc.chunks as Record<string, unknown>[]) {
    if (!c || !Number.isInteger(c.cx) || !Number.isInteger(c.cz) || !Number.isInteger(c.v) || !Number.isInteger(c.gen) || !Number.isInteger(c.h) || typeof c.data !== 'string') {
      throw new Error('ファイルが こわれています');
    }
    chunks.push({ cx: c.cx as number, cz: c.cz as number, v: c.v as number, gen: c.gen as number, h: c.h as number, data: fromB64(c.data) });
  }
  await db.replaceAll(saveId, chunks, doc.meta as StoredMeta);
  return chunks.length;
}

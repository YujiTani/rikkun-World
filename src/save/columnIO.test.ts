import { describe, expect, it } from 'vitest';
import type { ChunkColumn } from '../contracts';
import { uniformSection } from '../world/sections';
import { ChunkStream } from '../world/stream/ChunkStream';
import { colKey } from '../world/stream/ring';
import { ChunkedVoxelWorld } from '../world/VoxelWorld';
import { MemoryBackend, packColumn, SAVE_ID } from './backend';
import { encodeSections } from './chunkCodec';
import { ColumnIO } from './columnIO';
import { PENDING_KEY } from './restore';
import { openStoredKeys } from './streamRestore';
import type { KeyValueStore } from './SaveManager';

const H = 32;
const NS = 2;
const SEED = 7;

class Store implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const col = (cx: number, cz: number, block = 0): ChunkColumn => ({ cx, cz, sections: [uniformSection(block), uniformSection(0)] });

async function seedDb(db: MemoryBackend, list: Array<[number, number]>, block = 1) {
  for (const [cx, cz] of list) await db.write(SAVE_ID, [await packColumn(cx, cz, encodeSections(col(cx, cz, block).sections), 3, NS)], null);
  await db.write(SAVE_ID, [], { v: 1, gen: 3, seed: SEED });
}

function boot(db: MemoryBackend | null, keys: Set<number>, saveOn = true) {
  const world = new ChunkedVoxelWorld({ x: 0, z: 0, y: H });
  const gen: number[][] = [];
  const corrupt: number[][] = [];
  const io = new ColumnIO({
    db,
    saveId: SAVE_ID,
    nSections: NS,
    keys,
    generate: (cx, cz) => {
      gen.push([cx, cz]);
      return col(cx, cz, 2);
    },
    saveOn: () => saveOn,
    saving: () => false,
    writing: () => false,
    canFlush: () => false,
    flush: () => undefined,
    onCorrupt: (cx, cz) => corrupt.push([cx, cz]),
  });
  const stream = new ChunkStream({
    world,
    light: { lightColumn: () => undefined },
    mesh: { setRing: () => undefined, pendingJobs: () => 0, nextJobDist: () => null, runJob: () => false, columnState: () => 'true' },
    io,
  });
  const run = async (n = 400) => {
    stream.setWork(10);
    for (let i = 0; i < n; i++) {
      stream.update();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      if (stream.ready && stream.queuedCount() === 0) return;
    }
    throw new Error('おわらない');
  };
  return { world, stream, io, gen, corrupt, run };
}

describe('起動で全部は読まない（基準 11・D1・D2）', () => {
  it('キーの一覧だけ読む。保存に 300 あっても 中身を読むのは 輪の中で いる列だけ', async () => {
    const db = new MemoryBackend();
    const list: Array<[number, number]> = [];
    for (let i = 0; i < 300; i++) list.push([(i % 20) - 10, Math.floor(i / 20) - 7]);
    await seedDb(db, list);
    const r = await openStoredKeys({ db, store: new Store(), seed: SEED, saveId: SAVE_ID, reset: false });
    expect(db.readKeysCalls).toBe(1);
    expect(db.readAllCalls).toBe(0);
    expect(db.readChunkCalls).toBe(0);
    expect(r.keys.size).toBe(300);
    expect(r.meta).not.toBeNull();
    const b = boot(db, r.keys);
    b.stream.restart(0, 0, 'boot');
    await b.run();
    expect(db.readAllCalls).toBe(0);
    expect(db.readChunkCalls).toBeLessThanOrEqual(289);
    expect(db.readChunkCalls).toBeGreaterThan(0);
    // 保存にある列は 保存の中身 (block 1)、ない列は 生成 (block 2)
    expect(b.world.getBlock(0, 0, 0)).toBe('grass');
    expect(b.gen.some(([cx, cz]) => cx === 0 && cz === 8)).toBe(true);
    expect(b.gen.some(([cx, cz]) => cx === 0 && cz === 0)).toBe(false);
  });

  it('こわれた列は 生成して saveDirty', async () => {
    const db = new MemoryBackend();
    await seedDb(db, [[0, 0], [1, 0]]);
    const bad = await packColumn(1, 0, new Uint8Array([9, 9, 9, 9]), 3, NS);
    db.chunks.set(`${SAVE_ID}/1/0`, bad);
    const r = await openStoredKeys({ db, store: new Store(), seed: SEED, saveId: SAVE_ID, reset: false });
    const b = boot(db, r.keys);
    b.stream.restart(0, 0, 'boot');
    await b.run();
    expect(b.gen.some(([cx, cz]) => cx === 1 && cz === 0)).toBe(true);
    expect(b.world.isSaveDirty(1, 0)).toBe(true);
    expect(b.world.isSaveDirty(0, 0)).toBe(false);
    expect(b.corrupt).toEqual([[1, 0]]);
  });
});

describe('保存できないとき（D5）', () => {
  it('捨てる列を ページの中に預け、もどったら そこから読む（さわった所が もとにもどらない）', async () => {
    const b = boot(null, new Set(), false);
    b.stream.restart(0, 0, 'boot');
    await b.run();
    expect(b.io.persistent()).toBe(false);
    b.world.setBlock(-8 * 16 + 3, 4, 3, 'log'); // 西のはし (-8, 0) をさわる
    expect(b.world.isSaveDirty(-8, 0)).toBe(true);
    b.stream.setCenter(4, 0); // (-8, 0) は 距離 12
    await b.run();
    expect(b.world.column(-8, 0)).toBeUndefined();
    expect(b.io.keptCount()).toBe(1);
    b.stream.setCenter(0, 0);
    await b.run();
    expect(b.world.getBlock(-8 * 16 + 3, 4, 3)).toBe('log');
  });
});

describe('保険（pagehide・K6）', () => {
  it('保険のマスを 列ごとに分けて持つ。自分のセーブのものだけ', async () => {
    const db = new MemoryBackend();
    await seedDb(db, [[0, 0]]);
    const store = new Store();
    store.setItem(PENDING_KEY, JSON.stringify({ saveId: SAVE_ID, ids: ['air', 'stone', 'dirt'], cells: [300, 5, 4, 1, 301, 5, 4, 2, 2, 5, 2, 1], meta: { v: 1, gen: 3, seed: SEED, tick: 5 } }));
    const r = await openStoredKeys({ db, store, seed: SEED, saveId: SAVE_ID, reset: false });
    expect(r.fromPending).toBe(true);
    expect(r.pending.size).toBe(2);
    expect(r.pending.get(colKey(18, 0))!.cells).toEqual([[300, 5, 4, 'stone'], [301, 5, 4, 'dirt']]);
    expect(r.pending.get(colKey(0, 0))!.cells).toEqual([[2, 5, 2, 'stone']]);
  });
});

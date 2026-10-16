import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { SectionData } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { generateIsland } from '../world/gen/generateIsland';
import { sectionToArray } from '../world/sections';
import { IdbBackend, MemoryBackend, SAVE_ID, createChunkStore, packColumn, requestPersist, unpackColumn, type PersistBackend } from './backend';
import { decodeSections, deflateRaw, encodeSections, inflateRaw, padSections } from './chunkCodec';
import { exportSave, importSave } from './portable';
import { restoreStoredWorld } from './restore';
import { SaveManager } from './SaveManager';

const same = (a: SectionData[], b: SectionData[]) => a.length === b.length && a.every((s, i) => sectionToArray(s).every((v, k) => v === sectionToArray(b[i])[k]));

function sample(): SectionData[] {
  const full = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) full[i] = i % 20; // 20 種類 → そのまま
  const packed = new Uint8Array(2048);
  for (let i = 0; i < 2048; i++) packed[i] = (i % 3) | ((i % 2) << 4);
  return [
    { kind: 'uniform', block: 0 },
    { kind: 'uniform', block: 3 },
    { kind: 'palette', palette: Uint8Array.of(0, 5, 2), packed },
    { kind: 'full', data: full },
  ];
}

describe('chunkCodec', () => {
  it('3 つの形が 書いて読むと同じ。full でも 種類が少なければ パレットで保存する', () => {
    const s = sample();
    const raw = encodeSections(s);
    expect(same(decodeSections(raw, 4), s)).toBe(true);
    const few = new Uint8Array(4096);
    few[7] = 4;
    const raw2 = encodeSections([{ kind: 'full', data: few }]);
    expect(raw2[0]).toBe(1);
    expect(raw2.length).toBe(2 + 2 + 2048);
    expect(encodeSections([{ kind: 'full', data: new Uint8Array(4096).fill(9) }])).toEqual(Uint8Array.of(0, 9));
  });

  it('こわれていたら Error', () => {
    const raw = encodeSections(sample());
    expect(() => decodeSections(raw.slice(0, raw.length - 1), 4)).toThrow();
    expect(() => decodeSections(raw, 3)).toThrow(); // 余り
    expect(() => decodeSections(Uint8Array.of(7), 1)).toThrow();
    expect(() => decodeSections(Uint8Array.of(0, 250), 1)).toThrow(); // 知らない番号
  });

  it('deflate-raw で縮めて戻せる。上を空気で足せる', async () => {
    const raw = encodeSections(sample());
    const z = await deflateRaw(raw);
    expect(z.length).toBeLessThan(raw.length);
    expect(await inflateRaw(z)).toEqual(raw);
    expect(padSections([{ kind: 'uniform', block: 1 }], 3).map((x) => (x as { block: number }).block)).toEqual([1, 0, 0]);
  });
});

async function backends(): Promise<Array<[string, PersistBackend]>> {
  return [
    ['メモリ版', new MemoryBackend()],
    ['IndexedDB（fake-indexeddb）', await IdbBackend.open(new IDBFactory(), `t${Math.random()}`)],
  ];
}

describe('PersistBackend（メモリ版と IndexedDB 版で同じ）', () => {
  it('列と meta を書いて読める。別のセーブとは 混ざらない', async () => {
    for (const [, db] of await backends()) {
      const a = await packColumn(1, -2, encodeSections(sample()), 2, 4);
      const b = await packColumn(0, 0, encodeSections(sample()), 2, 4);
      await db.write('main', [a, b], { v: 1, seed: 5 });
      await db.write('other', [b], { v: 1, seed: 6 });
      const all = await db.readAll('main');
      expect(all.meta).toEqual({ v: 1, seed: 5 });
      expect(all.chunks.map((c) => [c.cx, c.cz]).sort()).toEqual([[0, 0], [1, -2]]);
      const got = await db.readChunk('main', 1, -2);
      expect(got && (await unpackColumn(got, 4)).sections.length).toBe(4);
      expect(await db.readChunk('main', 9, 9)).toBeNull();
      // 同じ列を書きなおすと 置きかわる
      await db.write('main', [await packColumn(0, 0, encodeSections([{ kind: 'uniform', block: 1 }]), 2, 1)], null);
      expect((await db.readAll('main')).chunks).toHaveLength(2);
      expect((await db.readAll('main')).meta).toEqual({ v: 1, seed: 5 });
      await db.replaceAll('main', [a], { v: 1, seed: 7 });
      expect((await db.readAll('main')).chunks).toHaveLength(1);
      await db.clear('main');
      expect(await db.readAll('main')).toEqual({ meta: null, chunks: [] });
      expect((await db.readAll('other')).chunks).toHaveLength(1);
    }
  });

  it('ChunkStore（contracts）: load / save', async () => {
    for (const [, db] of await backends()) {
      const store = createChunkStore(db, 'main', 4, 2);
      expect(await store.load(3, 3)).toBeNull();
      const sections = sample();
      await store.save({ cx: 3, cz: 3, sections });
      const col = await store.load(3, 3);
      expect(col && same(col.sections, sections)).toBe(true);
    }
  });
});

describe('IndexedDB 版で 世界ぜんぶ（AC1）', () => {
  it('ほる・おく → 保存 → 読みなおしで、世界のハッシュと持ち物が同じ。ファイルに出して入れても同じ', async () => {
    const db = await IdbBackend.open(new IDBFactory(), `w${Math.random()}`);
    const mk = async (b: PersistBackend) => {
      const world = new ArrayVoxelWorld();
      generateIsland(7, world);
      world.resetSaveTracking();
      const restored = await restoreStoredWorld({ world, db: b, store: kv, seed: 7, saveId: SAVE_ID, reset: false });
      let inv: unknown = null;
      const save = new SaveManager({
        world,
        seed: 7,
        db: b,
        restored,
        store: kv,
        inventory: { serialize: () => inv, deserialize: (d: unknown) => void (inv = d), clear: () => void (inv = null) } as never,
        player: { get: () => ({ position: { x: 6.5, y: 30, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false }), set: () => {} },
        spawn: () => ({ x: 6.5, y: 30, z: 6.5, yawDeg: 0, pitchDeg: 0 }),
        tick: () => 0,
        settings: { saveIntervalTicks: 600 },
      });
      return { world, save, loaded: save.load(), setInv: (v: unknown) => (inv = v), inv: () => inv };
    };
    const map = new Map<string, string>();
    const kv = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    const a = await mk(db);
    a.world.setBlock(3, 20, 3, 'log');
    a.world.setBlock(90, 12, 50, 'sand');
    a.setInv({ slots: [{ item: 'dirt', count: 4 }] });
    await a.save.now();
    const b = await mk(db);
    expect(b.loaded).toBe(true);
    expect(b.world.hash()).toBe(a.world.hash());
    expect(b.inv()).toEqual({ slots: [{ item: 'dirt', count: 4 }] });

    const file = await exportSave(db, SAVE_ID);
    const db2 = new MemoryBackend();
    expect(await importSave(db2, SAVE_ID, file, 7)).toBe(2);
    const c = await mk(db2);
    expect(c.world.hash()).toBe(a.world.hash());
    await expect(importSave(new MemoryBackend(), SAVE_ID, file, 8)).rejects.toThrow();
    await expect(importSave(new MemoryBackend(), SAVE_ID, Uint8Array.of(1, 2, 3), 7)).rejects.toThrow();
  });
});

describe('requestPersist', () => {
  it('1 回たのむ。なくても・失敗しても 止まらない', () => {
    let n = 0;
    expect(requestPersist({ persist: async () => (n++, true) })).toBe(true);
    expect(n).toBe(1);
    expect(requestPersist(undefined)).toBe(false);
    expect(requestPersist({})).toBe(false);
    expect(requestPersist({ persist: () => Promise.reject(new Error('no')) })).toBe(true);
    expect(requestPersist({ persist: () => { throw new Error('no'); } })).toBe(false);
  });
});

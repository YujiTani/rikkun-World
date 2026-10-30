import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../contracts';
import { WORLD_HEIGHT } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { findContinue, findSavedWorld, saveLastSeed } from '../start/lastWorld';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { columnHash, generateChunk } from '../world/gen/chunk';
import { GEN_CONFIG } from '../world/gen/config';
import { terrainFor } from '../world/gen/terrain';
import { MemoryBackend, SAVE_ID, unpackColumn } from './backend';
import { gunzip, gzip } from './chunkCodec';
import { OLD_WORLD_FILE_MESSAGE, exportSave, importSave } from './portable';
import { restoreStoredWorld } from './restore';
import { SAVE_GEN, SaveManager, type KeyValueStore } from './SaveManager';

/**
 * MINE-1A（docs/design/MINE-1.md §4.8）受け入れ基準 A11: 保存。
 *
 *   ・地形の 作り方の 版 SAVE_GEN を 3 → 4 に 上げる（地下の 作り方〔層・鉱石〕が かわる 境目を 保存に のこす）
 *   ・版 3 いじょう 今の 版 いか の 保存は ぜんぶ 読める: 「つづきから」に 出る・開ける・ファイル（.rikkun.gz）も 読める。版 2 は 今どおり 読まない
 *   ・保存に ある 列は そのまま（前の 作り方の 地形・鉱石）。保存に ない 列は 新しい 作り方
 *   ・版 3 と 4 の 列が まざった 世界も 読める（最初の 列が どちらの 版でも）。開いて 保存すると meta の gen が 今の 版
 *
 * fixture `__fixtures__/world-v3-seed20261012.rikkun.gz` は MINE-1 の 前の ゲーム〔版 3〕が 書き出した 保存
 * （ふだんの シード 20261012。スタートの まわり 横 48 マスの 列 ＝ 7×7 を さわった 状態）。書きかえて 通さない。
 */

const SEED = GEN_CONFIG.defaultSeed;
const NS = WORLD_HEIGHT / 16;
/** 読める いちばん 古い 版（§4.8。仕様の 数。コードでは 1 か所に 書く〔#304〕） */
const OLDEST_READABLE = 3;

const fixture = (): Uint8Array => new Uint8Array(readFileSync(new URL('./__fixtures__/world-v3-seed20261012.rikkun.gz', import.meta.url)));

class MemoryStore implements KeyValueStore {
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

/** fixture を ファイルから 読みこんだ ところ（.rikkun.gz を 開く） */
async function openFixture(): Promise<{ db: MemoryBackend; store: MemoryStore; imported: number }> {
  const db = new MemoryBackend();
  const imported = await importSave(db, SAVE_ID, fixture(), SEED);
  return { db, store: new MemoryStore(), imported };
}

/** 保存を 開いて SaveManager を 作る（ふだんの 起動と 同じ 順: restoreStoredWorld → SaveManager.load） */
async function openGame(db: MemoryBackend, store: MemoryStore) {
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  const restored = await restoreStoredWorld({ world, db, store, seed: SEED, saveId: SAVE_ID, reset: false });
  const state: PlayerState = {
    position: { x: 100, y: 200, z: 100 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const save = new SaveManager({
    world, seed: SEED, db, store, restored, inventory: new InventoryImpl(),
    player: { get: () => state, set: () => {} },
    spawn: () => ({ x: 100, y: 200, z: 100, yawDeg: 0, pitchDeg: 0 }),
    tick: () => 0,
    settings: { saveIntervalTicks: 600 },
  });
  return { world, restored, save, loaded: save.load() };
}

describe('A11: 保存の 版（SAVE_GEN）', () => {
  it('SAVE_GEN は 3 から 上がった（4 いじょう）', () => {
    expect(SAVE_GEN).toBeGreaterThanOrEqual(OLDEST_READABLE + 1);
  });
});

describe('A11: 版 3 の 保存（fixture）を 読める', () => {
  it('fixture は 版 3 の ファイル（meta も 列も gen 3）で、スタートの まわりの 列が 入って いる', async () => {
    const { db, imported } = await openFixture();
    const all = await db.readAll(SAVE_ID);
    expect(imported).toBe(all.chunks.length);
    expect((all.meta as { gen?: number }).gen).toBe(OLDEST_READABLE);
    expect(new Set(all.chunks.map((c) => c.gen))).toEqual(new Set([OLDEST_READABLE]));
    const sp = terrainFor(SEED).spawn();
    expect(all.chunks.some((c) => c.cx === sp.x >> 4 && c.cz === sp.z >> 4), 'スタートの 列').toBe(true);
  });

  it('版 3 の ファイル（.rikkun.gz）を 今の 版の ゲームが 読みこめる。版 2 の ファイルは 今どおり 読まない', async () => {
    expect(SAVE_GEN, '版を 上げた あとの ゲームで 版 3 を 読む').toBeGreaterThan(OLDEST_READABLE);
    const { imported } = await openFixture();
    expect(imported).toBeGreaterThan(0);
    // 版 2 に 書きかえた ファイル → 読まない
    const doc = JSON.parse(new TextDecoder().decode(await gunzip(fixture()))) as { meta: { gen: number }; chunks: { gen: number }[] };
    doc.meta.gen = 2;
    for (const c of doc.chunks) c.gen = 2;
    const old = await gzip(new TextEncoder().encode(JSON.stringify(doc)));
    await expect(importSave(new MemoryBackend(), SAVE_ID, old, SEED)).rejects.toThrow(OLD_WORLD_FILE_MESSAGE);
  });

  it('「つづきから」に 出る（最初の 列が 版 3）', async () => {
    expect(SAVE_GEN).toBeGreaterThan(OLDEST_READABLE);
    const { db, store } = await openFixture();
    expect(await findSavedWorld({ db, seed: SEED, nSections: NS })).toEqual({ strength: 'normal' });
    saveLastSeed(store, SEED);
    expect(await findContinue({ db, store, search: '', nSections: NS })).toEqual({ seed: SEED, strength: 'normal' });
  });

  it('開ける: 保存に ある 列の 中身は 保存の とおり（ハッシュ 同じ）。つくりなおさない', async () => {
    expect(SAVE_GEN).toBeGreaterThan(OLDEST_READABLE);
    const { db, store } = await openFixture();
    const { world, loaded, restored } = await openGame(db, store);
    expect(loaded).toBe(true);
    const all = await db.readAll(SAVE_ID);
    expect(restored.columns).toBe(all.chunks.length);
    expect(restored.corrupt).toBe(0);
    for (const rec of all.chunks) {
      const stored = await unpackColumn(rec, NS);
      expect(columnHash(world.column(rec.cx, rec.cz)!), `列 (${rec.cx}, ${rec.cz})`).toBe(columnHash(stored));
    }
  });

  it('保存の 列は 今の 作り方で つくった 列と 鉱石が ちがう（だから「保存の とおり」を たしかめる 意味が ある）', async () => {
    const { db } = await openFixture();
    const all = await db.readAll(SAVE_ID);
    let differ = 0;
    for (const rec of all.chunks) {
      const stored = await unpackColumn(rec, NS);
      if (columnHash(generateChunk(SEED, rec.cx, rec.cz)) !== columnHash(stored)) differ++;
    }
    expect(differ, `${all.chunks.length} 列の うち`).toBeGreaterThanOrEqual(Math.ceil(all.chunks.length * 0.8));
  });
});

describe('A11: 開いて 保存すると、版 3 と 4 の 列が まざった 世界に なる', () => {
  it('meta の gen が 今の 版・さわった 列だけ 今の 版・さわって いない 列は 版 3 のまま。「つづきから」に 出る（最初の 列が 版 3 でも 今の 版でも）', async () => {
    expect(SAVE_GEN).toBeGreaterThan(OLDEST_READABLE);
    const { db, store } = await openFixture();
    const { world, save } = await openGame(db, store);
    const before = await db.readAll(SAVE_ID);
    const first = (await db.readKeys(SAVE_ID)).keys[0]!;

    // 保存に ない 新しい 列を 読みこんで さわる
    world.loadColumn(generateChunk(SEED, 40, 40));
    expect(world.setBlock(40 * 16 + 3, 300, 40 * 16 + 3, 'stone')).toBe(true);
    await save.now();
    let all = await db.readAll(SAVE_ID);
    expect((all.meta as { gen?: number }).gen, '開いて 保存した meta').toBe(SAVE_GEN);
    const gens = (cx: number, cz: number): number => all.chunks.find((c) => c.cx === cx && c.cz === cz)!.gen;
    expect(gens(40, 40), '新しい 列').toBe(SAVE_GEN);
    expect(gens(first.cx, first.cz), 'さわって いない 列').toBe(OLDEST_READABLE);
    expect(all.chunks.length).toBe(before.chunks.length + 1);
    expect(new Set(all.chunks.map((c) => c.gen))).toEqual(new Set([OLDEST_READABLE, SAVE_GEN]));
    expect(await findSavedWorld({ db, seed: SEED, nSections: NS }), '最初の 列が 版 3').not.toBeNull();

    // 最初の 列を さわって 今の 版に する → 最初の 列が 今の 版でも 出る
    expect(world.setBlock(first.cx * 16 + 1, 300, first.cz * 16 + 1, 'stone')).toBe(true);
    await save.now();
    all = await db.readAll(SAVE_ID);
    const firstNow = (await db.readKeys(SAVE_ID)).keys[0]!;
    expect(gens(firstNow.cx, firstNow.cz), '最初の 列').toBe(SAVE_GEN);
    expect(new Set(all.chunks.map((c) => c.gen))).toEqual(new Set([OLDEST_READABLE, SAVE_GEN]));
    expect(await findSavedWorld({ db, seed: SEED, nSections: NS }), '最初の 列が 今の 版').not.toBeNull();
    saveLastSeed(store, SEED);
    expect(await findContinue({ db, store, search: '', nSections: NS })).toEqual({ seed: SEED, strength: 'normal' });
  });

  it('まざった 世界の ファイル（.rikkun.gz）を 書き出して 読みなおせる', async () => {
    expect(SAVE_GEN).toBeGreaterThan(OLDEST_READABLE);
    const { db, store } = await openFixture();
    const { world, save } = await openGame(db, store);
    world.loadColumn(generateChunk(SEED, 41, 41));
    expect(world.setBlock(41 * 16 + 2, 300, 41 * 16 + 2, 'stone')).toBe(true);
    await save.now();
    const file = await exportSave(db, SAVE_ID);
    const db2 = new MemoryBackend();
    const n = await importSave(db2, SAVE_ID, file, SEED);
    const all = await db2.readAll(SAVE_ID);
    expect(n).toBe(all.chunks.length);
    expect(new Set(all.chunks.map((c) => c.gen))).toEqual(new Set([OLDEST_READABLE, SAVE_GEN]));
    expect(await findSavedWorld({ db: db2, seed: SEED, nSections: NS })).not.toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BlockId, PlayerState } from '../contracts';
import { WORLD_HEIGHT } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { findContinue, findSavedWorld, saveLastSeed } from '../start/lastWorld';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { columnHash } from '../world/gen/chunk';
import { GEN_CONFIG } from '../world/gen/config';
import { terrainFor } from '../world/gen/terrain';
import { MemoryBackend, SAVE_ID, unpackColumn } from './backend';
import { exportSave, importSave } from './portable';
import { restoreStoredWorld } from './restore';
import { SAVE_GEN, SaveManager, type KeyValueStore } from './SaveManager';

/**
 * MINE-1B（docs/design/MINE-1.md §4.8・受け入れ基準 B10）: 古い 保存の 列を 読める・ブロックの 番号が ずれない・1B は 版を 上げない。
 *
 *   1B は 新しい ブロック 8 つを 今の いちばん うしろに 足す だけで、保存の 版は 1A の まま〔SAVE_GEN 4〕。
 *   古い 保存〔新しい ブロックが ない〕は 版 3〔MINE-1 の 前〕と 版 4〔MINE-1A〕の fixture の 2 つ。どちらも 開けて、保存に ある 列は 保存の とおり。
 *   新しい ブロックを 置いて 保存した 世界も 開きなおせる〔id の 文字で 書く 保存なので、番号が ずれても 読める〕。
 *
 * fixture:
 *   `world-v3-seed20261012.rikkun.gz` ＝ MINE-1 の 前の ゲーム〔版 3〕が 書き出した 保存〔MINE-1A の 先行テストで 作った〕。
 *   `world-v4-seed20261012.rikkun.gz` ＝ MINE-1A が 入った main〔版 4〕の ゲームが 書き出した 保存。作り方は 版 3 と 同じ
 *     〔ふだんの シード 20261012・populateWorld で 世界を 作る・スタートの まわり 横 48 マスの 列 ＝ 7×7 を さわった ことに して SaveManager.now()・exportSave〕。
 *   どちらも 書きかえて 通さない。
 */

const SEED = GEN_CONFIG.defaultSeed;
const NS = WORLD_HEIGHT / 16;
/** MINE-1A が 上げた 保存の 版〔仕様 §4.8: 1A 4・1B 上げない〕。1C が 上げる ときは 1C の 先行テストで かえる */
const GEN_1A = 4;

const FIXTURES = [
  { name: '版 3（MINE-1 の 前）', file: 'world-v3-seed20261012.rikkun.gz', gen: 3 },
  { name: '版 4（MINE-1A）', file: 'world-v4-seed20261012.rikkun.gz', gen: 4 },
] as const;
type Fixture = (typeof FIXTURES)[number];

const bytesOf = (f: Fixture): Uint8Array => new Uint8Array(readFileSync(new URL(`./__fixtures__/${f.file}`, import.meta.url)));

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
async function openFile(f: Fixture): Promise<{ db: MemoryBackend; store: MemoryStore; imported: number }> {
  const db = new MemoryBackend();
  const imported = await importSave(db, SAVE_ID, bytesOf(f), SEED);
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

/** 1B で 足す 新しい ブロックのうち、アイテムに できる 4 つ〔置いて 保存する〕 */
const NEW_BLOCKS = ['nendo', 'sekkaiseki', 'kin_ore', 'hotaruishi'] as const;

describe('B10: 保存の 版は 1A の まま（1B は 上げない）', () => {
  it('SAVE_GEN が 1A と 同じ', () => {
    expect(SAVE_GEN).toBe(GEN_1A);
  });
});

describe.each(FIXTURES)('B10: $name の fixture（新しい ブロックが ない 古い 保存）', (f) => {
  it('fixture は その 版の ファイル（meta も 列も 同じ 版）で、スタートの まわりの 列が 入って いる', async () => {
    const { db, imported } = await openFile(f);
    const all = await db.readAll(SAVE_ID);
    expect(imported).toBe(all.chunks.length);
    expect((all.meta as { gen?: number }).gen).toBe(f.gen);
    expect(new Set(all.chunks.map((c) => c.gen))).toEqual(new Set([f.gen]));
    const sp = terrainFor(SEED).spawn();
    expect(all.chunks.some((c) => c.cx === sp.x >> 4 && c.cz === sp.z >> 4), 'スタートの 列').toBe(true);
  });

  it('ファイル（.rikkun.gz）を 今の ゲームが 読みこめる・「つづきから」に 出る', async () => {
    const { db, store, imported } = await openFile(f);
    expect(imported).toBeGreaterThan(0);
    expect(await findSavedWorld({ db, seed: SEED, nSections: NS })).toEqual({ strength: 'normal' });
    saveLastSeed(store, SEED);
    expect(await findContinue({ db, store, search: '', nSections: NS })).toEqual({ seed: SEED, strength: 'normal' });
  });

  it('開ける: 保存に ある 列の 中身は 保存の とおり〔ハッシュ 同じ〕。ブロックの 番号が ずれない', async () => {
    const { db, store } = await openFile(f);
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

  it('開いて すぐ 保存しても、保存の 列は かわらない', async () => {
    const { db, store } = await openFile(f);
    const before = await db.readAll(SAVE_ID);
    const hashes = new Map<string, string>();
    for (const rec of before.chunks) hashes.set(`${rec.cx},${rec.cz}`, columnHash(await unpackColumn(rec, NS)));
    const { save } = await openGame(db, store);
    await save.now();
    const after = await db.readAll(SAVE_ID);
    expect(after.chunks.length).toBe(before.chunks.length);
    for (const rec of after.chunks) expect(columnHash(await unpackColumn(rec, NS)), `列 (${rec.cx}, ${rec.cz})`).toBe(hashes.get(`${rec.cx},${rec.cz}`));
  });

  it('新しい ブロック〔1B〕を 置いて 保存 → 開きなおすと 同じ 場所に 同じ ブロック。ほかの 列は かわらない。ファイルに 書き出して 読んでも 同じ', async () => {
    const { db, store } = await openFile(f);
    const before = await db.readAll(SAVE_ID);
    const first = (await db.readKeys(SAVE_ID)).keys[0]!;
    const hashes = new Map<string, string>();
    for (const rec of before.chunks) hashes.set(`${rec.cx},${rec.cz}`, columnHash(await unpackColumn(rec, NS)));

    const { world, save } = await openGame(db, store);
    const spots = NEW_BLOCKS.map((id, k) => ({ id, x: first.cx * 16 + 2 + k, y: 300, z: first.cz * 16 + 3 }));
    for (const s of spots) expect(world.setBlock(s.x, s.y, s.z, s.id as BlockId), `${s.id} を 置ける`).toBe(true);
    await save.now();

    // 開きなおす
    const again = await openGame(db, store);
    for (const s of spots) expect(again.world.getBlock(s.x, s.y, s.z), `${s.id} が のこる`).toBe(s.id);
    // さわって いない 列は 保存の まま
    const all = await db.readAll(SAVE_ID);
    for (const rec of all.chunks) {
      if (rec.cx === first.cx && rec.cz === first.cz) continue;
      expect(columnHash(await unpackColumn(rec, NS)), `列 (${rec.cx}, ${rec.cz})`).toBe(hashes.get(`${rec.cx},${rec.cz}`));
    }
    // ファイルに 書き出して 読みこんでも 同じ
    const file = await exportSave(db, SAVE_ID);
    const db2 = new MemoryBackend();
    expect(await importSave(db2, SAVE_ID, file, SEED)).toBe(all.chunks.length);
    const third = await openGame(db2, new MemoryStore());
    for (const s of spots) expect(third.world.getBlock(s.x, s.y, s.z), `${s.id} が ファイルでも のこる`).toBe(s.id);
  });
});

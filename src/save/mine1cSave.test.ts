import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../contracts';
import { WORLD_HEIGHT } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { columnHash } from '../world/gen/chunk';
import { GEN_CONFIG } from '../world/gen/config';
import {
  GenCols,
  genColumn,
  hook1c,
  ledgeProblems,
  lightProblems,
  shapeProblems,
  touchedColKeys,
  wallProblems,
  walkProblems,
  type OldCols,
} from '../world/gen/mineShaftKit';
import { colKey } from '../world/stream/ring';
import { spawnOf } from '../world/gen/terrain';
import { MemoryBackend, SAVE_ID, unpackColumn } from './backend';
import { exportSave, importSave } from './portable';
import * as SaveManagerModule from './SaveManager';
import { SAVE_GEN, SAVE_VERSION, SaveManager, type KeyValueStore } from './SaveManager';
import { openStoredKeys, type StreamRestore } from './streamRestore';

/**
 * MINE-1C（docs/design/MINE-1.md §4.8・受け入れ基準 C9・C14 の 一覧の 大きさ）: 保存。1C は 保存の 版を 4 → 5〔坑道の 版〕に 上げ、古い 列の 一覧を meta に 持つ。
 *
 *   ・古い 保存 2 つ〔版 3: world-v3-seed20261012・版 4: world-v4-seed20261012。どちらも スタートの まわりの 列 7×7 が 保存に ある〕を それぞれ 開く:
 *     開くと 古い 列の 一覧〔坑道〕が 保存の 列ぜんぶ〔meta の gen は 保存の 版の まま〕。保存すると meta の gen が 今の 版・一覧は そのまま・保存の 列は かわらない。
 *   ・はじまりの 坑道は 古い 列に かからず〔道・山の まわり 2 マスの 列が 古い 列でない〕C3〜C7 を みたす。ほかの 坑道も 古い 列に かからない。
 *   ・閉じて 2 回 開いても はじまりの 坑道は 同じ。古い 列を さわって 保存しなおしても 古い まま。新しく 保存した 列は 古くない。新しい 世界は 一覧 なし。
 *   ・ファイル〔.rikkun.gz〕に 書き出して 読みこんでも 一覧が 同じ。ページを 閉じる ときの 保険〔PENDING_KEY〕から もどしても 一覧が 同じ。
 *   ・一覧の 大きさ: 列 1 つに つき 12 バイト 以下〔colKey は 10 けた〕。
 *
 * 【自分で 決めた 名前】 developer が ちがう 形に した ときは、この ファイルの「つなぎ」の 所だけ あわせる:
 *   ・`KODO_GEN`〔SaveManager.ts。坑道の 版 ＝ 5。部屋の 版は 1D〕。`SAVE_GEN` は 5 いじょう。
 *   ・起動で 読む `openStoredKeys` の 答え `StreamRestore.oldCols: { kodo: Set<number>; heya: Set<number> }`〔colKey の 集まり〕
 *   ・meta の 書き方 `meta.oldCols: { kodo: number[]; heya?: number[] }`〔新しい 世界では なくても 空でも よい〕
 *   ・`generateChunk(seed, cx, cz, oldCols?)` と `createMineHook({ seed, oldCols, metaGen })` に 一覧と 版を わたす。窓口 `mine.oldCols(kind)`・`mine.isOld(kind, cx, cz)`・`mine.saveGens()`
 *   ・`SaveManager.metaGen(): number | null`〔開いて いる 世界の meta の 版。保存した あとは 書いた 値。meta が なければ null〕を `saveGens().meta` の もとに する〔案〕。
 */

const SEED = GEN_CONFIG.defaultSeed;
const NS = WORLD_HEIGHT / 16;
const KODO_GEN = (SaveManagerModule as unknown as { KODO_GEN?: number }).KODO_GEN;

const FIXTURES = [
  { name: '版 3（MINE-1 の 前）', file: 'world-v3-seed20261012.rikkun.gz', gen: 3 },
  { name: '版 4（MINE-1A・1B）', file: 'world-v4-seed20261012.rikkun.gz', gen: 4 },
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

async function openFile(f: Fixture): Promise<{ db: MemoryBackend; store: MemoryStore }> {
  const db = new MemoryBackend();
  await importSave(db, SAVE_ID, bytesOf(f), SEED);
  return { db, store: new MemoryStore() };
}

type Restored = StreamRestore & { oldCols?: OldCols };
/** 起動と 同じ 順: openStoredKeys → SaveManager.load〔列は 世界に 読まない。stream が 読む〕 */
async function openGame(db: MemoryBackend, store: MemoryStore) {
  const restored = (await openStoredKeys({ db, store, seed: SEED, saveId: SAVE_ID, reset: false })) as Restored;
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
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
    streaming: true,
  });
  const loaded = save.load();
  return { world, restored, save, loaded };
}

const keysOf = async (db: MemoryBackend): Promise<Set<number>> => new Set((await db.readKeys(SAVE_ID)).keys.map((k) => colKey(k.cx, k.cz)));
const sorted = (xs: Iterable<number>): number[] => [...xs].sort((a, b) => a - b);
const metaOf = async (db: MemoryBackend): Promise<{ gen?: number; oldCols?: { kodo?: number[] } }> => ((await db.readKeys(SAVE_ID)).meta ?? {}) as never;
const listOf = (r: Restored): Set<number> => new Set(r.oldCols?.kodo ?? []);

describe('C9: 保存の 版', () => {
  it('坑道の 版 KODO_GEN は 5・SAVE_GEN は それ いじょう〔1D で 6 に なっても KODO_GEN は 5〕・読める いちばん 古い 版〔3〕は かわらない', () => {
    expect(KODO_GEN, 'SaveManager.KODO_GEN').toBe(5);
    expect(SAVE_GEN).toBeGreaterThanOrEqual(5);
    expect(SaveManagerModule.OLDEST_READABLE_GEN).toBe(3);
  });

  it('新しい 世界の 窓口: 古い 列 0・isOld は いつも false・版は 今の 版・坑道の 版 5', () => {
    const h = hook1c(SEED);
    expect(h.oldCols('kodo')).toBe(0);
    expect(h.isOld('kodo', 4, 4)).toBe(false);
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, kodo: 5 });
  });
});

describe.each(FIXTURES)('C9: $name の 古い 保存', (f) => {
  it('開く: 古い 列の 一覧〔坑道〕が 保存の 列ぜんぶ・meta の 版は 保存の 版の まま〔3／4〕・窓口の oldCols／isOld が 一覧と 同じ', async () => {
    const { db, store } = await openFile(f);
    const stored = await keysOf(db);
    expect(stored.size, 'fixture の 列').toBeGreaterThan(0);
    const { restored, loaded } = await openGame(db, store);
    expect(loaded).toBe(true);
    expect(restored.meta?.gen, '開いた ところの meta の 版').toBe(f.gen);
    expect(sorted(listOf(restored)), '古い 列の 一覧').toEqual(sorted(stored));
    const h = hook1c(SEED, { oldCols: restored.oldCols });
    expect(h.oldCols('kodo')).toBe(stored.size);
    for (const k of (await db.readKeys(SAVE_ID)).keys) expect(h.isOld('kodo', k.cx, k.cz), `列 (${k.cx}, ${k.cz})`).toBe(true);
    expect(h.isOld('kodo', 900, 900), '保存に ない 列').toBe(false);
  });

  it('保存する: meta の 版が 今の 版・一覧は そのまま〔meta に 書く。列 1 つ 12 バイト 以下〕・保存の 列は かわらない。2 回 開いても 一覧は 同じ', async () => {
    const { db, store } = await openFile(f);
    const before = await db.readAll(SAVE_ID);
    const hashes = new Map<string, string>();
    for (const rec of before.chunks) hashes.set(`${rec.cx},${rec.cz}`, columnHash(await unpackColumn(rec, NS)));
    const { save, restored } = await openGame(db, store);
    const want = sorted(listOf(restored));
    expect(want.length, '古い 列の 一覧は 保存の 列ぜんぶ〔からっぽで 通さない〕').toBe((await keysOf(db)).size);
    await save.now();
    const meta = await metaOf(db);
    expect(meta.gen, '保存した meta の 版').toBe(SAVE_GEN);
    expect(sorted(meta.oldCols?.kodo ?? []), 'meta の 一覧').toEqual(want);
    expect(JSON.stringify(meta.oldCols?.kodo ?? []).length, '一覧の 大きさ〔列 1 つ 12 バイト〕').toBeLessThanOrEqual(12 * want.length + 2);
    const after = await db.readAll(SAVE_ID);
    expect(after.chunks.length).toBe(before.chunks.length);
    for (const rec of after.chunks) expect(columnHash(await unpackColumn(rec, NS)), `列 (${rec.cx}, ${rec.cz})`).toBe(hashes.get(`${rec.cx},${rec.cz}`));
    // 閉じて 開きなおす〔2 回〕
    for (let k = 0; k < 2; k++) {
      const again = await openGame(db, store);
      expect(sorted(listOf(again.restored)), `${k + 1} 回目に 開いた 一覧`).toEqual(want);
      await again.save.now();
    }
  });

  it('saveGens().meta: 開いた ときは 保存の 版〔3／4〕・保存した あとは 今の 版。坑道の 版 kodo は 5', async () => {
    const { db, store } = await openFile(f);
    const { restored, save } = await openGame(db, store);
    const metaGen = (): number | null => (save as unknown as { metaGen(): number | null }).metaGen();
    const h = hook1c(SEED, { oldCols: restored.oldCols, metaGen });
    expect(h.saveGens(), '開いた とき').toMatchObject({ current: SAVE_GEN, meta: f.gen, kodo: 5 });
    await save.now();
    expect(h.saveGens(), '保存した あと').toMatchObject({ current: SAVE_GEN, meta: SAVE_GEN, kodo: 5 });
  });

  it('はじまりの 坑道は 古い 列に かからず〔道・山の まわり 2 マスの 列が どれも 古くない〕C3〜C7 を みたす。閉じて 2 回 開いても 同じ 場所', async () => {
    const { db, store } = await openFile(f);
    const { restored, save } = await openGame(db, store);
    const old = restored.oldCols!;
    const h = hook1c(SEED, { oldCols: old });
    const start = h.startShaft();
    const path = h.shaftPath(start.id);
    const bad = [...touchedColKeys(start, path)].filter((k) => old.kodo.has(k));
    expect(bad.length, '古い 列に かかる 列').toBe(0);
    const g = new GenCols(SEED, old);
    const problems = [...shapeProblems(g, start, path), ...wallProblems(g, start, path), ...ledgeProblems(g, start), ...walkProblems(g, start, path), ...lightProblems(g, start, path)];
    expect(problems.slice(0, 6), `${problems.length} つ`).toEqual([]);
    await save.now();
    for (let k = 0; k < 2; k++) {
      const again = await openGame(db, store);
      const h2 = hook1c(SEED, { oldCols: again.restored.oldCols });
      expect(h2.startShaft(), `${k + 2} 回目に 開いた`).toEqual(start);
    }
  }, 120_000);

  it('ほかの 坑道〔スタートの まわり 3,072 マス四方〕も どれも 古い 列に かからない〔とちゅうで 切れた 道が ない〕', async () => {
    const { db, store } = await openFile(f);
    const { restored } = await openGame(db, store);
    const old = restored.oldCols!;
    const h = hook1c(SEED, { oldCols: old });
    const sp = spawnOf(SEED);
    const all = h.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      const hit = [...touchedColKeys(s, h.shaftPath(s.id))].filter((k) => old.kodo.has(k));
      expect(hit.length, `${s.id}`).toBe(0);
    }
  }, 60_000);

  it('古い 列を さわって 保存しなおしても 古い まま・新しく 保存した 列は 古くない。一覧の 大きさも 数も かわらない', async () => {
    const { db, store } = await openFile(f);
    const { world, restored, save } = await openGame(db, store);
    const want = sorted(listOf(restored));
    const first = (await db.readKeys(SAVE_ID)).keys[0]!;
    // 古い 列を 世界に 読みこんで さわる〔stream が 読む のと 同じ〕
    const rec = (await db.readAll(SAVE_ID)).chunks.find((c) => c.cx === first.cx && c.cz === first.cz)!;
    world.loadColumn(await unpackColumn(rec, NS));
    world.resetSaveTracking();
    expect(world.setBlock(first.cx * 16 + 1, 300, first.cz * 16 + 1, 'stone')).toBe(true);
    // 新しい 列を 作って さわる
    world.loadColumn(genColumn(SEED, 40, 40, restored.oldCols));
    expect(world.setBlock(40 * 16 + 3, 300, 40 * 16 + 3, 'stone')).toBe(true);
    await save.now();
    const stored = await keysOf(db);
    expect(stored.has(colKey(40, 40)), '新しい 列が 保存された').toBe(true);
    const again = await openGame(db, store);
    const list = listOf(again.restored);
    expect(sorted(list), '一覧は そのまま').toEqual(want);
    expect(list.has(colKey(first.cx, first.cz)), 'さわって 保存しなおした 古い 列').toBe(true);
    expect(list.has(colKey(40, 40)), '新しく 保存した 列').toBe(false);
    const h = hook1c(SEED, { oldCols: again.restored.oldCols });
    expect(h.isOld('kodo', first.cx, first.cz)).toBe(true);
    expect(h.isOld('kodo', 40, 40)).toBe(false);
    expect(h.oldCols('kodo')).toBe(want.length);
  });

  it('ファイル〔.rikkun.gz〕に 書き出して 読みこんでも 一覧が 同じ〔開いて 保存した あとでも・保存する 前の 古い ファイルでも〕', async () => {
    const { db, store } = await openFile(f);
    const { restored, save } = await openGame(db, store);
    const want = sorted(listOf(restored));
    expect(want.length, '古い 列の 一覧は 保存の 列ぜんぶ〔からっぽで 通さない〕').toBe((await keysOf(db)).size);
    // 保存する 前の 古い ファイルを そのまま 読みこむ → 開いた とき 一覧が できる
    const raw = new MemoryBackend();
    await importSave(raw, SAVE_ID, bytesOf(f), SEED);
    expect(sorted(listOf((await openGame(raw, new MemoryStore())).restored))).toEqual(want);
    // 保存して 書き出し → 読みこみ
    await save.now();
    const file = await exportSave(db, SAVE_ID);
    const db2 = new MemoryBackend();
    await importSave(db2, SAVE_ID, file, SEED);
    expect(sorted(listOf((await openGame(db2, new MemoryStore())).restored)), '書き出して 読みこんだ').toEqual(want);
  });

  it('ページを 閉じる ときの 保険〔PENDING_KEY〕から もどしても 一覧が 同じ〔保険の meta にも 一覧が 入る〕', async () => {
    const { db, store } = await openFile(f);
    const { world, restored, save } = await openGame(db, store);
    const want = sorted(listOf(restored));
    const first = (await db.readKeys(SAVE_ID)).keys[0]!;
    const rec = (await db.readAll(SAVE_ID)).chunks.find((c) => c.cx === first.cx && c.cz === first.cz)!;
    world.loadColumn(await unpackColumn(rec, NS));
    world.resetSaveTracking();
    expect(world.setBlock(first.cx * 16 + 2, 300, first.cz * 16 + 2, 'stone')).toBe(true);
    // IndexedDB には 書けず、保険だけ のこる ところ〔pagehide〕
    db.failWrites = true;
    const handlers = new Map<string, () => void>();
    const win = { addEventListener: (t: string, fn: () => void) => handlers.set(t, fn), removeEventListener: () => undefined };
    const doc = { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined };
    save.bindPageEvents(win as never, doc as never);
    handlers.get('pagehide')!();
    expect([...store.data.keys()].some((k) => k.includes('pending')), '保険が 置かれた').toBe(true);
    await vi.waitFor(() => expect(save.info().failures, '書きこみは しっぱいした').toBeGreaterThan(0)); // 保険だけ のこる まで 待つ
    const meta = await metaOf(db);
    expect(meta.gen, 'IndexedDB の meta は 保存の 版の まま').toBe(f.gen);
    db.failWrites = false;
    // 次の 起動: 保険から もどす
    const again = await openGame(db, store);
    expect(again.restored.fromPending, '保険から もどした').toBe(true);
    expect(sorted(listOf(again.restored)), '保険から もどした 一覧').toEqual(want);
    const h = hook1c(SEED, { oldCols: again.restored.oldCols });
    expect(h.oldCols('kodo')).toBe(want.length);
  });
});

describe('C9: 古い 保存の meta が ない・こわれて いる（§5）→ 版 3 と みなして、保存の 列 ぜんぶを 古い 列に する', () => {
  const f = FIXTURES[1];
  const cases: { name: string; make: (db: MemoryBackend) => void }[] = [
    { name: 'meta が ない', make: (db) => void db.metas.delete(SAVE_ID) },
    { name: 'meta に gen が ない', make: (db) => void db.metas.set(SAVE_ID, { v: SAVE_VERSION, seed: SEED } as never) },
    { name: 'meta の gen が 数でない', make: (db) => void db.metas.set(SAVE_ID, { ...db.metas.get(SAVE_ID), gen: 'x' } as never) },
    { name: 'meta の gen が 小数・負', make: (db) => void db.metas.set(SAVE_ID, { ...db.metas.get(SAVE_ID), gen: -1.5 } as never) },
  ];
  it.each(cases)('$name', async ({ make }) => {
    const { db, store } = await openFile(f);
    make(db);
    const stored = await keysOf(db);
    expect(stored.size, 'fixture の 列').toBeGreaterThan(0);
    const { restored } = await openGame(db, store);
    expect(sorted(listOf(restored)), '古い 列の 一覧').toEqual(sorted(stored));
    const h = hook1c(SEED, { oldCols: restored.oldCols });
    expect(h.oldCols('kodo')).toBe(stored.size);
  });
});

describe('C9: 新しい 世界', () => {
  it('保存が ない 世界を 開くと 一覧は 空・新しい 列を 保存しても 一覧は ふえない〔meta に 一覧が ない か 空〕', async () => {
    const db = new MemoryBackend();
    const store = new MemoryStore();
    const { world, restored, save } = await openGame(db, store);
    expect(listOf(restored).size).toBe(0);
    world.loadColumn(genColumn(SEED, 30, 30));
    expect(world.setBlock(30 * 16 + 1, 300, 30 * 16 + 1, 'stone')).toBe(true);
    await save.now();
    const meta = await metaOf(db);
    expect(meta.gen).toBe(SAVE_GEN);
    expect(meta.oldCols?.kodo ?? []).toEqual([]);
    const again = await openGame(db, store);
    expect(listOf(again.restored).size).toBe(0);
    expect(hook1c(SEED, { oldCols: again.restored.oldCols }).oldCols('kodo')).toBe(0);
  });
});

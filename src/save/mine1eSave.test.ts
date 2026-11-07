import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../contracts';
import { WORLD_HEIGHT } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { columnHash } from '../world/gen/chunk';
import { GEN_CONFIG } from '../world/gen/config';
import { golden1D, pathHashOf } from '../world/gen/mineBokenGolden';
import { hookE, needBokenHook } from '../world/gen/mineBokenKit';
import { GenCols, bothWays, genColumn, hook1c, type OldCols } from '../world/gen/mineShaftKit';
import { spawnOf } from '../world/gen/terrain';
import { colKey } from '../world/stream/ring';
import { MemoryBackend, SAVE_ID, unpackColumn } from './backend';
import * as Gens from './gens';
import { exportSave, importSave } from './portable';
import * as SaveManagerModule from './SaveManager';
import { SAVE_GEN, SAVE_VERSION, SaveManager, type KeyValueStore } from './SaveManager';
import { openStoredKeys, type StreamRestore } from './streamRestore';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.13・受け入れ基準 E16）: 保存の 版を 6 → 7〔1E の 版〕に 上げる。古い 列の 一覧〔1E〕を 持つ。
 *
 *   fixture: 版 6〔1D 入り〕の 保存 `__fixtures__/world-v6-seed20261012.rikkun.gz`〔はじまりの 坑道と、スタートに 近い ほかの 坑道の 道の 列を 一部 ふくむ〕と、
 *   版 5・4・3 の 保存。見本 `mine1d-before.json`〔1D の あとの 形。作り方は src/world/gen/mineBokenStart.test.ts の 頭〕。
 *   ・開くと 1E の 一覧が 保存の 列 ぜんぶ〔`restored.oldCols.boken`〕。ほかの 一覧は ふえない〔版 6 は 坑道・部屋 とも 0。版 5 は 部屋 ぜんぶ。版 3・4 は 坑道・部屋 ぜんぶ〕
 *   ・保存すると meta の 版が 今の 版・一覧は そのまま・保存の 列は かわらない・meta の 一覧の 大きさは 保存の 列 1 つに つき 12 バイト 以下〔一覧が いくつ あっても〕
 *   ・1C・1D の 坑道が 1E の 一覧の 列〔まわり 2 マス〕に かかる 区画は `gen: 'c'` で `shaftPath` が 1E の 前と 同じ〔ハッシュ〕・道さがしが 通る
 *   ・`gen: 'e'` の 坑道は 1E の 一覧の 列に かからない・はじまりの 入口〔`meta.shaftStart`〕は 前と 同じ
 *   ・ファイル〔.rikkun.gz〕・保険〔PENDING_KEY〕から もどしても 同じ
 *
 * 【fixture の 作り方】 1E の 実装の 前の main〔1D 入り。SAVE_GEN 6〕で:
 *     MAKE_V6_FIXTURE=1 npx vitest run src/save/mine1eSave.test.ts -t 'fixture を 作る'
 * 【自分で 決めた 名前】 `BOKEN_GEN`〔src/save/gens.ts。1E の 版 ＝ 7。SaveManager からも 出す〕・`StreamRestore.oldCols.boken`〔colKey の 集まり〕・窓口 `oldCols('boken')`・`isOld('boken', cx, cz)`・`saveGens().boken`。
 *   meta の 書き方は developer の もの〔配列とは かぎらない〕。1C・1D の meta の `oldCols: { kodo, heya? }` は 読めること〔版 5・6 の fixture〕。
 */

vi.setConfig({ testTimeout: 600_000 });

const SEED = GEN_CONFIG.defaultSeed;
const NS = WORLD_HEIGHT / 16;
const BOKEN_GEN = (Gens as unknown as { BOKEN_GEN?: number }).BOKEN_GEN;
const FIXTURES = [
  { name: '版 6（MINE-1D）', file: 'world-v6-seed20261012.rikkun.gz', gen: 6 },
  { name: '版 5（MINE-1C）', file: 'world-v5-seed20261012.rikkun.gz', gen: 5 },
  { name: '版 4（MINE-1A・1B）', file: 'world-v4-seed20261012.rikkun.gz', gen: 4 },
  { name: '版 3（MINE-1 の 前）', file: 'world-v3-seed20261012.rikkun.gz', gen: 3 },
] as const;
type Fixture = (typeof FIXTURES)[number];
const fixtureUrl = (file: string): URL => new URL(`./__fixtures__/${file}`, import.meta.url);
const bytesOf = (f: Fixture): Uint8Array => new Uint8Array(readFileSync(fixtureUrl(f.file)));

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

async function openFile(f: Fixture): Promise<{ db: MemoryBackend; store: MemoryStore }> {
  const db = new MemoryBackend();
  await importSave(db, SAVE_ID, bytesOf(f), SEED);
  return { db, store: new MemoryStore() };
}

type Restored = StreamRestore & { oldCols?: OldCols };
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
const metaOf = async (db: MemoryBackend): Promise<Record<string, unknown>> => ((await db.readKeys(SAVE_ID)).meta ?? {}) as never;
const listOf = (r: Restored, kind: 'kodo' | 'heya' | 'boken'): number[] => sorted((r.oldCols as unknown as Record<string, Iterable<number> | undefined> | undefined)?.[kind] ?? []);
/** 3 つの 一覧 */
const listsOf = (r: Restored): { kodo: number[]; heya: number[]; boken: number[] } => ({ kodo: listOf(r, 'kodo'), heya: listOf(r, 'heya'), boken: listOf(r, 'boken') });
/** 版ごとの 一覧: 1E の 一覧は どの 版でも 保存の 列 ぜんぶ。部屋は 版 5 まで、坑道は 版 4 まで ぜんぶ */
const wantLists = (f: Fixture, stored: ReadonlySet<number>): { kodo: number[]; heya: number[]; boken: number[] } => ({
  kodo: f.gen < 5 ? sorted(stored) : [],
  heya: f.gen < 6 ? sorted(stored) : [],
  boken: sorted(stored),
});
const sizeOf = (m: unknown): number => JSON.stringify(m).length;

// ------------------------------------------------------------------ fixture を 作る〔1E の 前の main だけ〕

describe('fixture を 作る', () => {
  it.skipIf(!process.env['MAKE_V6_FIXTURE'])('版 6 の fixture を 作る〔1D 入りの main で 1 回〕', async () => {
    expect(SAVE_GEN, 'この 作り方は 版 6 の ときだけ').toBe(6);
    const db = new MemoryBackend();
    const store = new MemoryStore();
    const { world, restored, save } = await openGame(db, store);
    const sp = spawnOf(SEED);
    const h = hook1c(SEED);
    const start = h.startShaft();
    const near = h
      .shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535)
      .filter((x) => !x.start)
      .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z))[0]!;
    const cols: { cx: number; cz: number }[] = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) cols.push({ cx: (sp.x >> 4) + dx, cz: (sp.z >> 4) + dz });
    // はじまりの 坑道の 道の 列〔4 マスに 1 つ。上限 60 列〕と、スタートに いちばん 近い ほかの 坑道の 道の 列〔上限 40 列〕
    for (const [s, cap] of [[start, 60], [near, 40]] as const) {
      const seen = new Set<number>();
      for (const c of h.shaftPath(s.id).filter((_, i) => i % 4 === 0)) {
        const k = colKey(c.x >> 4, c.z >> 4);
        if (seen.has(k) || seen.size >= cap) continue;
        seen.add(k);
        cols.push({ cx: c.x >> 4, cz: c.z >> 4 });
      }
    }
    const uniq = new Map(cols.map((c) => [colKey(c.cx, c.cz), c] as const));
    for (const c of uniq.values()) world.loadColumn(genColumn(SEED, c.cx, c.cz, restored.oldCols));
    world.resetSaveTracking();
    for (const c of uniq.values()) expect(world.setBlock(c.cx * 16 + 1, 300, c.cz * 16 + 1, 'stone')).toBe(true);
    await save.now();
    writeFileSync(fixtureUrl(FIXTURES[0].file), await exportSave(db, SAVE_ID));
    expect((await keysOf(db)).size).toBeGreaterThan(60);
  }, 300_000);
});

// ------------------------------------------------------------------ 版

describe('E16: 保存の 版', () => {
  it('1E の 版 BOKEN_GEN は 7〔部屋の 版 6・坑道の 版 5 は かわらない〕・SAVE_GEN は それ いじょう・読める いちばん 古い 版は 3', () => {
    expect(BOKEN_GEN, 'src/save/gens.ts の BOKEN_GEN').toBe(7);
    expect(Gens.HEYA_GEN).toBe(6);
    expect(Gens.KODO_GEN).toBe(5);
    expect(SAVE_GEN).toBeGreaterThanOrEqual(7);
    expect((SaveManagerModule as unknown as { BOKEN_GEN?: number }).BOKEN_GEN, 'SaveManager からも 出す').toBe(BOKEN_GEN);
    expect(SaveManagerModule.OLDEST_READABLE_GEN).toBe(3);
  });

  it('新しい 世界の 窓口: 1E の 古い 列 0・isOld は いつも false・saveGens の boken は 1E の 版', () => {
    const h = hookE(SEED);
    needBokenHook(h, ['saveGens', 'oldCols', 'isOld']);
    expect(h.oldCols('boken')).toBe(0);
    expect(h.isOld('boken', 4, 4)).toBe(false);
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, kodo: 5, heya: 6, boken: 7 });
  });
});

// ------------------------------------------------------------------ 古い 保存

describe.each(FIXTURES)('E16: $name の 古い 保存', (f) => {
  it('開く: 1E の 一覧が 保存の 列ぜんぶ・ほかの 一覧は 版の とおり〔ふえない〕・meta の 版は 保存の 版の まま・窓口の oldCols／isOld が 一覧と 同じ', async () => {
    const { db, store } = await openFile(f);
    const stored = await keysOf(db);
    expect(stored.size, 'fixture の 列').toBeGreaterThan(0);
    const { restored, loaded } = await openGame(db, store);
    expect(loaded).toBe(true);
    expect(restored.meta?.gen).toBe(f.gen);
    expect(listsOf(restored)).toEqual(wantLists(f, stored));
    const h = hookE(SEED, { oldCols: restored.oldCols });
    needBokenHook(h, ['oldCols', 'isOld']);
    expect(h.oldCols('boken')).toBe(stored.size);
    expect(h.oldCols('kodo')).toBe(f.gen < 5 ? stored.size : 0);
    expect(h.oldCols('heya')).toBe(f.gen < 6 ? stored.size : 0);
    for (const k of (await db.readKeys(SAVE_ID)).keys) expect(h.isOld('boken', k.cx, k.cz), `列 (${k.cx}, ${k.cz})`).toBe(true);
    expect(h.isOld('boken', 900, 900), '保存に ない 列').toBe(false);
  });

  it('保存する: meta の 版が 今の 版・一覧の 大きさは 列 1 つに つき 12 バイト 以下・保存の 列は かわらない。2 回 開いても 一覧は 同じ', async () => {
    const { db, store } = await openFile(f);
    const before = await db.readAll(SAVE_ID);
    const hashes = new Map<string, string>();
    for (const rec of before.chunks) hashes.set(`${rec.cx},${rec.cz}`, columnHash(await unpackColumn(rec, NS)));
    const { save, restored } = await openGame(db, store);
    const want = listsOf(restored);
    expect(want.boken.length, '1E の 一覧は 保存の 列ぜんぶ〔からっぽで 通さない〕').toBe((await keysOf(db)).size);
    await save.now();
    const meta = await metaOf(db);
    expect(meta['gen']).toBe(SAVE_GEN);
    // 一覧を 持たない 新しい 世界の meta との ちがいが 列 1 つに つき 12 バイト 以下
    const fresh = new MemoryBackend();
    const g = await openGame(fresh, new MemoryStore());
    g.world.loadColumn(genColumn(SEED, 30, 30));
    g.world.setBlock(30 * 16 + 1, 300, 30 * 16 + 1, 'stone');
    await g.save.now();
    const base = sizeOf(await metaOf(fresh));
    expect(sizeOf(meta) - base, `meta の 一覧の 大きさ〔列 ${want.boken.length} こ〕`).toBeLessThanOrEqual(12 * want.boken.length + 64);
    const after = await db.readAll(SAVE_ID);
    expect(after.chunks.length).toBe(before.chunks.length);
    for (const rec of after.chunks) expect(columnHash(await unpackColumn(rec, NS)), `列 (${rec.cx}, ${rec.cz})`).toBe(hashes.get(`${rec.cx},${rec.cz}`));
    for (let k = 0; k < 2; k++) {
      const again = await openGame(db, store);
      expect(listsOf(again.restored), `${k + 1} 回目`).toEqual(want);
      await again.save.now();
    }
  });

  it('saveGens: 開いた ときの meta は 保存の 版・保存した あとは 今の 版・boken は 1E の 版', async () => {
    const { db, store } = await openFile(f);
    const { restored, save } = await openGame(db, store);
    const metaGen = (): number | null => (save as unknown as { metaGen(): number | null }).metaGen();
    const h = hookE(SEED, { oldCols: restored.oldCols, metaGen });
    needBokenHook(h, ['saveGens']);
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, meta: f.gen, boken: 7 });
    await save.now();
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, meta: SAVE_GEN, boken: 7 });
  });

  it('ページを 閉じる ときの 保険〔PENDING_KEY〕から もどしても 一覧が 同じ', async () => {
    const { db, store } = await openFile(f);
    const { world, restored, save } = await openGame(db, store);
    const want = listsOf(restored);
    expect(want.boken.length).toBe((await keysOf(db)).size);
    const first = (await db.readKeys(SAVE_ID)).keys[0]!;
    const rec = (await db.readAll(SAVE_ID)).chunks.find((c) => c.cx === first.cx && c.cz === first.cz)!;
    world.loadColumn(await unpackColumn(rec, NS));
    world.resetSaveTracking();
    expect(world.setBlock(first.cx * 16 + 2, 300, first.cz * 16 + 2, 'stone')).toBe(true);
    db.failWrites = true;
    const handlers = new Map<string, () => void>();
    const win = { addEventListener: (t: string, fn: () => void) => handlers.set(t, fn), removeEventListener: () => undefined };
    const doc = { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined };
    save.bindPageEvents(win as never, doc as never);
    handlers.get('pagehide')!();
    expect([...store.data.keys()].some((k) => k.includes('pending')), '保険が 置かれた').toBe(true);
    await vi.waitFor(() => expect(save.info().failures, '書きこみは しっぱいした').toBeGreaterThan(0));
    expect((await metaOf(db))['gen'], 'IndexedDB の meta は 保存の 版の まま').toBe(f.gen);
    db.failWrites = false;
    const again = await openGame(db, store);
    expect(again.restored.fromPending, '保険から もどした').toBe(true);
    expect(listsOf(again.restored), '保険から もどした 一覧').toEqual(want);
    expect(hookE(SEED, { oldCols: again.restored.oldCols }).oldCols('boken')).toBe(want.boken.length);
  }, 60_000);

  it('ファイルに 書き出して 読みこんでも 一覧が 同じ', async () => {
    const { db, store } = await openFile(f);
    const { restored, save } = await openGame(db, store);
    const want = listsOf(restored);
    expect(want.boken.length).toBe((await keysOf(db)).size);
    await save.now();
    const db2 = new MemoryBackend();
    await importSave(db2, SAVE_ID, await exportSave(db, SAVE_ID), SEED);
    expect(listsOf((await openGame(db2, new MemoryStore())).restored)).toEqual(want);
  });
});

// ------------------------------------------------------------------ 坑道の 作りわけ〔版 6 の fixture〕

describe('E16: 版 6 の fixture で 区画ごとに どちらの 坑道を 作るか', () => {
  const f = FIXTURES[0];
  const E = 2;
  const hits = (box: { x0: number; z0: number; x1: number; z1: number }, list: ReadonlySet<number>): boolean => {
    for (let cz = (box.z0 - E) >> 4; cz <= (box.z1 + E) >> 4; cz++) for (let cx = (box.x0 - E) >> 4; cx <= (box.x1 + E) >> 4; cx++) if (list.has(colKey(cx, cz))) return true;
    return false;
  };

  it('1E の 一覧の 列〔まわり 2 マス〕に かかる 1C・1D の 坑道は `gen: \'c\'` で `shaftPath` が 1E の 前と 同じ〔ハッシュ〕・入口が 前と 同じ・はじまりの 坑道も 同じ', async () => {
    const { db, store } = await openFile(f);
    const { restored } = await openGame(db, store);
    const gold = golden1D();
    const h = hookE(SEED, { oldCols: restored.oldCols });
    needBokenHook(h, ['startShaft', 'shafts', 'shaftPath']);
    const list = new Set(listOf(restored, 'boken'));
    const sp = spawnOf(SEED);
    const live = new Map(h.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535).map((s) => [s.id, s] as const));
    const start = h.startShaft();
    const g0 = gold.starts[String(SEED)]!;
    expect(start.gen, 'はじまりの 坑道').toBe('c');
    expect(start.id).toBe(g0.id);
    expect(pathHashOf(h.shaftPath(start.id)), 'はじまりの 坑道の shaftPath').toBe(g0.pathHash);
    let compared = 0;
    const bad: string[] = [];
    for (const x of gold.near) {
      if (!hits(x.box, list)) continue;
      const s = live.get(x.id);
      if (!s) {
        bad.push(`${x.id}: 古い 列に かかるのに 坑道が ない`);
        continue;
      }
      compared++;
      if (s.gen !== 'c') bad.push(`${x.id}: gen ${String(s.gen)}〔'c' の はず〕`);
      if (pathHashOf(h.shaftPath(x.id)) !== x.pathHash) bad.push(`${x.id}: shaftPath が 1E の 前と ちがう`);
      if (s.entrance.x !== x.entrance.x || s.entrance.z !== x.entrance.z) bad.push(`${x.id}: 入口が ちがう`);
    }
    expect(compared, '古い 列に かかる 1C・1D の 坑道〔fixture に 道の 列を 入れた〕').toBeGreaterThan(0);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 240_000);

  it('道さがし: はじまりの 坑道と、古い 列に かかる 坑道は 入口と 横穴の 先が 行き来 できる', async () => {
    const { db, store } = await openFile(f);
    const { restored } = await openGame(db, store);
    const h = hookE(SEED, { oldCols: restored.oldCols });
    needBokenHook(h, ['startShaft', 'shafts']);
    const list = new Set(listOf(restored, 'boken'));
    const g = new GenCols(SEED, restored.oldCols);
    const sp = spawnOf(SEED);
    const olds = [h.startShaft(), ...h.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535).filter((s) => s.gen === 'c' && !s.start && hits(s.box, list)).slice(0, 3)];
    expect(olds.length).toBeGreaterThanOrEqual(2);
    for (const s of olds) {
      const box = { x0: s.box.x0 - 12, x1: s.box.x1 + 12, z0: s.box.z0 - 12, z1: s.box.z1 + 12 };
      for (const d of s.sides.slice(0, 4)) expect(bothWays(g, { x: s.entrance.x, y: s.entrance.y, z: s.entrance.z }, d.to, box), `${s.id} の 入口と 横穴の 先`).toBe(true);
    }
  }, 240_000);

  it('`gen: \'e\'` の 坑道は 1E の 一覧の 列〔まわり 2 マス〕に かからない〔スタートの まわり 1,536 マス〕', async () => {
    const { db, store } = await openFile(f);
    const { restored } = await openGame(db, store);
    const h = hookE(SEED, { oldCols: restored.oldCols });
    needBokenHook(h, ['shafts']);
    const list = new Set(listOf(restored, 'boken'));
    const sp = spawnOf(SEED);
    const all = h.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535);
    const es = all.filter((s) => s.gen === 'e');
    expect(es.length, '1E の 坑道').toBeGreaterThan(0);
    for (const s of es) expect(hits(s.box, list), `${s.id} が 古い 列に かかる`).toBe(false);
  }, 240_000);

  it('はじまりの 入口 `meta.shaftStart` は 前と 同じ〔開いて 保存しなおしても〕', async () => {
    const { db, store } = await openFile(f);
    const gold = golden1D().starts[String(SEED)]!;
    const { restored, save } = await openGame(db, store);
    const want = { x: gold.entrance.x, z: gold.entrance.z };
    expect(restored.shaftStart, '開いた ときの 入口').toEqual(want);
    await save.now();
    expect((await metaOf(db))['shaftStart'], '保存した meta').toEqual(want);
    const again = await openGame(db, store);
    expect(again.restored.shaftStart).toEqual(want);
  });
});

// ------------------------------------------------------------------ 版 5・6 で 書いた 古い 列の 配列

describe('E16: 版 5・6 の 保存が meta に 書いた「古い 列の 配列」を そのまま 読む〔りっくんの 本当の 世界〕', () => {
  /** 版 3 の fixture を 開き、meta を 版 5・6 の 書き方〔中身の ある `oldCols` の 配列〕に すりかえた 保存 */
  async function withMeta(gen: number, pick: (stored: number[]) => { kodo?: number[]; heya?: number[] }) {
    const { db, store } = await openFile(FIXTURES[3]);
    const stored = sorted(await keysOf(db));
    expect(stored.length, 'fixture の 列').toBeGreaterThan(20);
    const lists = pick(stored);
    const meta = { ...(db.metas.get(SAVE_ID) as object), gen, oldCols: lists };
    db.metas.set(SAVE_ID, meta as never);
    return { db, store, stored, lists };
  }

  it('版 6〔坑道・部屋の 配列〕: 坑道・部屋の 一覧は その 配列・1E の 一覧は 保存の 列ぜんぶ・窓口の 数も 合う', async () => {
    const { db, store, stored, lists } = await withMeta(6, (st) => ({ kodo: st.filter((_, i) => i % 4 === 0), heya: st.filter((_, i) => i % 2 === 0) }));
    const { restored } = await openGame(db, store);
    expect(listsOf(restored)).toEqual({ kodo: lists.kodo, heya: lists.heya, boken: stored });
    const h = hookE(SEED, { oldCols: restored.oldCols });
    needBokenHook(h, ['oldCols']);
    expect([h.oldCols('kodo'), h.oldCols('heya'), h.oldCols('boken')]).toEqual([lists.kodo!.length, lists.heya!.length, stored.length]);
  });

  it('版 5〔坑道の 配列 だけ〕: 坑道の 一覧は その 配列・部屋の 一覧は 保存の 列ぜんぶ〔版 5 は 部屋が ない〕・1E の 一覧も ぜんぶ', async () => {
    const { db, store, stored, lists } = await withMeta(5, (st) => ({ kodo: st.filter((_, i) => i % 4 === 1) }));
    const { restored } = await openGame(db, store);
    expect(listsOf(restored)).toEqual({ kodo: lists.kodo, heya: stored, boken: stored });
  });

  it('版 6〔配列が 空〕: 坑道・部屋の 一覧は 空のまま〔新しい 世界で 作った 保存〕・1E の 一覧は 保存の 列ぜんぶ', async () => {
    const { db, store, stored } = await withMeta(6, () => ({ kodo: [], heya: [] }));
    const { restored } = await openGame(db, store);
    expect(listsOf(restored)).toEqual({ kodo: [], heya: [], boken: stored });
  });

  it('保存しなおして 開いても 同じ 3 つの 一覧・1E の 前の 世界の 配列は へらない・ふえない・meta の 大きさは 列 1 つに つき 12 バイト 以下', async () => {
    const { db, store, stored, lists } = await withMeta(6, (st) => ({ kodo: st.filter((_, i) => i % 4 === 0), heya: st.filter((_, i) => i % 2 === 0) }));
    const first = await openGame(db, store);
    await first.save.now();
    const meta = await metaOf(db);
    expect(meta['gen']).toBe(SAVE_GEN);
    const fresh = new MemoryBackend();
    const g = await openGame(fresh, new MemoryStore());
    g.world.loadColumn(genColumn(SEED, 30, 30));
    g.world.setBlock(30 * 16 + 1, 300, 30 * 16 + 1, 'stone');
    await g.save.now();
    expect(sizeOf(meta) - sizeOf(await metaOf(fresh)), `meta の 一覧の 大きさ〔列 ${stored.length} こ〕`).toBeLessThanOrEqual(12 * stored.length + 64);
    for (let k = 0; k < 2; k++) {
      const again = await openGame(db, store);
      expect(listsOf(again.restored), `${k + 1} 回目`).toEqual({ kodo: lists.kodo, heya: lists.heya, boken: stored });
      await again.save.now();
    }
  });
});

describe('E16: meta が ない・こわれて いる・新しい 世界', () => {
  it('meta が ない・gen が こわれて いる → 版 3 と みなして 3 つの 一覧が 保存の 列 ぜんぶ', async () => {
    for (const make of [(db: MemoryBackend) => void db.metas.delete(SAVE_ID), (db: MemoryBackend) => void db.metas.set(SAVE_ID, { v: SAVE_VERSION, seed: SEED, gen: 'x' } as never)]) {
      const { db, store } = await openFile(FIXTURES[0]);
      make(db);
      const stored = await keysOf(db);
      const { restored } = await openGame(db, store);
      expect(listsOf(restored)).toEqual({ kodo: sorted(stored), heya: sorted(stored), boken: sorted(stored) });
    }
  });

  it('新しい 世界: 3 つの 一覧は 空・新しい 列を 保存しても ふえない', async () => {
    const db = new MemoryBackend();
    const store = new MemoryStore();
    const { world, restored, save } = await openGame(db, store);
    expect(listsOf(restored)).toEqual({ kodo: [], heya: [], boken: [] });
    world.loadColumn(genColumn(SEED, 30, 30));
    expect(world.setBlock(30 * 16 + 1, 300, 30 * 16 + 1, 'stone')).toBe(true);
    await save.now();
    expect((await metaOf(db))['gen']).toBe(SAVE_GEN);
    expect(listsOf((await openGame(db, store)).restored)).toEqual({ kodo: [], heya: [], boken: [] });
  });
});

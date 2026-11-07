import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../contracts';
import { WORLD_HEIGHT } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { columnHash } from '../world/gen/chunk';
import { GEN_CONFIG } from '../world/gen/config';
import { CAVE_RULES, hookCave, needCaveHook } from '../world/gen/mineCaveKit';
import { GenCols, bothWays, genColumn, hook1c, type OldCols, type Shaft } from '../world/gen/mineShaftKit';
import { legacyOld, legacyWith } from '../world/gen/mineLegacyKit';
import { spawnOf } from '../world/gen/terrain';
import { colKey } from '../world/stream/ring';
import { MemoryBackend, SAVE_ID, unpackColumn } from './backend';
import { exportSave, importSave } from './portable';
import * as SaveManagerModule from './SaveManager';
import { SAVE_GEN, SAVE_VERSION, SaveManager, type KeyValueStore } from './SaveManager';
import { openStoredKeys, type StreamRestore } from './streamRestore';

/**
 * MINE-1D（docs/design/MINE-1.md §4.8・受け入れ基準 D9）: 保存の 版を 5 → 6〔部屋の 版〕に 上げる。古い 列の 一覧〔部屋〕を meta に 持つ。
 *
 *   fixture: 版 5〔1C 入り〕の 保存 `__fixtures__/world-v5-seed20261012.rikkun.gz` と 版 3・版 4 の 保存。
 *   ・開くと `oldCols.heya` が 保存の 列 ぜんぶ〔版 5 の `oldCols.kodo` は 0 の まま。版 3・4 の kodo は 保存の 列 ぜんぶ〕
 *   ・保存すると meta の 版が 今の 版〔6〕・部屋の 一覧は そのまま・保存の 列は かわらない
 *   ・`caves()` の どの 部屋〔まわり 4 マス〕にも 古い 列〔`isOld('heya')`〕が ない
 *   ・部屋の かからない 列は 1C の あとと 同じ〔ハッシュ〕。版 5 の fixture の はじまりの 坑道の なかほどの 横穴は 古い 列が かかる ので つなぎかえず 1C の まま
 *   ・ファイル〔.rikkun.gz〕・保険〔PENDING_KEY〕から もどしても 一覧が 同じ
 *
 * 【fixture の 作り方】 1D の 実装の 前の main〔1C 入り。SAVE_GEN 5〕で:
 *     MAKE_V5_FIXTURE=1 npx vitest run src/save/mine1dSave.test.ts -t 'fixture を 作る'
 *   〔新しい 世界を 作り、スタートの まわり 7×7 の 列と、はじまりの 坑道の なかほどの いちばん 上の 横穴の 列を 保存して 書き出す。SAVE_GEN が 5 の ときだけ 作れる〕
 * 【自分で 決めた 名前】 `KODO_GEN`・`HEYA_GEN`〔SaveManager.ts。部屋の 版 ＝ 6〕・`StreamRestore.oldCols.heya`・meta の `oldCols.heya`。
 */

const SEED = GEN_CONFIG.defaultSeed;
const NS = WORLD_HEIGHT / 16;
const GENS = SaveManagerModule as unknown as { KODO_GEN?: number; HEYA_GEN?: number };
const V5 = 'world-v5-seed20261012.rikkun.gz';
const FIXTURES = [
  { name: '版 5（MINE-1C）', file: V5, gen: 5, kodoOld: false },
  { name: '版 4（MINE-1A・1B）', file: 'world-v4-seed20261012.rikkun.gz', gen: 4, kodoOld: true },
  { name: '版 3（MINE-1 の 前）', file: 'world-v3-seed20261012.rikkun.gz', gen: 3, kodoOld: true },
] as const;
type Fixture = (typeof FIXTURES)[number];
const GOLDEN = 'mine1c-before.json';
/** 1C の あと〔1D の 前の main〕から とった 形。`MAKE_1C_GOLDEN=1` で 作る。見本は 書きかえて 通さない */
interface Golden {
  /** 列の ハッシュ〔スタートの まわり 11×11 と とおくの 列〕 */
  columns: Record<string, string>;
  /** はじまりの 坑道 */
  start: { id: string; pathHash: string; pathLength: number; sides: { layer: string; from: Pt3; to: Pt3; end: string }[] };
  /** スタートに 近い 坑道〔横穴の 先が 部屋に つながる かもしれない 物を ふくむ〕 */
  shafts: { id: string; pathHash: string; box: { x0: number; z0: number; x1: number; z1: number }; sides: { layer: string; from: Pt3; to: Pt3; end: string }[] }[];
}
interface Pt3 {
  x: number;
  y: number;
  z: number;
}
const golden = (): Golden => JSON.parse(readFileSync(fixtureUrl(GOLDEN), 'utf8')) as Golden;
const fnv = (s: string): string => {
  let v = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) v = Math.imul(v ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return v.toString(16);
};
const pathHash = (path: { x: number; y: number; z: number; part: string }[]): string => fnv(path.map((c) => `${c.part},${c.x},${c.y},${c.z}`).join(';'));
const sidesOf = (sh: Shaft): Golden['start']['sides'] => sh.sides.map((d) => ({ layer: d.layer, from: d.from, to: d.to, end: d.end }));
/** 見る 列: スタートの まわり 11×11 と、とおくの 24 本〔作り方は 決まって いる〕 */
function goldenCols(): { cx: number; cz: number }[] {
  const sp = spawnOf(SEED);
  const out: { cx: number; cz: number }[] = [];
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) out.push({ cx: (sp.x >> 4) + dx, cz: (sp.z >> 4) + dz });
  for (let k = 0; k < 24; k++) out.push({ cx: (sp.x >> 4) + ((k * 37) % 181) - 90, cz: (sp.z >> 4) + ((k * 53) % 173) - 86 });
  return out;
}
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
const metaOf = async (db: MemoryBackend): Promise<{ gen?: number; oldCols?: { kodo?: number[]; heya?: number[] } }> => ((await db.readKeys(SAVE_ID)).meta ?? {}) as never;
const heyaOf = (r: Restored): Set<number> => new Set(r.oldCols?.heya ?? []);
const kodoOf = (r: Restored): Set<number> => new Set(r.oldCols?.kodo ?? []);

// ------------------------------------------------------------------ fixture を 作る〔1D の 前の main だけ〕

describe('fixture を 作る', () => {
  it.skipIf(!process.env['MAKE_V5_FIXTURE'])('版 5 の fixture を 作る〔1C 入りの main で 1 回〕', async () => {
    expect(SAVE_GEN, 'この 作り方は 版 5 の ときだけ').toBe(5);
    const db = new MemoryBackend();
    const store = new MemoryStore();
    const { world, restored, save } = await openGame(db, store);
    const sp = spawnOf(SEED);
    const h = hook1c(SEED);
    const start = h.startShaft();
    const naka = start.sides.filter((d) => d.layer === 'nakahodo');
    const topY = Math.max(...naka.map((d) => d.from.y));
    const top = naka.find((d) => d.from.y === topY)!;
    const path = h.shaftPath(start.id).filter((c) => c.part === 'side' && Math.abs(c.y - top.from.y) <= 12);
    const cols: { cx: number; cz: number }[] = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) cols.push({ cx: (sp.x >> 4) + dx, cz: (sp.z >> 4) + dz });
    for (const c of path) cols.push({ cx: c.x >> 4, cz: c.z >> 4 });
    cols.push({ cx: top.to.x >> 4, cz: top.to.z >> 4 });
    const uniq = new Map(cols.map((c) => [colKey(c.cx, c.cz), c] as const));
    for (const c of uniq.values()) world.loadColumn(genColumn(SEED, c.cx, c.cz, restored.oldCols));
    world.resetSaveTracking();
    for (const c of uniq.values()) expect(world.setBlock(c.cx * 16 + 1, 300, c.cz * 16 + 1, 'stone')).toBe(true);
    await save.now();
    const file = await exportSave(db, SAVE_ID);
    writeFileSync(fixtureUrl(V5), file);
    expect((await keysOf(db)).size).toBeGreaterThan(49);
  }, 180_000);
});

describe('1C の 見本を 作る', () => {
  it.skipIf(!process.env['MAKE_1C_GOLDEN'])('1C の あとの 形〔列の ハッシュ・坑道の 道〕を 作る〔1C 入りの main で 1 回〕', () => {
    expect(SAVE_GEN, 'この 作り方は 1D の 前の main〔版 5〕の ときだけ').toBe(5);
    const h = hook1c(SEED);
    const sp = spawnOf(SEED);
    const columns: Golden['columns'] = {};
    for (const c of goldenCols()) columns[`${c.cx},${c.cz}`] = columnHash(genColumn(SEED, c.cx, c.cz));
    const start = h.startShaft();
    const near = h
      .shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535)
      .filter((x) => !x.start)
      .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z))
      .slice(0, 40);
    const path = h.shaftPath(start.id);
    const g: Golden = {
      columns,
      start: { id: start.id, pathHash: pathHash(path), pathLength: path.length, sides: sidesOf(start) },
      shafts: near.map((x) => ({ id: x.id, pathHash: pathHash(h.shaftPath(x.id)), box: x.box, sides: sidesOf(x) })),
    };
    writeFileSync(fixtureUrl(GOLDEN), JSON.stringify(g));
    expect(g.shafts.length).toBeGreaterThan(10);
  }, 180_000);
});

describe('D9: 保存の 版', () => {
  it('部屋の 版 HEYA_GEN は 6・坑道の 版 KODO_GEN は 5・SAVE_GEN は 6 いじょう・読める いちばん 古い 版は 3', () => {
    expect(GENS.HEYA_GEN, 'SaveManager.HEYA_GEN').toBe(6);
    expect(GENS.KODO_GEN).toBe(5);
    expect(SAVE_GEN).toBeGreaterThanOrEqual(6);
    expect(SaveManagerModule.OLDEST_READABLE_GEN).toBe(3);
  });

  it('新しい 世界の 窓口: 部屋の 古い 列 0・isOld は いつも false・saveGens の heya は 部屋の 版', () => {
    const h = hookCave(SEED);
    needCaveHook(h, ['saveGens']);
    expect(h.oldCols('heya')).toBe(0);
    expect(h.isOld('heya', 4, 4)).toBe(false);
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, kodo: 5, heya: 6 });
  });
});

describe.each(FIXTURES)('D9: $name の 古い 保存', (f) => {
  it('開く: 部屋の 一覧が 保存の 列ぜんぶ・坑道の 一覧は 版 5 なら 0〔ふえない〕・版 3・4 なら 保存の 列ぜんぶ・meta の 版は 保存の 版の まま', async () => {
    const { db, store } = await openFile(f);
    const stored = await keysOf(db);
    expect(stored.size, 'fixture の 列').toBeGreaterThan(0);
    const { restored, loaded } = await openGame(db, store);
    expect(loaded).toBe(true);
    expect(restored.meta?.gen).toBe(f.gen);
    expect(sorted(heyaOf(restored)), '部屋の 一覧').toEqual(sorted(stored));
    expect(sorted(kodoOf(restored)), '坑道の 一覧').toEqual(f.kodoOld ? sorted(stored) : []);
    const h = hookCave(SEED, { oldCols: restored.oldCols });
    expect(h.oldCols('heya')).toBe(stored.size);
    expect(h.oldCols('kodo')).toBe(f.kodoOld ? stored.size : 0);
    for (const k of (await db.readKeys(SAVE_ID)).keys) expect(h.isOld('heya', k.cx, k.cz), `列 (${k.cx}, ${k.cz})`).toBe(true);
    expect(h.isOld('heya', 900, 900)).toBe(false);
  });

  it('保存する: meta の 版が 今の 版・部屋の 一覧は そのまま〔列 1 つ 12 バイト いか〕・坑道の 一覧は かわらない・保存の 列は かわらない。2 回 開いても 同じ', async () => {
    const { db, store } = await openFile(f);
    const before = await db.readAll(SAVE_ID);
    const hashes = new Map<string, string>();
    for (const rec of before.chunks) hashes.set(`${rec.cx},${rec.cz}`, columnHash(await unpackColumn(rec, NS)));
    const { save, restored } = await openGame(db, store);
    const want = sorted(heyaOf(restored));
    const wantKodo = sorted(kodoOf(restored));
    await save.now();
    const meta = await metaOf(db);
    expect(meta.gen).toBe(SAVE_GEN);
    // MINE-1E の 準備で 直した: 一覧の 書き方〔meta の 配列とは かぎらない。1E で 一覧が 3 つに なり 12 バイト／列に おさえる〕は developer の もの。
    // 書き方に よらない 見かた〔開きなおして 同じ 一覧・保存の 大きさ〕は src/save/mine1eSave.test.ts〔E16〕。ここは 下の「2 回 開いても 同じ」で 見る。
    const after = await db.readAll(SAVE_ID);
    expect(after.chunks.length).toBe(before.chunks.length);
    for (const rec of after.chunks) expect(columnHash(await unpackColumn(rec, NS)), `列 (${rec.cx}, ${rec.cz})`).toBe(hashes.get(`${rec.cx},${rec.cz}`));
    for (let k = 0; k < 2; k++) {
      const again = await openGame(db, store);
      expect(sorted(heyaOf(again.restored)), `${k + 1} 回目`).toEqual(want);
      expect(sorted(kodoOf(again.restored)), `${k + 1} 回目の 坑道`).toEqual(wantKodo);
      await again.save.now();
    }
  });

  it('saveGens: 開いた ときの meta は 保存の 版・保存した あとは 今の 版・heya は 6', async () => {
    const { db, store } = await openFile(f);
    const { restored, save } = await openGame(db, store);
    const metaGen = (): number | null => (save as unknown as { metaGen(): number | null }).metaGen();
    const h = hookCave(SEED, { oldCols: restored.oldCols, metaGen });
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, meta: f.gen, heya: 6 });
    await save.now();
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, meta: SAVE_GEN, heya: 6 });
  });

  it('caves() の どの 部屋〔まわり 4 マス〕にも 古い 部屋の 列が ない〔スタートの まわり 1,536 マス〕', async () => {
    const { db, store } = await openFile(f);
    const { restored } = await openGame(db, store);
    const h = hookCave(SEED, { oldCols: restored.oldCols });
    const sp = spawnOf(SEED);
    const caves = h.caves(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535);
    expect(caves.length).toBeGreaterThan(0);
    const E = CAVE_RULES.edge;
    for (const c of caves) {
      const b = c.box;
      for (let cz = (b.z0 - E) >> 4; cz <= (b.z1 + E) >> 4; cz++) for (let cx = (b.x0 - E) >> 4; cx <= (b.x1 + E) >> 4; cx++) expect(h.isOld('heya', cx, cz), `${c.id} の 列 (${cx}, ${cz})`).toBe(false);
    }
  }, 120_000);

  it('ページを 閉じる ときの 保険〔PENDING_KEY〕から もどしても 部屋の 一覧・坑道の 一覧が 同じ', async () => {
    const { db, store } = await openFile(f);
    const { world, restored, save } = await openGame(db, store);
    const want = sorted(heyaOf(restored));
    const wantKodo = sorted(kodoOf(restored));
    expect(want.length, '部屋の 一覧は 保存の 列ぜんぶ〔からっぽで 通さない〕').toBe((await keysOf(db)).size);
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
    expect((await metaOf(db)).gen, 'IndexedDB の meta は 保存の 版の まま').toBe(f.gen);
    db.failWrites = false;
    const again = await openGame(db, store);
    expect(again.restored.fromPending, '保険から もどした').toBe(true);
    expect(sorted(heyaOf(again.restored)), '保険から もどした 部屋の 一覧').toEqual(want);
    expect(sorted(kodoOf(again.restored)), '保険から もどした 坑道の 一覧').toEqual(wantKodo);
    expect(hookCave(SEED, { oldCols: again.restored.oldCols }).oldCols('heya')).toBe(want.length);
  }, 60_000);

  it('ファイルに 書き出して 読みこんでも 部屋の 一覧が 同じ', async () => {
    const { db, store } = await openFile(f);
    const { restored, save } = await openGame(db, store);
    const want = sorted(heyaOf(restored));
    expect(want.length).toBe((await keysOf(db)).size);
    await save.now();
    const db2 = new MemoryBackend();
    await importSave(db2, SAVE_ID, await exportSave(db, SAVE_ID), SEED);
    expect(sorted(heyaOf((await openGame(db2, new MemoryStore())).restored))).toEqual(want);
  });
});

describe('D9: 版 5 の fixture で 1C の 形の まま', () => {
  const f = FIXTURES[0];
  it('部屋の かからない 列は 1C の あとと 同じ〔1C の あとの ハッシュ〕・はじまりの 坑道は 1C の まま〔なかほどの 横穴は 古い 列が かかる ので つなぎかえず end は cave〕・行き来 できる', async () => {
    const { db, store } = await openFile(f);
    const { restored } = await openGame(db, store);
    const gold = golden();
    // MINE-1E の 準備で 直した: 「1C の あとと 同じ」は 1C・1D の 作り方の 世界〔1E の 古い 列を スタートの まわり ぜんぶに した `legacyWith`〕で 見る
    const legacy = legacyWith(SEED, restored.oldCols);
    const h = hookCave(SEED, { oldCols: legacy });
    needCaveHook(h, ['startShaft', 'isOld', 'caves', 'shafts', 'shaftPath']);
    const start = h.startShaft();
    // はじまりの 坑道: 1C の あとと 同じ〔横穴の 先も end も 道も〕。古い 列が かかる 横穴は つなぎかえない
    expect(start.id).toBe(gold.start.id);
    expect(h.shaftPath(start.id).length, '道の 長さ').toBe(gold.start.pathLength);
    expect(pathHash(h.shaftPath(start.id)), 'shaftPath が 1C の まま').toBe(gold.start.pathHash);
    expect(sidesOf(start).map((d) => d.end), 'はじまりの 坑道の end').toEqual(gold.start.sides.map((d) => d.end));
    const naka = start.sides.filter((d) => d.layer === 'nakahodo');
    const topY = Math.max(...naka.map((d) => d.from.y));
    for (const d of naka.filter((x) => x.from.y === topY)) {
      expect(d.end, 'つなぎかえない').not.toBe('heya');
      expect(d.end === 'heya').toBe(false);
    }
    // 部屋の かからない 列は 1C の あとと 同じ〔部屋の まわり 4 マスと 坑道の へやの 横穴の 列は のぞく〕
    const sp = spawnOf(SEED);
    const skip = new Set<string>();
    const E = 4;
    for (const c of h.caves(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535)) {
      const b = c.box;
      for (let cz = (b.z0 - E) >> 4; cz <= (b.z1 + E) >> 4; cz++) for (let cx = (b.x0 - E) >> 4; cx <= (b.x1 + E) >> 4; cx++) skip.add(`${cx},${cz}`);
    }
    for (const sh of h.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535)) {
      if (!sh.sides.some((d) => d.end === 'heya')) continue;
      for (let cz = (sh.box.z0 - 16) >> 4; cz <= (sh.box.z1 + 16) >> 4; cz++) for (let cx = (sh.box.x0 - 16) >> 4; cx <= (sh.box.x1 + 16) >> 4; cx++) skip.add(`${cx},${cz}`);
    }
    let compared = 0;
    for (const [k, want] of Object.entries(gold.columns)) {
      if (skip.has(k)) continue;
      const [cx, cz] = k.split(',').map(Number) as [number, number];
      expect(columnHash(genColumn(SEED, cx, cz, legacy)), `列 (${k}) が 1C の あとと ちがう`).toBe(want);
      compared++;
    }
    expect(compared, '1C の あとと くらべた 列').toBeGreaterThan(Object.keys(gold.columns).length / 2);
    // 入口と 横穴の 先が 行き来 できる
    const g = new GenCols(SEED, legacy);
    const box = { x0: start.box.x0 - 12, x1: start.box.x1 + 12, z0: start.box.z0 - 12, z1: start.box.z1 + 12 };
    for (const d of naka.filter((x) => x.from.y === topY)) expect(bothWays(g, { x: start.entrance.x, y: start.entrance.y, z: start.entrance.z }, d.to, box), '入口と 横穴の 先').toBe(true);
  }, 240_000);

  it('4 版: 古い 列が かかる 坑道の へやの 横穴は 1C の まま〔古い 列が ない 新しい 世界では つなぐ 横穴を もつ 坑道を、その 箱の 列ぜんぶ 古い 列に して 開くと shaftPath・end が 1C の あとと 同じ〕', () => {
    const gold = golden();
    const fresh = hookCave(SEED, { oldCols: legacyOld(SEED) }); // 1E の 前の 世界〔上と 同じ 理由〕
    needCaveHook(fresh, ['shafts', 'shaftPath']);
    const sp = spawnOf(SEED);
    const live = new Map(fresh.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535).map((x) => [x.id, x] as const));
    const withHeya = gold.shafts.filter((x) => live.get(x.id)?.sides.some((d) => d.end === 'heya'));
    expect(withHeya.length, '1C の 見本の 坑道の 中で 1D で 横穴が 部屋に つながる 物').toBeGreaterThan(0);
    // 古い 列に ならない 坑道は 1C の あとと 同じ形〔横穴が 部屋に つながらない 坑道〕
    for (const x of gold.shafts) {
      const sh = live.get(x.id);
      if (!sh || sh.sides.some((d) => d.end === 'heya')) continue;
      expect(pathHash(fresh.shaftPath(x.id)), `${x.id}: つなぐ 横穴の ない 坑道は 1C の まま`).toBe(x.pathHash);
    }
    for (const x of withHeya) {
      const heya = new Set<number>();
      for (let cz = (x.box.z0 - 16) >> 4; cz <= (x.box.z1 + 16) >> 4; cz++) for (let cx = (x.box.x0 - 16) >> 4; cx <= (x.box.x1 + 16) >> 4; cx++) heya.add(colKey(cx, cz));
      const old = hookCave(SEED, { oldCols: { kodo: new Set<number>(), heya, boken: legacyOld(SEED).boken } });
      const sh = old.shafts(x.box.x0, x.box.z0, x.box.x1, x.box.z1).find((y) => y.id === x.id);
      expect(sh, `${x.id} が ある`).toBeDefined();
      expect(sh!.sides.map((d) => d.end), `${x.id}: 古い 列が かかる 横穴は end が 1C の まま`).toEqual(x.sides.map((d) => d.end));
      expect(pathHash(old.shaftPath(x.id)), `${x.id}: shaftPath が 1C の まま`).toBe(x.pathHash);
    }
  }, 240_000);
});

describe('D9: 保険〔PENDING_KEY〕・meta が ない／こわれて いる・新しい 世界', () => {
  it('meta が ない・gen が こわれて いる → 版 3 と みなして 部屋の 一覧も 坑道の 一覧も 保存の 列 ぜんぶ', async () => {
    for (const make of [(db: MemoryBackend) => void db.metas.delete(SAVE_ID), (db: MemoryBackend) => void db.metas.set(SAVE_ID, { v: SAVE_VERSION, seed: SEED, gen: 'x' } as never)]) {
      const { db, store } = await openFile(FIXTURES[0]);
      make(db);
      const stored = await keysOf(db);
      const { restored } = await openGame(db, store);
      expect(sorted(heyaOf(restored))).toEqual(sorted(stored));
      expect(sorted(kodoOf(restored))).toEqual(sorted(stored));
    }
  });

  it('新しい 世界: 一覧は 空・新しい 列を 保存しても ふえない', async () => {
    const db = new MemoryBackend();
    const store = new MemoryStore();
    const { world, restored, save } = await openGame(db, store);
    expect(heyaOf(restored).size).toBe(0);
    world.loadColumn(genColumn(SEED, 30, 30));
    expect(world.setBlock(30 * 16 + 1, 300, 30 * 16 + 1, 'stone')).toBe(true);
    await save.now();
    const meta = await metaOf(db);
    expect(meta.gen).toBe(SAVE_GEN);
    expect(meta.oldCols?.heya ?? []).toEqual([]);
    expect(heyaOf((await openGame(db, store)).restored).size).toBe(0);
  });
});

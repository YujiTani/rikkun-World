import { readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { GEN_CONFIG } from '../world/gen/config';
import { hookE } from '../world/gen/mineBokenKit';
import { genColumn, type OldCols } from '../world/gen/mineShaftKit';
import { GOLDEN_E_SEEDS, goldenE, pathHashNoYakata } from '../world/gen/mineYakataGolden';
import { hookF, needYakataHook, tableOf } from '../world/gen/mineYakataKit';
import { makeRig, pickBoth, type YakataRig } from '../world/gen/mineYakataRig';
import { gateCells, yakataBox } from '../world/gen/mineYakataReport';
import { spawnOf } from '../world/gen/terrain';
import { colKey } from '../world/stream/ring';
import { MemoryBackend, SAVE_ID } from './backend';
import * as Gens from './gens';
import { exportSave, importSave } from './portable';
import { SAVE_GEN, SaveManager, type KeyValueStore } from './SaveManager';
import { restoreStoredWorld } from './restore';
import type { SaveBlockOverride } from './saveOverride';
import { openStoredKeys, type StreamRestore } from './streamRestore';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.9・§4.7 の 6・受け入れ基準 F9・F10・F11 の 保存と 版）: 保存の 版を 7 → 8〔やかたの 版〕に 上げる。古い 列の 一覧〔やかた〕を 持つ。
 *   ・版 `YAKATA_GEN` ＝ 8〔src/save/gens.ts〕。新しい 世界の 窓口: やかたの 古い 列 0・`saveGens().yakata` が 版。
 *   ・版 7 の fixture `__fixtures__/world-v7-seed20261012.rikkun.gz`〔1F の 前の main = 1E 入りで 作った 新しい 世界。はじまりの 坑道と 近くの ふかい 1E の 坑道の 道の 列〕:
 *     開くと やかたの 一覧が 保存の 列ぜんぶ・保存すると meta の 版が 今の 版・一覧の 大きさは 列 1 つに つき 12 バイト 以下・やかたが 古い 列に かかる 坑道は `yakata` null・
 *     ほかの 1E の 坑道の `shaftPath`〔'yakata' を のぞく〕は 1F の 前と 同じ〔`mine1e-before.json`〕。
 *   ・挑戦の 間の 保存: 保存に 書く ブロック〔`hook.yakataSaveOverrides()`＝ 今ある `saveOverrides`〔src/save/saveOverride.ts〕の 形 `{ x, y, z, live, save }[]`〕は 挑戦の 間だけ 門 12 マス〔live あやしいかべ → save air〕・宝箱 2 マス〔live あいた 形 → save しまった 形〕を 返し、ふだん・かった あと・まけた あとは []。かった あと・まけた あとは 書きかえ なし。
 *   ・見た目の くじは 保存しない: 古い 列を もつ 世界でも やかたの `look` は 同じ。かった あとの 世界を 開きなおすと `katta`〔宝箱の ブロックで 持つ〕。
 * 【fixture の 作り方】 1F の 実装の 前の main〔1E 入り。SAVE_GEN 7〕で:
 *     MAKE_V7_FIXTURE=1 LANG=C.UTF-8 npx vitest run src/save/mine1fSave.test.ts
 *   〔1F を 入れた あとでは 作らない。作りなおす ときは 1E 入りの main に 戻して〕。
 * 【テスト側の 読み】古い 列の 一覧は `StreamRestore.oldCols.yakata`〔colKey の 集まり〕・窓口 `oldCols('yakata')`・`isOld('yakata', cx, cz)`・`saveGens().yakata`・`yakataSaveOverrides`。
 */

vi.setConfig({ testTimeout: 900_000 });

const SEED = GEN_CONFIG.defaultSeed;
const FIXTURE = 'world-v7-seed20261012.rikkun.gz';
const fixtureUrl = (file: string): URL => new URL(`./__fixtures__/${file}`, import.meta.url);
const g = Gens as unknown as Record<string, unknown>;

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}
type Restored = StreamRestore & { oldCols?: OldCols & { yakata?: ReadonlySet<number> } };

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
/** ふだんの 起動と 同じ 順〔restoreStoredWorld → SaveManager〕。`world` を 渡すと その 世界の 変更を 保存する〔お手本 mine1bSave.test.ts〕 */
async function openRestored(db: MemoryBackend, store: MemoryStore, world: ArrayVoxelWorld, saveOverrides?: () => SaveBlockOverride[]) {
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
    ...(saveOverrides ? { saveOverrides } : {}),
  });
  save.load();
  return { world, restored, save };
}
const keysOf = async (db: MemoryBackend): Promise<Set<number>> => new Set((await db.readKeys(SAVE_ID)).keys.map((k) => colKey(k.cx, k.cz)));
const sorted = (xs: Iterable<number>): number[] => [...xs].sort((a, b) => a - b);
const sizeOf = (m: unknown): number => JSON.stringify(m).length;
async function openFile(): Promise<{ db: MemoryBackend; store: MemoryStore }> {
  const db = new MemoryBackend();
  await importSave(db, SAVE_ID, new Uint8Array(readFileSync(fixtureUrl(FIXTURE))), SEED);
  return { db, store: new MemoryStore() };
}

// ------------------------------------------------------------------ fixture を 作る〔1F の 前の main だけ〕

describe('fixture を 作る', () => {
  it.skipIf(!process.env['MAKE_V7_FIXTURE'])('版 7 の fixture を 作る〔1E 入りの main で 1 回〕', async () => {
    expect(SAVE_GEN, 'この 作り方は 版 7 の ときだけ').toBe(7);
    const db = new MemoryBackend();
    const store = new MemoryStore();
    const { world, restored, save } = await openGame(db, store);
    const sp = spawnOf(SEED);
    const h = hookE(SEED);
    const start = h.startShaft();
    const deep = h
      .shafts(sp.x - 2048, sp.z - 2048, sp.x + 2047, sp.z + 2047)
      .filter((x) => !x.start && x.gen === 'e' && x.style?.depth === 'fukai')
      .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z))
      .slice(0, 6);
    const cols = new Map<number, { cx: number; cz: number }>();
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) cols.set(colKey((sp.x >> 4) + dx, (sp.z >> 4) + dz), { cx: (sp.x >> 4) + dx, cz: (sp.z >> 4) + dz });
    for (const c of h.shaftPath(start.id).filter((_, i) => i % 4 === 0)) cols.set(colKey(c.x >> 4, c.z >> 4), { cx: c.x >> 4, cz: c.z >> 4 });
    // ふかい 坑道: やかたは いちばん 下の 階の 本道・ひろばの かべに 口が ある ので、その 階の 道の 列と となりの 列〔まわり 2 マスの 余白の ぶん〕を 入れる
    for (const d of deep) {
      const path = h.shaftPath(d.id);
      const low = Math.min(...path.map((c) => c.y));
      const seen = new Set<number>();
      for (const c of path.filter((q) => q.y <= low + 1)) {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const cx = (c.x >> 4) + dx;
          const cz = (c.z >> 4) + dz;
          const k = colKey(cx, cz);
          if (seen.has(k) || seen.size >= 160) continue;
          seen.add(k);
          cols.set(k, { cx, cz });
        }
      }
    }
    for (const c of cols.values()) world.loadColumn(genColumn(SEED, c.cx, c.cz, restored.oldCols));
    world.resetSaveTracking();
    for (const c of cols.values()) expect(world.setBlock(c.cx * 16 + 1, 300, c.cz * 16 + 1, 'stone')).toBe(true);
    await save.now();
    writeFileSync(fixtureUrl(FIXTURE), await exportSave(db, SAVE_ID));
    expect((await keysOf(db)).size).toBeGreaterThan(60);
  }, 900_000);
});

// ------------------------------------------------------------------ 版

describe('F9: 保存の 版', () => {
  it('YAKATA_GEN は 8・SAVE_GEN は それ いじょう', () => {
    expect(g['YAKATA_GEN'], '窓口が ない: src/save/gens.ts の YAKATA_GEN').toBe((Gens.BOKEN_GEN as number) + 1); // 仕様 §4.9: 1E の 7 から 1 つ 上げる〔マージの 順で かわれば 1 つずつ〕
    expect(SAVE_GEN).toBeGreaterThanOrEqual(8);
  });

  it('新しい 世界の 窓口: やかたの 古い 列 0・isOld は いつも false・saveGens の yakata は 版', () => {
    const h = hookF(SEED);
    needYakataHook(h, ['saveGens', 'oldCols', 'isOld']);
    expect(h.oldCols('yakata')).toBe(0);
    expect(h.isOld('yakata', 4, 4)).toBe(false);
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, kodo: Gens.KODO_GEN, heya: Gens.HEYA_GEN, boken: Gens.BOKEN_GEN, yakata: g['YAKATA_GEN'] });
  });
});

// ------------------------------------------------------------------ 版 7 の fixture

describe('F9: 版 7 の fixture〔1E 入り〕の 古い 保存', () => {
  it('開く: やかたの 一覧が 保存の 列ぜんぶ・meta の 版は 7・窓口の oldCols／isOld が 一覧と 同じ', async () => {
    const { db, store } = await openFile();
    const stored = await keysOf(db);
    expect(stored.size, 'fixture の 列').toBeGreaterThan(60);
    const { restored, loaded } = await openGame(db, store);
    expect(loaded).toBe(true);
    expect(restored.meta?.gen).toBe(Gens.BOKEN_GEN);
    expect(sorted(restored.oldCols?.yakata ?? []), 'やかたの 古い 列').toEqual(sorted(stored));
    const h = hookF(SEED, { oldCols: restored.oldCols });
    needYakataHook(h, ['oldCols', 'isOld']);
    expect(h.oldCols('yakata')).toBe(stored.size);
    for (const k of (await db.readKeys(SAVE_ID)).keys) expect(h.isOld('yakata', k.cx, k.cz), `列 (${k.cx}, ${k.cz})`).toBe(true);
    expect(h.isOld('yakata', 900, 900), '保存に ない 列').toBe(false);
  });

  it('保存する: meta の 版が 今の 版・一覧の 大きさは 列 1 つに つき 12 バイト 以下。2 回 開いても 一覧は 同じ。ファイルに 書き出して 読みこんでも 同じ', async () => {
    const { db, store } = await openFile();
    const { save, restored } = await openGame(db, store);
    const want = sorted(restored.oldCols?.yakata ?? []);
    expect(want.length, '一覧は 保存の 列ぜんぶ〔からっぽで 通さない〕').toBe((await keysOf(db)).size);
    await save.now();
    const meta = ((await db.readKeys(SAVE_ID)).meta ?? {}) as Record<string, unknown>;
    expect(meta['gen']).toBe(SAVE_GEN);
    const fresh = new MemoryBackend();
    const f = await openGame(fresh, new MemoryStore());
    f.world.loadColumn(genColumn(SEED, 30, 30));
    f.world.setBlock(30 * 16 + 1, 300, 30 * 16 + 1, 'stone');
    await f.save.now();
    const base = sizeOf(((await fresh.readKeys(SAVE_ID)).meta ?? {}) as unknown);
    expect(sizeOf(meta) - base, `meta の 一覧の 大きさ〔列 ${want.length} こ〕`).toBeLessThanOrEqual(12 * want.length + 64);
    const again = await openGame(db, store);
    expect(sorted(again.restored.oldCols?.yakata ?? []), '2 回目').toEqual(want);
    const db2 = new MemoryBackend();
    await importSave(db2, SAVE_ID, await exportSave(db, SAVE_ID), SEED);
    expect(sorted((await openGame(db2, new MemoryStore())).restored.oldCols?.yakata ?? []), '書き出し').toEqual(want);
  });

  it('やかたが 古い 列に かかる 坑道は yakata null・かからない 坑道は 古い 列が なくても 同じ。ほかの 1E の shaftPath〔yakata を のぞく〕は 1F の 前と 同じ', async () => {
    const { db, store } = await openFile();
    const { restored } = await openGame(db, store);
    const old = restored.oldCols!.yakata!;
    expect(old.size).toBeGreaterThan(0);
    const sp = spawnOf(SEED);
    const half = 2048;
    const T = tableOf(SEED);
    const fresh = hookF(SEED);
    const withOld = hookF(SEED, { oldCols: restored.oldCols });
    needYakataHook(withOld, ['shafts', 'shaftPath']);
    const box = [sp.x - half, sp.z - half, sp.x + half - 1, sp.z + half - 1] as const;
    const A = new Map(fresh.shafts(...box).map((s) => [s.id, s] as const));
    let touched = 0;
    const bad: string[] = [];
    for (const s of withOld.shafts(...box)) {
      const a = A.get(s.id);
      if (!a || !a.yakata) continue;
      const b = yakataBox(a.yakata, T);
      let hits = false;
      for (let cx = (b.x0 - 2) >> 4; cx <= (b.x1 + 2) >> 4; cx++) for (let cz = (b.z0 - 2) >> 4; cz <= (b.z1 + 2) >> 4; cz++) if (old.has(colKey(cx, cz))) hits = true;
      if (hits) touched++;
      if (hits && s.yakata !== null) bad.push(`${s.id}: 古い 列に かかるのに yakata が ある`);
      if (!hits && JSON.stringify(s.yakata) !== JSON.stringify(a.yakata)) bad.push(`${s.id}: かからないのに yakata が ちがう`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ〔古い 列に かかった やかた ${touched}〕`).toEqual([]);
    expect(touched, 'fixture の 古い 列に かかる やかたが ある〔ない なら main の 1E 入りで 底の 階まで 入れて 作りなおす〕').toBeGreaterThan(0);
    // ほかの 1E の 坑道の 道は 1F の 前と 同じ〔ハッシュ〕
    const gold = goldenE().seeds[String(GOLDEN_E_SEEDS[0])]!;
    expect(SEED, 'この 見本の シード').toBe(GOLDEN_E_SEEDS[0]);
    const want = new Map(gold.shafts.map((s) => [s.id, s] as const));
    let compared = 0;
    for (const s of withOld.shafts(sp.x - 2048, sp.z - 2048, sp.x + 2047, sp.z + 2047)) {
      const w = want.get(s.id);
      if (!w || !w.pathHash || s.gen !== 'e') continue;
      compared++;
      expect(pathHashNoYakata(withOld.shaftPath(s.id)), s.id).toBe(w.pathHash);
    }
    expect(compared, '見本と くらべた 坑道').toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ 挑戦の 間の 保存・かった あと

describe('F9: 挑戦の 間の 保存は 挑戦の 前の 形・かった あとは 開きなおして katta・見た目は かわらない', () => {
  let rows: ReturnType<typeof pickBoth> = [];
  beforeAll(() => {
    rows = pickBoth();
  }, 1200_000);

  const overridesOf = (r: YakataRig): SaveBlockOverride[] => {
    const f = (r.hook as unknown as { yakataSaveOverrides?: () => SaveBlockOverride[] }).yakataSaveOverrides;
    if (typeof f !== 'function') throw new Error('窓口が まだ ない: yakataSaveOverrides');
    return f.call(r.hook);
  };

  it('yakataSaveOverrides: ふだんは []・挑戦の 間は 門 12 マス〔live あやしいかべ → save air〕と 宝箱 2 マス〔live あいた 形 → save しまった 形〕・かった あとは []', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    for (const row of rows) {
      const r = makeRig(row);
      expect(overridesOf(r), 'まだ').toEqual([]);
      const gate = gateCells(r.y, r.T);
      const cells = [...gate, ...r.y.chest.cells];
      const before = cells.map((c) => String(r.world.getBlock(c.x, c.y, c.z)));
      r.stand(1, { x: r.y.hall.x0 + 8, y: r.y.hall.y, z: r.y.hall.z0 + 8 });
      r.open();
      const ov = overridesOf(r);
      expect(ov, '挑戦の 間').toHaveLength(cells.length);
      cells.forEach((c, i) => {
        const o = ov.find((q) => q.x === c.x && q.y === c.y && q.z === c.z);
        expect(o, `(${c.x}, ${c.y}, ${c.z})`).toBeDefined();
        expect(o!.live, 'いま 世界に ある ブロック').toBe(String(r.world.getBlock(c.x, c.y, c.z)));
        expect(o!.save, '保存する ブロック').toBe(before[i]);
      });
      for (const id of r.foes().map((q) => q.id)) r.yokai.kill(id);
      r.step();
      expect(r.hook.yakataState(r.y.id).state).toBe('katta');
      expect(overridesOf(r), 'かった あと').toEqual([]);
    }
  });

  it('挑戦の 間に 保存〔ふつうの 保存〕→ 開きなおすと〔restoreStoredWorld〕門 空気・宝箱 しまった 形・mada', async () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    for (const row of rows) {
      const r = makeRig(row);
      const cells = [...gateCells(r.y, r.T), ...r.y.chest.cells];
      const before = cells.map((c) => String(r.world.getBlock(c.x, c.y, c.z)));
      r.world.resetSaveTracking();
      r.stand(1, { x: r.y.hall.x0 + 8, y: r.y.hall.y, z: r.y.hall.z0 + 8 });
      r.open();
      expect(r.hook.yakataState(r.y.id).state).toBe('chosen');
      const db = new MemoryBackend();
      const store = new MemoryStore();
      const g = await openRestored(db, store, r.world, () => overridesOf(r));
      await g.save.now();
      const again = await openRestored(db, store, new ArrayVoxelWorld({ x: 0, z: 0 }));
      cells.forEach((c, i) => expect(String(again.world.getBlock(c.x, c.y, c.z)), `保存 (${c.x}, ${c.y}, ${c.z})`).toBe(before[i]));
      expect(hookF(r.seed, { world: again.world } as never).yakataState(r.y.id), '開きなおして').toMatchObject({ state: 'mada', left: 0, foes: [], floating: null });
    }
  });

  it('挑戦の 間に ページを 閉じる〔pagehide の 保険。PENDING_KEY〕→ 保険から もどすと 挑戦の 前の 形', async () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    for (const row of rows) {
      const r = makeRig(row);
      const cells = [...gateCells(r.y, r.T), ...r.y.chest.cells];
      const before = cells.map((c) => String(r.world.getBlock(c.x, c.y, c.z)));
      r.world.resetSaveTracking();
      r.stand(1, { x: r.y.hall.x0 + 8, y: r.y.hall.y, z: r.y.hall.z0 + 8 });
      r.open();
      const db = new MemoryBackend();
      const store = new MemoryStore();
      const g = await openRestored(db, store, r.world, () => overridesOf(r));
      db.failWrites = true;
      const handlers = new Map<string, () => void>();
      g.save.bindPageEvents({ addEventListener: (t: string, fn: () => void) => handlers.set(t, fn), removeEventListener: () => undefined } as never, { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined } as never);
      handlers.get('pagehide')!();
      expect([...store.data.keys()].some((k) => k.includes('pending')), '保険が 置かれた').toBe(true);
      db.failWrites = false;
      // 書きこみが しっぱいした ので db は 空。保険の マスが 当たる ように、門と 宝箱の 列を 先に 世界に 入れ、挑戦の 間の 形に して おく
      const w = new ArrayVoxelWorld({ x: 0, z: 0 });
      const colsDone = new Set<number>();
      for (const c of cells) {
        const k = colKey(c.x >> 4, c.z >> 4);
        if (!colsDone.has(k)) {
          colsDone.add(k);
          w.loadColumn(genColumn(r.seed, c.x >> 4, c.z >> 4));
        }
      }
      for (const c of cells) w.setBlock(c.x, c.y, c.z, r.world.getBlock(c.x, c.y, c.z) as never);
      const back = await openRestored(db, store, w);
      expect(back.restored.fromPending, '保険から もどした').toBe(true);
      cells.forEach((c, i) => expect(String(back.world.getBlock(c.x, c.y, c.z)), `保険 (${c.x}, ${c.y}, ${c.z})`).toBe(before[i]));
    }
  });

  it('かった あとの 世界を 開きなおす〔同じ ブロックの 世界〕と katta・まけた あとは mada・look は くりかえしても 同じ', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    for (const row of rows) {
      const r = makeRig(row);
      r.open();
      for (const id of r.foes().map((q) => q.id)) r.yokai.kill(id);
      r.step();
      const reopened = hookF(r.seed, { world: r.world, chest: undefined, yakata: undefined } as never);
      expect(reopened.yakataState(r.y.id).state, '開きなおして').toBe('katta');
      const r2 = makeRig(row);
      r2.open();
      r2.players[0]!.dead = true;
      r2.step();
      expect(hookF(r2.seed, { world: r2.world } as never).yakataState(r2.y.id).state, 'まけた あと').toBe('mada');
      expect(hookF(r.seed).yakataPlanFor(r.row.shaft.id)?.yakata.look, 'look').toBe(r.y.look);
    }
  });
});

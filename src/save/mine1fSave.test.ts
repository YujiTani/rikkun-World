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
import { gateIds, makeRig, pickBoth, type YakataRig } from '../world/gen/mineYakataRig';
import { gateCells, yakataBox } from '../world/gen/mineYakataReport';
import { spawnOf } from '../world/gen/terrain';
import { colKey } from '../world/stream/ring';
import { MemoryBackend, SAVE_ID } from './backend';
import * as Gens from './gens';
import { exportSave, importSave } from './portable';
import { SAVE_GEN, SaveManager, type KeyValueStore } from './SaveManager';
import { openStoredKeys, type StreamRestore } from './streamRestore';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.9・§4.7 の 6・受け入れ基準 F9・F10・F11 の 保存と 版）: 保存の 版を 7 → 8〔やかたの 版〕に 上げる。古い 列の 一覧〔やかた〕を 持つ。
 *   ・版 `YAKATA_GEN` ＝ 8〔src/save/gens.ts〕。新しい 世界の 窓口: やかたの 古い 列 0・`saveGens().yakata` が 版。
 *   ・版 7 の fixture `__fixtures__/world-v7-seed20261012.rikkun.gz`〔1F の 前の main = 1E 入りで 作った 新しい 世界。はじまりの 坑道と 近くの ふかい 1E の 坑道の 道の 列〕:
 *     開くと やかたの 一覧が 保存の 列ぜんぶ・保存すると meta の 版が 今の 版・一覧の 大きさは 列 1 つに つき 12 バイト 以下・やかたが 古い 列に かかる 坑道は `yakata` null・
 *     ほかの 1E の 坑道の `shaftPath`〔'yakata' を のぞく〕は 1F の 前と 同じ〔`mine1e-before.json`〕。
 *   ・挑戦の 間の 保存: 保存に 書く ブロック〔`yakataSavePatch(x, y, z)`〕は 門の かべ・宝箱の あいた 形を 挑戦の 前の ブロックに もどす。かった あと・まけた あとは 書きかえ なし。
 *   ・見た目の くじは 保存しない: 古い 列を もつ 世界でも やかたの `look` は 同じ。かった あとの 世界を 開きなおすと `katta`〔宝箱の ブロックで 持つ〕。
 * 【fixture の 作り方】 1F の 実装の 前の main〔1E 入り。SAVE_GEN 7〕で:
 *     MAKE_V7_FIXTURE=1 LANG=C.UTF-8 npx vitest run src/save/mine1fSave.test.ts
 *   〔1F を 入れた あとでは 作らない。作りなおす ときは 1E 入りの main に 戻して〕。
 * 【テスト側の 読み】古い 列の 一覧は `StreamRestore.oldCols.yakata`〔colKey の 集まり〕・窓口 `oldCols('yakata')`・`isOld('yakata', cx, cz)`・`saveGens().yakata`・`yakataSavePatch`。
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
      .slice(0, 4);
    const cols = new Map<number, { cx: number; cz: number }>();
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) cols.set(colKey((sp.x >> 4) + dx, (sp.z >> 4) + dz), { cx: (sp.x >> 4) + dx, cz: (sp.z >> 4) + dz });
    for (const [s, cap] of [[start, 60], ...deep.map((d) => [d, 40] as const)] as const) {
      const seen = new Set<number>();
      for (const c of h.shaftPath(s.id).filter((_, i) => i % 4 === 0)) {
        const k = colKey(c.x >> 4, c.z >> 4);
        if (seen.has(k) || seen.size >= cap) continue;
        seen.add(k);
        cols.set(k, { cx: c.x >> 4, cz: c.z >> 4 });
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
    expect(g['YAKATA_GEN'], '窓口が ない: src/save/gens.ts の YAKATA_GEN').toBe(8);
    expect(SAVE_GEN).toBeGreaterThanOrEqual(8);
  });

  it('新しい 世界の 窓口: やかたの 古い 列 0・isOld は いつも false・saveGens の yakata は 版', () => {
    const h = hookF(SEED);
    needYakataHook(h, ['saveGens', 'oldCols', 'isOld']);
    expect(h.oldCols('yakata')).toBe(0);
    expect(h.isOld('yakata', 4, 4)).toBe(false);
    expect(h.saveGens()).toMatchObject({ current: SAVE_GEN, kodo: 5, heya: 6, boken: 7, yakata: g['YAKATA_GEN'] });
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
    expect(restored.meta?.gen).toBe(7);
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
    expect(sizeOf(meta) - base, `meta の 一覧の 大きさ〔列 ${want.length} こ〕`).toBeLessThanOrEqual(12 * want.length * 2 + 64);
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
  const patch = (r: YakataRig, p: { x: number; y: number; z: number }): string | null => (r.hook as unknown as { yakataSavePatch?: (x: number, y: number, z: number) => string | null }).yakataSavePatch?.(p.x, p.y, p.z) ?? null;
  const need = (r: YakataRig): void => {
    if (typeof (r.hook as unknown as Record<string, unknown>)['yakataSavePatch'] !== 'function') throw new Error('窓口が まだ ない: yakataSavePatch');
  };

  it('挑戦の 間: 門の 12 マス・宝箱の 2 マスの 保存用の ブロックは 挑戦の 前の ブロック。かった あとは 書きかえ なし', () => {
    expect(rows.length, 'やかたが ない').toBeGreaterThan(0);
    for (const row of rows) {
      const r = makeRig(row);
      const gate = gateCells(r.y, r.T);
      const cells = [...gate, ...r.y.chest.cells];
      const before = cells.map((c) => String(r.world.getBlock(c.x, c.y, c.z)));
      r.stand(1, { x: r.y.hall.x0 + 8, y: r.y.hall.y, z: r.y.hall.z0 + 8 });
      r.open();
      need(r);
      expect(r.hook.yakataState(r.y.id).state).toBe('chosen');
      cells.forEach((c, i) => expect(patch(r, c), `挑戦の 間 (${c.x}, ${c.y}, ${c.z})`).toBe(before[i]));
      expect(gateIds(r).every((id) => id !== 'air'), '門は 今 ふさがって いる').toBe(true);
      for (const id of r.foes().map((q) => q.id)) r.yokai.kill(id);
      r.step();
      expect(r.hook.yakataState(r.y.id).state, 'かった').toBe('katta');
      for (const c of cells) expect(patch(r, c), `かった あと (${c.x}, ${c.y}, ${c.z})`).toBeNull();
    }
  });

  it('かった あとの 世界を 開きなおす〔同じ ブロックの 世界〕と katta・まけた あとは mada・look は くりかえしても 同じ', () => {
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

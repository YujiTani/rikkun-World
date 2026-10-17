import { describe, expect, it } from 'vitest';
import type { Inventory, PlayerState, SpawnPoint } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { populateWorld } from '../world/gen/populate';
import { SAVE_ID, MemoryBackend, packColumn } from './backend';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { BLOCK_IDS_V1 } from './blockIdsV1';
import { deflateRaw, encodeSections, gzip } from './chunkCodec';
import { sectionToArray } from '../world/sections';
import { OLD_WORLD_FILE_MESSAGE, exportSave, importSave } from './portable';
import { PENDING_KEY, restoreStoredWorld } from './restore';
import {
  SaveManager,
  isBodyPlaceable,
  parseSaveOptions,
  stripResetParam,
  type KeyValueStore,
  type SaveBags,
} from './SaveManager';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error('quota');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const SEED = 12345;

interface Opts {
  ticks?: { n: number };
  bags?: SaveBags;
  clock?: { t: number; d: number };
  reset?: boolean;
  noDb?: boolean;
}

/** 1 回のページ表示に当たるもの（世界・持ち物・プレイヤー・保存係）を作る。main.ts と同じ順 */
async function session(store: KeyValueStore | null, db: MemoryBackend | null, o: Opts = {}) {
  const ticks = o.ticks ?? { n: 0 };
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  const island = populateWorld(world, SEED);
  world.resetSaveTracking();
  const restored = await restoreStoredWorld({ world, db, store, seed: SEED, saveId: SAVE_ID, reset: o.reset ?? false });
  let slots: unknown = { slots: [], selected: 0 };
  const inventory = {
    serialize: () => slots,
    deserialize: (d: unknown) => {
      slots = d;
    },
    clear: () => {
      slots = { slots: [], selected: 0 };
    },
  } as unknown as Inventory;
  const spawn: SpawnPoint = island.spawn();
  const state: PlayerState = {
    position: { x: spawn.x, y: spawn.y, z: spawn.z },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: spawn.yawDeg,
    pitchDeg: spawn.pitchDeg,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const clock = o.clock;
  const save = new SaveManager({
    world,
    seed: SEED,
    db,
    restored,
    inventory,
    player: {
      get: () => state,
      set: (v) => {
        Object.assign(state.position, v.position);
        Object.assign(state.velocity, v.velocity);
        state.yawDeg = v.yawDeg;
        state.pitchDeg = v.pitchDeg;
      },
    },
    spawn: () => island.spawn(),
    store,
    tick: () => ticks.n,
    settings: { saveIntervalTicks: 600 },
    bags: o.bags,
    clock: clock && {
      dayTick: () => clock.t,
      day: () => clock.d,
      set: (n: number) => void (clock.t = n),
      setDay: (n: number) => void (clock.d = n),
    },
  });
  const loaded = save.load();
  return { world, island, save, state, inventory, ticks, restored, loaded };
}

/** 前の世界の localStorage の保存のキー（VOX-B から 読まない・消さない） */
const LEGACY_KEY = `rikkun-world-save-v1-${SEED}`;
/** VOX-F より前の保存（高さ 48 の島との差分を localStorage に 1 本の JSON）。VOX-B から 読まれない */
function legacyText(edits: Array<[number, number, number, 'log' | 'sand' | 'stone']>): string {
  const blocks: number[] = [];
  edits.forEach(([x, y, z], k) => blocks.push((y * 128 + z) * 128 + x, k + 1));
  return JSON.stringify({
    version: 1,
    gen: 2,
    size: [128, 48, 128],
    seed: SEED,
    blocks,
    inventory: { slots: [null, { item: 'sand', count: 7 }], selected: 1 },
    player: { x: 6.5, y: 30, z: 6.5, yaw: 90, pitch: 0, third: false },
    bags: [],
    furnaces: [],
    armor: null,
    level: null,
    storage: null,
    achievements: null,
    farm: null,
    time: { day: 2, dayTick: 777 },
    tick: 99,
  });
}

describe('SaveManager（さわった列だけ丸ごと保存）', () => {
  it('保存して開き直すと、世界・持ち物・位置・向きが同じに戻る（AC1）', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db);
    a.world.setBlock(4, 10, 6, 'log');
    a.world.setBlock(0, 20, 0, 'sand');
    a.world.setBlock(100, 300, 90, 'stone'); // 遠い列
    a.inventory.deserialize({ slots: [null, { item: 'sand', count: 9 }], selected: 4 });
    a.state.position.x = 6.5;
    a.state.position.y = 300; // 空の中（地面の中だと 置き直される）
    a.state.position.z = 6.5;
    a.state.yawDeg = 180;
    a.state.pitchDeg = -20;
    await a.save.now();
    const hash = a.world.hash();

    const b = await session(store, db);
    expect(b.loaded).toBe(true);
    expect(b.restored.columns).toBe(2);
    expect(b.world.hash()).toBe(hash);
    expect(b.world.hashColumn(0, 0)).toBe(a.world.hashColumn(0, 0));
    expect(b.world.getBlock(100, 300, 90)).toBe('stone');
    expect(b.inventory.serialize()).toEqual({ slots: [null, { item: 'sand', count: 9 }], selected: 4 });
    expect(b.state.position).toEqual({ x: 6.5, y: 300, z: 6.5 });
    expect(b.state.yawDeg).toBe(180);
    expect(b.state.pitchDeg).toBe(-20);
    // 読んだだけの列は、まださわった列ではない
    expect(b.world.saveDirtyCount()).toBe(0);
  });

  it('さわった列だけ書く。島のままなら 列は 0 こ（AC2）', async () => {
    const db = new MemoryBackend();
    const a = await session(new MemoryStore(), db);
    await a.save.now();
    expect(a.save.info().dirtyChunks).toBe(0);
    expect(db.chunks.size).toBe(0);
    a.world.setBlock(1, 300, 1, 'stone');
    a.world.setBlock(2, 300, 2, 'stone'); // 同じ列
    a.world.setBlock(40, 300, 40, 'stone');
    await a.save.now();
    expect(a.save.info().dirtyChunks).toBe(2);
    expect([...db.chunks.keys()].sort()).toEqual([`${SAVE_ID}/0/0`, `${SAVE_ID}/2/2`]);
    expect(a.save.info().bytes).toBeGreaterThan(0);
    // 書き終わったので、もう さわった列はない
    await a.save.now();
    expect(a.save.info().dirtyChunks).toBe(0);
  });

  it('自動: 600 ステップごと、変わっていれば保存', async () => {
    const db = new MemoryBackend();
    const s = await session(new MemoryStore(), db);
    s.ticks.n = 100;
    await s.save.now();
    expect(s.save.info().lastSavedTick).toBe(100);
    s.world.setBlock(2, 300, 2, 'dirt');
    for (let t = 101; t < 700; t++) {
      s.ticks.n = t;
      s.save.update(t);
    }
    expect(s.save.info().lastSavedTick).toBe(100);
    s.ticks.n = 700;
    s.save.update(700);
    expect(s.save.info().lastSavedTick).toBe(700);
    await s.save.idle();
    for (let t = 701; t <= 1300; t++) {
      s.ticks.n = t;
      s.save.update(t);
    }
    expect(s.save.info().lastSavedTick).toBe(700);
  });

  it('ロックが外れたときなど: 変わっていなければ書かない、変わっていれば書く', async () => {
    const s = await session(new MemoryStore(), new MemoryBackend());
    await s.save.now();
    s.ticks.n = 50;
    s.save.saveIfChanged();
    expect(s.save.info().lastSavedTick).toBe(0);
    s.state.yawDeg = 90;
    s.save.saveIfChanged();
    expect(s.save.info().lastSavedTick).toBe(50);
    await s.save.idle();
  });

  it('?nosave: 読みも書きもしない', async () => {
    const db = new MemoryBackend();
    const s = await session(null, db);
    s.world.setBlock(2, 300, 2, 'dirt');
    await s.save.now();
    s.save.update(5000);
    expect(s.save.info().enabled).toBe(false);
    expect(s.save.info().lastSavedTick).toBeNull();
    expect(s.loaded).toBe(false);
    expect(db.writes).toBe(0);
  });

  it('IndexedDB が使えない（db が null）ときは 保存しないで遊べる', async () => {
    const s = await session(new MemoryStore(), null);
    s.world.setBlock(2, 300, 2, 'dirt');
    await s.save.now();
    expect(s.save.info().enabled).toBe(false);
  });

  it('?reset=1: 保存を消して 最初から。古い保存も もう読まない', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const fresh = (await session(new MemoryStore(), new MemoryBackend())).world.hash();
    store.data.set(LEGACY_KEY, legacyText([[2, 25, 2, 'stone']]));
    const a = await session(store, db);
    a.world.setBlock(2, 300, 2, 'stone');
    await a.save.now();
    expect(db.metas.size).toBe(1);
    const b = await session(store, db, { reset: true });
    expect(b.loaded).toBe(false);
    expect(b.world.hash()).toBe(fresh);
    expect(db.metas.size).toBe(0);
    expect(db.chunks.size).toBe(0);
    const c = await session(store, db); // リセットのあと 古い保存が よみがえらない
    expect(c.loaded).toBe(false);
    expect(c.world.hash()).toBe(fresh);
  });

  it('clear で IndexedDB が空になり、そのあとの保存で 今の世界が 丸ごと書き直される', async () => {
    const db = new MemoryBackend();
    const a = await session(new MemoryStore(), db);
    a.world.setBlock(2, 300, 2, 'dirt');
    await a.save.now();
    const hash = a.world.hash();
    await a.save.clear();
    expect(db.metas.size).toBe(0);
    await a.save.now();
    expect(a.save.info().dirtyChunks).toBe(64);
    const b = await session(new MemoryStore(), db);
    expect(b.world.hash()).toBe(hash);
  });

  it('こわれた列は その列だけ生成に戻る。ほかの列と meta は そのまま', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db);
    a.world.setBlock(2, 300, 2, 'dirt'); // 列 (0,0)
    a.world.setBlock(40, 300, 40, 'dirt'); // 列 (2,2)
    a.inventory.deserialize({ slots: [], selected: 3 });
    await a.save.now();
    const bad = db.chunks.get(`${SAVE_ID}/0/0`)!;
    bad.data = Uint8Array.of(1, 2, 3, 4, 5); // deflate として読めない
    const b = await session(store, db);
    expect(b.loaded).toBe(true);
    expect(b.restored.corrupt).toBe(1);
    expect(b.world.getBlock(2, 300, 2)).toBe('air'); // 生成に戻った
    expect(b.world.getBlock(40, 300, 40)).toBe('dirt');
    expect(b.inventory.serialize()).toEqual({ slots: [], selected: 3 });
    // 戻した列は、次の保存で 書き直される
    await b.save.now();
    expect(b.save.info().dirtyChunks).toBe(1);
  });

  it('形式の版が新しい列・高さがちがう列の扱い（v・h）', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db);
    a.world.setBlock(2, 300, 2, 'dirt');
    a.world.setBlock(40, 20, 40, 'dirt');
    await a.save.now();
    db.chunks.get(`${SAVE_ID}/0/0`)!.v = 0; // 読みかえの関数がない古い形式
    // 高さが低い保存: 上を空気で足す
    const col = a.world.column(2, 2)!;
    const low = await packColumn(2, 2, encodeSections(col.sections.slice(0, 2)), 2, 2);
    db.chunks.set(`${SAVE_ID}/2/2`, low);
    const b = await session(store, db);
    expect(b.restored.corrupt).toBe(1);
    expect(b.world.getBlock(2, 300, 2)).toBe('air');
    expect(b.world.getBlock(40, 20, 40)).toBe('dirt');
    expect(b.world.getBlock(40, b.world.size.y - 1, 40)).toBe('air');
  });

  it('新しい版の meta・ほかのシードの meta は さわらない。この遊びでは 保存しない（古いビルドで こわさない）', async () => {
    for (const edit of [(m: Record<string, unknown>) => (m.v = 2), (m: Record<string, unknown>) => (m.seed = 1)]) {
      const db = new MemoryBackend();
      const a = await session(new MemoryStore(), db);
      a.world.setBlock(2, 300, 2, 'dirt');
      await a.save.now();
      edit(db.metas.get(SAVE_ID)!);
      const metaBefore = JSON.stringify(db.metas.get(SAVE_ID));
      const b = await session(new MemoryStore(), db);
      expect(b.loaded).toBe(false);
      expect(b.restored.readOnly).toBe(true);
      expect(b.save.info().enabled).toBe(false);
      b.world.setBlock(3, 300, 3, 'stone');
      await b.save.now();
      expect(db.chunks.size).toBe(1);
      expect(JSON.stringify(db.metas.get(SAVE_ID))).toBe(metaBefore);
    }
  });

  it('meta だけこわれていても 列は読む（meta は初期値から）', async () => {
    const db = new MemoryBackend();
    const a = await session(new MemoryStore(), db);
    a.world.setBlock(2, 300, 2, 'dirt');
    await a.save.now();
    db.metas.delete(SAVE_ID);
    const b = await session(new MemoryStore(), db);
    expect(b.loaded).toBe(false);
    expect(b.restored.readOnly).toBeUndefined();
    expect(b.world.getBlock(2, 300, 2)).toBe('dirt');
    expect(db.chunks.size).toBe(1);
  });

  it('新しい形式の列があれば 何も上書きしない（保存しない）', async () => {
    const db = new MemoryBackend();
    const a = await session(new MemoryStore(), db);
    a.world.setBlock(2, 300, 2, 'dirt');
    await a.save.now();
    db.chunks.get(`${SAVE_ID}/0/0`)!.v = 99;
    const before = JSON.stringify([...db.chunks.values()].map((c) => [c.v, [...c.data]]));
    const b = await session(new MemoryStore(), db);
    expect(b.restored.readOnly).toBe(true);
    b.world.setBlock(40, 300, 40, 'stone');
    await b.save.now();
    expect(JSON.stringify([...db.chunks.values()].map((c) => [c.v, [...c.data]]))).toBe(before);
    expect(b.save.info().enabled).toBe(false);
  });

  it('大きな変更の早め保存は 失敗のあと くりかえさない', async () => {
    const db = new MemoryBackend();
    const s = await session(new MemoryStore(), db);
    s.world.fill(0, 20, 0, 40, 40, 40, 'dirt');
    db.failWrites = true;
    s.ticks.n = 1;
    s.save.update(1);
    await s.save.idle();
    expect(s.save.info().failures).toBe(1);
    for (let t = 2; t < 50; t++) {
      s.ticks.n = t;
      s.save.update(t);
    }
    await s.save.idle();
    expect(s.save.info().failures).toBe(1);
    db.failWrites = false;
    s.ticks.n = 700;
    s.save.update(700); // ふつうの間隔で やりなおす
    await s.save.idle();
    expect(s.save.info().writes).toBe(1);
  });

  it('書けなかったら 何も進まず、列は「さわった」に戻って 次の保存でやりなおす', async () => {
    const db = new MemoryBackend();
    const s = await session(new MemoryStore(), db);
    s.world.setBlock(2, 300, 2, 'dirt');
    db.failWrites = true;
    s.ticks.n = 10;
    await expect(s.save.now()).resolves.toBeUndefined();
    expect(s.save.info().failures).toBe(1);
    expect(db.chunks.size).toBe(0);
    expect(s.world.saveDirtyCount()).toBe(1);
    db.failWrites = false;
    await s.save.now();
    expect(db.chunks.size).toBe(1);
    expect(s.save.info().dirtyChunks).toBe(1);
  });

  it('もどした位置が ブロックと重なる・世界の外 なら スタート地点', async () => {
    for (const bad of [{ x: 6.5, y: 5, z: 6.5 }, { x: -3, y: 30, z: 6 }, { x: 6.5, y: -2, z: 6.5 }, { x: NaN, y: 30, z: 6 }]) {
      const store = new MemoryStore();
      const db = new MemoryBackend();
      const a = await session(store, db);
      a.state.position.x = bad.x;
      a.state.position.y = bad.y;
      a.state.position.z = bad.z;
      a.state.yawDeg = 33;
      await a.save.now();
      const b = await session(store, db);
      const sp = b.island.spawn();
      expect(b.state.position).toEqual({ x: sp.x, y: sp.y, z: sp.z });
      expect(b.state.yawDeg).toBe(sp.yawDeg);
    }
  });

  it('4 列＋meta の保存: メインスレッドの時間と書き終わり（記録）', async () => {
    const db = new MemoryBackend();
    const s = await session(new MemoryStore(), db);
    for (const [cx, cz] of [[1, 1], [3, 1], [1, 3], [3, 3]]) for (let i = 0; i < 40; i++) s.world.setBlock(cx * 16 + (i % 8), 28 + (i % 3), cz * 16 + 2, i % 2 ? 'stone' : 'log');
    await s.save.now();
    expect(s.save.info().dirtyChunks).toBe(4);
    // CI の機械でぶれるので 広めに見る（本当の目安は docs/perf-reports/VOX-F.md）
    expect(s.save.info().lastMs).toBeLessThan(50);
  });
});

describe('前の世界の保存は 読まない・消さない（VOX-B 基準 19）', () => {
  it('新しい saveId は main と seed-N のどちらでもない。save.info().saveId で聞ける', async () => {
    expect((await session(new MemoryStore(), new MemoryBackend())).save.info().saveId).toBe(SAVE_ID);
    expect(SAVE_ID).not.toBe('main');
    expect(SAVE_ID.startsWith('seed-')).toBe(false);
  });

  it('clear() は 前の世界（main）の pagehide の保険を 消さない。自分の保険は 消す', async () => {
    const store = new MemoryStore();
    const old = JSON.stringify({ saveId: 'main', ids: [], cells: [], meta: {} });
    store.data.set(PENDING_KEY, old);
    const a = await session(store, new MemoryBackend());
    await a.save.clear();
    expect(store.data.get(PENDING_KEY)).toBe(old);
    store.data.set(PENDING_KEY, JSON.stringify({ saveId: SAVE_ID, ids: [], cells: [], meta: {} }));
    await a.save.clear();
    expect(store.data.has(PENDING_KEY)).toBe(false);
  });

  it('古い localStorage の保存と main の IndexedDB が あっても 読まず、消さない', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const fresh = (await session(new MemoryStore(), new MemoryBackend())).world.hash();
    const legacy = legacyText([[4, 10, 6, 'log'], [100, 20, 90, 'sand']]);
    store.data.set(LEGACY_KEY, legacy);
    const oldMeta = { v: 1, gen: 2, seed: SEED, inventory: { slots: [null, { item: 'sand', count: 7 }], selected: 1 } };
    await db.write('main', [await packColumn(0, 0, encodeSections(new ArrayVoxelWorld({ x: 16, z: 16 }).column(0, 0)!.sections), 2, 3)], oldMeta as never);
    const a = await session(store, db);
    expect(a.loaded).toBe(false);
    expect(a.world.hash()).toBe(fresh);
    expect(a.world.getBlock(4, 10, 6)).not.toBe('log');
    expect(a.inventory.serialize()).toEqual({ slots: [], selected: 0 });
    // 遊んで 保存しても、前の世界は そのまま
    a.world.setBlock(4, 150, 6, 'log');
    await a.save.now();
    expect(store.data.get(LEGACY_KEY)).toBe(legacy);
    expect(db.metas.get('main')).toEqual(oldMeta);
    expect(db.chunks.get('main/0/0')!.gen).toBe(2);
    expect(db.metas.has(SAVE_ID)).toBe(true);
    // ?reset=1 は 新しい saveId だけを 消す
    const b = await session(store, db, { reset: true });
    expect(b.loaded).toBe(false);
    expect(db.metas.has(SAVE_ID)).toBe(false);
    expect(db.metas.get('main')).toEqual(oldMeta);
    expect(store.data.get(LEGACY_KEY)).toBe(legacy);
  });

  it('こわれた・版がちがう古い保存も さわらない', async () => {
    const good = JSON.parse(legacyText([[4, 10, 6, 'log']])) as Record<string, unknown>;
    for (const bad of ['not json', 'null', JSON.stringify({ ...good, version: 99 }), JSON.stringify({ ...good, seed: 1 }), JSON.stringify({ ...good, blocks: [1] })]) {
      const store = new MemoryStore();
      store.data.set(LEGACY_KEY, bad);
      const s = await session(store, new MemoryBackend());
      expect(s.loaded).toBe(false);
      expect(store.data.get(LEGACY_KEY)).toBe(bad);
    }
  });
});

describe('pagehide の保険（AC5）', () => {
  function hide(save: SaveManager) {
    const handlers: Array<() => void> = [];
    const win = { addEventListener: (_: string, f: () => void) => handlers.push(f), removeEventListener: () => {} };
    const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} };
    save.bindPageEvents(win as unknown as Window, doc as unknown as Document);
    handlers[0]();
  }

  it('IndexedDB に書けなかった変更が、次の起動で戻って 書かれ、保険は消える', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db);
    a.world.setBlock(2, 300, 2, 'dirt');
    await a.save.now(); // ここまでは書けた
    a.world.setBlock(3, 300, 3, 'stone');
    a.world.setBlock(40, 300, 40, 'stone');
    a.inventory.deserialize({ slots: [], selected: 5 });
    db.failWrites = true; // 閉じる途中で 書き終わらなかった
    hide(a.save);
    expect(store.data.has(PENDING_KEY)).toBe(true);
    expect(store.data.get(PENDING_KEY)!.length).toBeLessThan(20000);
    await a.save.idle();
    db.failWrites = false;

    const b = await session(store, db);
    expect(b.loaded).toBe(true);
    expect(b.world.getBlock(2, 300, 2)).toBe('dirt');
    expect(b.world.getBlock(3, 300, 3)).toBe('stone');
    expect(b.world.getBlock(40, 300, 40)).toBe('stone');
    expect(b.inventory.serialize()).toEqual({ slots: [], selected: 5 });
    await b.save.idle();
    expect(store.data.has(PENDING_KEY)).toBe(false);
    const c = await session(store, db); // IndexedDB にも 入った
    expect(c.world.hash()).toBe(b.world.hash());
  });

  it('書けたあとは 保険を 置かない・消す', async () => {
    const store = new MemoryStore();
    const a = await session(store, new MemoryBackend());
    a.world.setBlock(3, 300, 3, 'stone');
    hide(a.save);
    await a.save.idle();
    expect(store.data.has(PENDING_KEY)).toBe(false);
  });

  it('入りきらないほど変えたら 保険ではなく ふつうの保存をする', async () => {
    const db = new MemoryBackend();
    const s = await session(new MemoryStore(), db);
    s.world.fill(0, 20, 0, 40, 40, 40, 'dirt'); // 約 5 万マス
    expect(s.world.changeLogCount()).toBeGreaterThan(20000);
    s.ticks.n = 1;
    s.save.update(1);
    await s.save.idle();
    expect(db.writes).toBe(1);
    expect(s.world.changeLogCount()).toBe(0);
  });
});

describe('isBodyPlaceable', () => {
  it('ふれているだけは OK、めりこむと NG、世界の上にはみ出すのは OK', () => {
    const w = new ArrayVoxelWorld();
    w.fill(0, 8, 0, 12, 8, 12, 'stone');
    expect(isBodyPlaceable(w, { x: 2.5, y: 9, z: 6.5 })).toBe(true);
    expect(isBodyPlaceable(w, { x: 2.5, y: 8.5, z: 6.5 })).toBe(false);
    expect(isBodyPlaceable(w, { x: 0.3, y: 9, z: 6.5 })).toBe(true);
    expect(isBodyPlaceable(w, { x: 0.2, y: 9, z: 6.5 })).toBe(false);
    expect(isBodyPlaceable(w, { x: 2.5, y: 32, z: 6.5 })).toBe(true);
  });
});

describe('住所の設定', () => {
  it('?reset=1 と ?nosave=1 を読む', () => {
    expect(parseSaveOptions('')).toEqual({ reset: false, nosave: false });
    expect(parseSaveOptions('?reset=1')).toEqual({ reset: true, nosave: false });
    expect(parseSaveOptions('?seed=3&nosave=1')).toEqual({ reset: false, nosave: true });
    expect(parseSaveOptions('?reset=0')).toEqual({ reset: false, nosave: false });
  });

  it('reset だけを消す', () => {
    expect(stripResetParam('http://localhost:5173/?seed=3&reset=1')).toBe('/?seed=3');
    expect(stripResetParam('http://localhost:5173/?reset=1')).toBe('/');
  });
});

describe('SaveManager: おとしもの ぶくろ（M3 §2.10）', () => {
  function fakeBags(initial: Array<{ ticksLeft: number } & Record<string, unknown>>) {
    const b = {
      list: initial,
      serialize: () => b.list.map((x) => ({ ...x })),
      deserialize: (d: unknown) => {
        b.list = (d as typeof initial) ?? [];
      },
    };
    return b;
  }

  it('保存して開き直すと ふくろが戻る', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const bag = { x: 6.5, y: 9, z: 6.5, item: 'dirt', count: 3, ticksLeft: 30000 };
    const a = await session(store, db, { bags: fakeBags([bag]) });
    await a.save.now();
    const fb = fakeBags([]);
    const b = await session(store, db, { bags: fb });
    expect(b.loaded).toBe(true);
    expect(fb.list).toEqual([bag]);
  });

  it('のこりステップだけが変わっても「変わった」とは数えない', async () => {
    const db = new MemoryBackend();
    const fb = fakeBags([{ x: 1, y: 2, z: 3, item: 'dirt', count: 1, ticksLeft: 100 }]);
    const a = await session(new MemoryStore(), db, { bags: fb });
    await a.save.now();
    const n = db.writes;
    fb.list[0]!.ticksLeft = 50;
    a.save.saveIfChanged();
    await a.save.idle();
    expect(db.writes).toBe(n);
    fb.list = [];
    a.save.saveIfChanged();
    await a.save.idle();
    expect(db.writes).toBe(n + 1);
  });
});

describe('SaveManager 時刻', () => {
  it('時刻と何日目が続きから始まる', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    await (await session(store, db, { clock: { t: 5000, d: 3 } })).save.now();
    const c = { t: 1, d: 1 };
    expect((await session(store, db, { clock: c })).loaded).toBe(true);
    expect(c).toEqual({ t: 5000, d: 3 });
  });

  it('時刻のない meta は昼の始まり', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    await (await session(store, db)).save.now(); // clock なしで保存 = time なし
    const c = { t: 9, d: 9 };
    expect((await session(store, db, { clock: c })).loaded).toBe(true);
    expect(c).toEqual({ t: 0, d: 0 });
  });

  it('時刻だけの変化では書かず、ページをかくすときは書く', async () => {
    const db = new MemoryBackend();
    const c = { t: 100, d: 0 };
    const a = await session(new MemoryStore(), db, { clock: c });
    await a.save.now();
    const n = db.writes;
    c.t = 900;
    a.save.saveIfChanged();
    await a.save.idle();
    expect(db.writes).toBe(n);
    const handlers: Array<() => void> = [];
    const win = { addEventListener: (_: string, f: () => void) => handlers.push(f), removeEventListener: () => {} };
    const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} };
    a.save.bindPageEvents(win as unknown as Window, doc as unknown as Document);
    handlers[0]();
    await a.save.idle();
    expect(db.writes).toBe(n + 1);
    expect((db.metas.get(SAVE_ID)!.time as { dayTick: number }).dayTick).toBe(900);
  });
});

describe('SAVE-30: id の文字で読む保存', () => {
  const nowIds = BLOCK_TYPES.map((t) => t.id as string);

  async function pendingText(): Promise<Record<string, unknown>> {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db);
    a.world.setBlock(2, 300, 2, 'dirt');
    await a.save.now();
    a.world.setBlock(3, 300, 3, 'stone');
    a.world.setBlock(40, 300, 40, 'farmland');
    db.failWrites = true;
    const handlers: Array<() => void> = [];
    const win = { addEventListener: (_: string, f: () => void) => handlers.push(f), removeEventListener: () => {} };
    const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} };
    a.save.bindPageEvents(win as unknown as Window, doc as unknown as Document);
    handlers[0]();
    await a.save.idle();
    return JSON.parse(store.data.get(PENDING_KEY)!) as Record<string, unknown>;
  }

  async function restoreWith(p: Record<string, unknown>) {
    const store = new MemoryStore();
    store.data.set(PENDING_KEY, JSON.stringify(p));
    const db = new MemoryBackend();
    const b = await session(store, db);
    return b;
  }

  it('AC5: 保険に ids（書いたときの id の一覧）が入り、cells の番号はその一覧の番号', async () => {
    const p = await pendingText();
    expect(p.ids).toEqual(nowIds);
    const cells = p.cells as number[];
    const ids = p.ids as string[];
    expect(cells.length).toBe(8);
    expect(ids[cells[3]]).toBe('stone');
  });

  it('AC5: ids つきは その一覧で当たる。並び順のちがう表でも 同じ id', async () => {
    const p = await pendingText();
    const oldIds = p.ids as string[];
    const rev = [...oldIds].reverse();
    const cells = (p.cells as number[]).slice();
    for (let k = 3; k < cells.length; k += 4) cells[k] = rev.indexOf(oldIds[cells[k]]);
    const b = await restoreWith({ ...p, ids: rev, cells });
    expect(b.world.getBlock(3, 300, 3)).toBe('stone');
    expect(b.world.getBlock(40, 300, 40)).toBe('farmland');
  });

  it('AC5: ids なし（今のビルドが書いたもの）は BLOCK_IDS_V1 で読む', async () => {
    const p = await pendingText();
    const cells = (p.cells as number[]).slice();
    for (let k = 3; k < cells.length; k += 4) cells[k] = BLOCK_IDS_V1.indexOf(nowIds[cells[k]]);
    const { ids: _ids, ...rest } = p;
    void _ids;
    const b = await restoreWith({ ...rest, cells });
    expect(b.world.getBlock(3, 300, 3)).toBe('stone');
    expect(b.world.getBlock(40, 300, 40)).toBe('farmland');
  });

  it('AC5: 知らない id のマスは飛ばす。ほかのマスは当たる', async () => {
    const p = await pendingText();
    const ids = [...(p.ids as string[]), 'ghost_block'];
    const cells = (p.cells as number[]).slice();
    cells[3] = ids.length - 1; // 1 つめを 知らない id に
    const b = await restoreWith({ ...p, ids, cells });
    const first = { x: cells[0], y: cells[1], z: cells[2] };
    expect(b.world.getBlock(first.x, first.y, first.z)).not.toBe('ghost_block');
    expect(b.world.getBlock(40, 300, 40)).toBe('farmland');
    expect(b.world.getBlock(3, 300, 3) === 'stone' && first.x === 3).toBe(false);
  });

  it('AC4: 版 2 の列に知らない id → その列だけ生成に戻り corrupt 1。ほかの列は読める', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db);
    a.world.setBlock(2, 300, 2, 'dirt');
    a.world.setBlock(40, 300, 40, 'dirt');
    await a.save.now();
    const col = a.world.column(0, 0)!;
    const ghost = nowIds.map((id) => (id === 'dirt' ? 'ghost_block' : id));
    db.chunks.set(`${SAVE_ID}/0/0`, await packColumn(0, 0, encodeSections(col.sections, ghost), 2, col.sections.length));
    const b = await session(store, db);
    expect(b.restored.corrupt).toBe(1);
    expect(b.world.getBlock(2, 300, 2)).toBe('air');
    expect(b.world.getBlock(40, 300, 40)).toBe('dirt');
  });

  it('AC2: 版 1 の列（今のビルドが書いた形）が 同じブロックで読める。corrupt 0', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db);
    a.world.setBlock(2, 300, 2, 'dirt');
    a.world.setBlock(3, 300, 3, 'farmland');
    await a.save.now();
    // 版 1 で書きなおす: 番号を 凍らせた表の番号にして encode → 版 1 の生バイトに 戻す
    const col = a.world.column(0, 0)!;
    const v1 = encodeV1(col.sections);
    db.chunks.set(`${SAVE_ID}/0/0`, { cx: 0, cz: 0, v: 1, gen: 2, h: col.sections.length, data: await deflateRaw(v1) });
    const b = await session(store, db);
    expect(b.restored.corrupt).toBe(0);
    expect(b.world.getBlock(2, 300, 2)).toBe('dirt');
    expect(b.world.getBlock(3, 300, 3)).toBe('farmland');
    expect(b.world.hash()).toBe(a.world.hash());
    // さわると 版 2 で書きなおされる
    b.world.setBlock(4, 300, 4, 'stone');
    await b.save.now();
    expect(db.chunks.get(`${SAVE_ID}/0/0`)!.v).toBe(2);
  });

  it('AC8: ファイルに出して読む → 版 2 の列がそのまま戻る', async () => {
    const db = new MemoryBackend();
    const a = await session(new MemoryStore(), db);
    a.world.setBlock(2, 300, 2, 'dirt');
    a.world.setBlock(90, 12, 50, 'sprinkler');
    await a.save.now();
    const before = [...db.chunks.values()].map((c) => `${c.cx},${c.cz},${c.v},${[...c.data].join('.')}`).sort();
    expect([...db.chunks.values()].every((c) => c.v === 2)).toBe(true);
    const file = await exportSave(db, SAVE_ID);
    const db2 = new MemoryBackend();
    await importSave(db2, SAVE_ID, file, SEED);
    expect([...db2.chunks.values()].map((c) => `${c.cx},${c.cz},${c.v},${[...c.data].join('.')}`).sort()).toEqual(before);
    const b = await session(new MemoryStore(), db2);
    expect(b.restored.corrupt).toBe(0);
    expect(b.world.getBlock(90, 12, 50)).toBe('sprinkler');
    expect(b.world.hash()).toBe(a.world.hash());
  });

  it('VOX-B 基準 20: 古い世界（gen 2・main）のファイルは 読まず「まえの せかいの ファイルなので よめません」。世界は変えない', async () => {
    expect(OLD_WORLD_FILE_MESSAGE).toBe('まえの せかいの ファイルなので よめません');
    const db = new MemoryBackend();
    const a = await session(new MemoryStore(), db);
    a.world.setBlock(2, 300, 2, 'dirt');
    await a.save.now();
    const before = JSON.stringify([...db.chunks.values()].map((c) => [c.cx, c.cz, c.gen, [...c.data]]));
    const metaBefore = JSON.stringify(db.metas.get(SAVE_ID));
    const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const col = new ArrayVoxelWorld({ x: 16, z: 16 }).column(0, 0)!;
    const rec = await packColumn(0, 0, encodeSections(col.sections), 2, 3);
    const oldMeta = { v: 1, gen: 2, seed: SEED, spawn: { x: 64, y: 11, z: 64 }, inventory: null };
    for (const meta of [oldMeta, { ...oldMeta, gen: undefined }]) {
      const doc = { format: 'rikkun-world-save', v: 1, meta, chunks: [{ cx: 0, cz: 0, v: rec.v, gen: 2, h: 3, data: toB64(rec.data) }] };
      const file = await gzip(new TextEncoder().encode(JSON.stringify(doc)));
      await expect(importSave(db, SAVE_ID, file, SEED)).rejects.toThrow(OLD_WORLD_FILE_MESSAGE);
    }
    expect(JSON.stringify([...db.chunks.values()].map((c) => [c.cx, c.cz, c.gen, [...c.data]]))).toBe(before);
    expect(JSON.stringify(db.metas.get(SAVE_ID))).toBe(metaBefore);
  });
});

/** 版 1 の生バイト（番号は 凍らせた表の番号。今のビルドが書いた形）を作る。テスト用 */
function encodeV1(sections: readonly import('../contracts').SectionData[]): Uint8Array {
  const out: number[] = [];
  const toV1 = (n: number) => BLOCK_IDS_V1.indexOf(BLOCK_TYPES[n].id);
  for (const sec of sections) {
    const arr = sectionToArray(sec);
    const kinds = [...new Set(arr)];
    if (kinds.length === 1) out.push(0, toV1(kinds[0]));
    else if (kinds.length <= 16) {
      out.push(1, kinds.length, ...kinds.map(toV1));
      for (let i = 0; i < 4096; i += 2) out.push(kinds.indexOf(arr[i]) | (kinds.indexOf(arr[i + 1]) << 4));
    } else out.push(2, ...Array.from(arr, toV1));
  }
  return Uint8Array.from(out);
}

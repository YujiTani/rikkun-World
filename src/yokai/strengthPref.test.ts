// START-1 AC5: つよさの 保存と 読み（仕様 §4.3 の「保存」「決める 時」「URL ?strength=」）。
// 窓口の 名前（実装は これに 合わせる）:
//   src/yokai/strengthPref.ts
//     readSavedStrength(meta: unknown): StrengthLevel | null
//        保存の meta の `strength`（'easy'|'normal'|'hard'）。meta が null・オブジェクトでない・値が 変（古い 保存）→ null
//     decideStrength(search: string, meta: unknown, chosen?: StrengthLevel | null): StrengthLevel
//        決める 順: URL `?strength=easy|normal|hard`（その 起動だけ）＞ 保存の meta の つよさ ＞ chosen（メニューで えらんだ 物。新しい 世界）＞ 'normal'
//        meta が あって `strength` が ない 古い 保存 → 'normal'（chosen は 使わない）
//   src/save/SaveManager.ts の SaveDeps に `strength?: StrengthLevel` を 足す。
//        meta に `strength` として 書く（makeMeta）。URL `?strength=` の 起動でも 保存の 値は 書きかえない
//        （＝ 渡された strength が 保存する 値。main.ts が 「保存の 値 または えらんだ 値」を 渡す）。
import { describe, expect, it } from 'vitest';
import type { Inventory, PlayerState, SpawnPoint } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { populateWorld } from '../world/gen/populate';
import { MemoryBackend, SAVE_ID } from '../save/backend';
import { restoreStoredWorld } from '../save/restore';
import { SaveManager, type KeyValueStore } from '../save/SaveManager';
import { decideStrength, readSavedStrength } from './strengthPref';
import type { StrengthLevel } from './stats';

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

const SEED = 12345;

/** 1 回の ページ表示（SaveManager.test.ts の session を 小さくした物。strength を 渡せる） */
async function session(store: KeyValueStore, db: MemoryBackend, strength?: StrengthLevel) {
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  const island = populateWorld(world, SEED);
  world.resetSaveTracking();
  const restored = await restoreStoredWorld({ world, db, store, seed: SEED, saveId: SAVE_ID, reset: false });
  let slots: unknown = { slots: [], selected: 0 };
  const inventory = {
    serialize: () => slots,
    deserialize: (d: unknown) => void (slots = d),
    clear: () => void (slots = { slots: [], selected: 0 }),
  } as unknown as Inventory;
  const spawn: SpawnPoint = island.spawn();
  const state: PlayerState = {
    position: { x: spawn.x, y: spawn.y, z: spawn.z },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: spawn.yawDeg,
    pitchDeg: spawn.pitchDeg,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const save = new SaveManager({
    world,
    seed: SEED,
    db,
    restored,
    inventory,
    player: { get: () => state, set: () => undefined },
    spawn: () => island.spawn(),
    store,
    tick: () => 0,
    settings: { saveIntervalTicks: 600 },
    strength,
  });
  save.load();
  return { world, save, restored };
}

describe('AC5 つよさの 保存', () => {
  it('つよい で 始めた 世界を 保存して 読む → つよい', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db, 'hard');
    a.world.setBlock(4, 300, 6, 'stone'); // さわった 列が あれば 書く
    await a.save.now();
    expect(db.metas.get(SAVE_ID)?.strength).toBe('hard');
    const b = await session(store, db);
    expect(readSavedStrength(b.restored.meta)).toBe('hard');
    expect(decideStrength('', b.restored.meta)).toBe('hard');
  });

  it('やさしい・ふつう も 同じに 戻る', async () => {
    for (const level of ['easy', 'normal'] as const) {
      const store = new MemoryStore();
      const db = new MemoryBackend();
      const a = await session(store, db, level);
      a.world.setBlock(4, 300, 6, 'stone');
      await a.save.now();
      const b = await session(store, db);
      expect(readSavedStrength(b.restored.meta), level).toBe(level);
    }
  });

  it('つよさの ない 古い 保存 → ふつう', async () => {
    const store = new MemoryStore();
    const db = new MemoryBackend();
    const a = await session(store, db); // strength を 渡さない = 古い 保存と 同じ meta
    a.world.setBlock(4, 300, 6, 'stone');
    await a.save.now();
    const meta = db.metas.get(SAVE_ID);
    expect(meta).toBeDefined();
    delete (meta as Record<string, unknown>).strength; // 古い 保存には 無い
    const b = await session(store, db);
    expect(readSavedStrength(b.restored.meta)).toBeNull();
    expect(decideStrength('', b.restored.meta)).toBe('normal');
    expect(decideStrength('', b.restored.meta, 'hard'), '古い 保存は えらんだ 値を 使わない').toBe('normal');
  });
});

describe('AC5 URL ?strength= と 決める 順', () => {
  const hardMeta = { v: 1, seed: 1, strength: 'hard' };
  it('?strength=easy で 読むと その 起動は やさしい。保存の 値は つよい のまま', () => {
    expect(decideStrength('?strength=easy', hardMeta)).toBe('easy');
    expect(readSavedStrength(hardMeta)).toBe('hard');
    expect(hardMeta.strength).toBe('hard'); // 書きかえない
  });
  it('URL ＞ 保存 ＞ えらんだ 物 ＞ ふつう', () => {
    expect(decideStrength('?strength=hard', { strength: 'easy' }, 'normal')).toBe('hard');
    expect(decideStrength('', { strength: 'easy' }, 'hard')).toBe('easy');
    expect(decideStrength('', null, 'hard')).toBe('hard'); // 新しい 世界（保存なし）はメニューの 値
    expect(decideStrength('', null, null)).toBe('normal');
    expect(decideStrength('', null)).toBe('normal');
  });
  it('URL の 値が 変なら ないのと 同じ', () => {
    expect(decideStrength('?strength=xyz', { strength: 'hard' })).toBe('hard');
    expect(decideStrength('?strength=', null)).toBe('normal');
    expect(decideStrength('?strength=EASY', null)).toBe('normal');
  });
  it('readSavedStrength: 変な meta は null', () => {
    expect(readSavedStrength(null)).toBeNull();
    expect(readSavedStrength(undefined)).toBeNull();
    expect(readSavedStrength('hard')).toBeNull();
    expect(readSavedStrength([])).toBeNull();
    expect(readSavedStrength({})).toBeNull();
    expect(readSavedStrength({ strength: 'extreme' })).toBeNull();
    expect(readSavedStrength({ strength: 3 })).toBeNull();
    expect(readSavedStrength({ strength: 'easy' })).toBe('easy');
  });
});

import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../contracts';
import { P2State } from '../duo/p2State';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { MemoryBackend, SAVE_ID } from './backend';
import { NO_SAVE } from './restore';
import { SaveManager, type KeyValueStore, type SaveExtra } from './SaveManager';

/**
 * COOP-1 作業 1（#395）の 先行テスト（赤）。AC10（セーブ）。
 *
 * ---- developer への つなぎ目の 約束 ----
 *   SaveDeps.p2?: SaveExtra（型は もう 足してある）。SaveManager.makeMeta が `meta.p2 = d.p2?.serialize()` を 書き、
 *   restoreAll が `d.p2?.deserialize(data.p2)` を 呼ぶ（無い 保存は undefined を 渡す。例外は 食べて deserialize(null)）。
 *   serialize が null を 返す（2P が 一度も 参加して いない）ときは `p2` の キーを 書かない（古いセーブと 同じ 形）。
 *   p2 の 中身は { inventory, level: { level, xp } }（src/duo/types.ts の P2Save）。場所・向き・ハートは 入れない。
 *   SAVE_VERSION は 上げない（仕様 §6 は「版を 1 つ上げる」だが、validMeta が 版の 一致を 見ているので 古い セーブが 読めなくなり、
 *   water.test.ts の「SAVE_VERSION は 1」も 割れる。p2 は 足すだけの キーなので 版は そのまま。決めるのは PO・designer）。
 */

const SEED = 20261012;

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

const P2_DATA = { inventory: { slots: [{ item: 'dirt', count: 5 }] }, level: { level: 4, xp: 33 } };

function fakeP2(initial: unknown): SaveExtra & { loaded: unknown[]; value: unknown } {
  const o = {
    loaded: [] as unknown[],
    value: initial,
    serialize: () => o.value,
    deserialize: (d: unknown) => {
      o.loaded.push(d);
      o.value = d ?? null;
    },
  };
  return o;
}

function build(db: MemoryBackend, p2: SaveExtra, meta: Record<string, unknown> | null) {
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  const store = new MemoryStore();
  const state: PlayerState = {
    position: { x: 100, y: 200, z: 100 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  return new SaveManager({
    world, seed: SEED, db, store,
    restored: meta ? { ...NO_SAVE, meta } : NO_SAVE,
    inventory: new InventoryImpl(),
    player: { get: () => state, set: () => {} },
    spawn: () => ({ x: 100, y: 200, z: 100, yawDeg: 0, pitchDeg: 0 }),
    tick: () => 0,
    settings: { saveIntervalTicks: 600 },
    p2,
  });
}

describe('AC10: 2P の セーブ', () => {
  it('保存すると meta.p2 に 2P の 持ち物とレベルが 入る。場所・向きは 入らない', async () => {
    const db = new MemoryBackend();
    const save = build(db, fakeP2(P2_DATA), null);
    await save.now();
    const meta = db.metas.get(SAVE_ID) as Record<string, unknown>;
    expect(meta.p2).toEqual(P2_DATA);
    const keys = Object.keys(meta.p2 as object).sort();
    expect(keys).toEqual(['inventory', 'level']);
    for (const k of ['x', 'y', 'z', 'position', 'yaw', 'pitch', 'hearts']) expect(meta.p2).not.toHaveProperty(k);
  });

  it('本物の P2State を 渡すと meta.p2 は { inventory, level } だけ（場所・向きなし）', async () => {
    const st = new P2State();
    st.inventory.add('dirt', 5);
    st.level = { level: 4, xp: 12 };
    const db = new MemoryBackend();
    await build(db, { serialize: () => st.serialize(), deserialize: (d) => st.deserialize(d) }, null).now();
    const p2 = (db.metas.get(SAVE_ID) as Record<string, unknown>).p2 as Record<string, unknown>;
    expect(Object.keys(p2).sort()).toEqual(['inventory', 'level']);
    expect(p2.level).toEqual({ level: 4, xp: 12 });
  });

  it('読み直すと 2P の 持ち物とレベルが 戻る（deserialize に meta.p2 が 渡る）', async () => {
    const db = new MemoryBackend();
    await build(db, fakeP2(P2_DATA), null).now();
    const meta = db.metas.get(SAVE_ID) as Record<string, unknown>;
    const p2 = fakeP2(null);
    const save = build(db, p2, meta);
    expect(save.load()).toBe(true);
    expect(p2.loaded).toEqual([P2_DATA]);
  });

  it('p2 の ない 古い セーブも 読める（2P なしとして。例外が 出ず、ほかの 物も 戻る）', async () => {
    const db = new MemoryBackend();
    await build(db, fakeP2(null), null).now();
    const meta = { ...(db.metas.get(SAVE_ID) as Record<string, unknown>) };
    delete meta.p2;
    const p2 = fakeP2('前の 値');
    const save = build(db, p2, meta);
    expect(save.load()).toBe(true);
    expect(p2.loaded.length).toBe(1);
    expect(p2.loaded[0] ?? null).toBeNull();
  });

  it('2P が 一度も 参加して いない 世界は meta に p2 を 書かない', async () => {
    const withP2 = new MemoryBackend();
    await build(withP2, fakeP2(P2_DATA), null).now();
    expect(withP2.metas.get(SAVE_ID)).toHaveProperty('p2'); // 窓口が あれば 書く（実装なしで 通らない 見張り）
    const db = new MemoryBackend();
    await build(db, fakeP2(null), null).now();
    const meta = db.metas.get(SAVE_ID) as Record<string, unknown>;
    expect(meta).not.toHaveProperty('p2');
  });

  it('p2 を 渡さない 起動（キーボードだけで 開く）でも 保存した p2 を 消さない: p2 の 窓口が ない ときは meta.p2 を 引きつぐ', async () => {
    const db = new MemoryBackend();
    await build(db, fakeP2(P2_DATA), null).now();
    const meta = db.metas.get(SAVE_ID) as Record<string, unknown>;
    // p2 の 窓口が ない（?duo の ない ふだんの 起動）で 読んで 保存しても、meta.p2 は のこる
    const world = new ArrayVoxelWorld({ x: 0, z: 0 });
    const state = { position: { x: 100, y: 200, z: 100 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 } as unknown as PlayerState;
    const save = new SaveManager({
      world, seed: SEED, db, store: new MemoryStore(), restored: { ...NO_SAVE, meta },
      inventory: new InventoryImpl(), player: { get: () => state, set: () => {} },
      spawn: () => ({ x: 100, y: 200, z: 100, yawDeg: 0, pitchDeg: 0 }), tick: () => 0, settings: { saveIntervalTicks: 600 },
    });
    expect(save.load()).toBe(true);
    await save.now();
    expect((db.metas.get(SAVE_ID) as Record<string, unknown>).p2).toEqual(P2_DATA);
  });
});

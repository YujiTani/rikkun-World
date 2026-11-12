import { describe, expect, it } from 'vitest';
import { InventoryImpl } from '../inventory/Inventory';
import { WORLD_RENEWED_TEXT } from '../ui/worldRenewedNotice';
import { findUnrubiedKanji } from '../ui/text';
import { MemoryBackend, packColumn, SAVE_ID, type StoredMeta } from './backend';
import { SAVE_GEN, TERRAIN_RENEW_GEN } from './gens';
import { needsTerrainRenew, renewTerrainMeta } from './renewTerrain';
import { SAVE_VERSION, type KeyValueStore } from './SaveManager';
import { openStoredKeys } from './streamRestore';

/** 新しい 景色（木 v2・山 v2・目じるし）を 既定に した とき、古い 世代の セーブを 開く: 持ち物は のこり、地形（列）は すてて、おしらせは 1 回だけ */

const SEED = 20261012;

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

/** 持ち物の 1 マス目に 石 5 こ、たんすに 木 3 こ・石 2 こが 入った 古い meta */
function oldMeta(gen: number): StoredMeta {
  const inv = new InventoryImpl();
  inv.add('stone', 5);
  const slots = (inv.serialize() as { slots: unknown[] }).slots;
  return {
    v: SAVE_VERSION,
    gen,
    seed: SEED,
    spawn: { x: 1, y: 2, z: 3 },
    inventory: { slots, selected: 0 },
    player: { x: 500, y: 90, z: -700, yaw: 10, pitch: 0 },
    bags: [{ x: 1, y: 2, z: 3, ticksLeft: 100 }],
    furnaces: [{ x: 1, y: 2, z: 3 }],
    level: { level: 3, xp: 10 },
    storage: [{ x: 4, y: 5, z: 6, facing: 0, slots: [{ item: 'log', count: 3 }, null, { item: 'stone', count: 2 }] }],
    farm: { crops: [1, 2, 3, 4, 5] },
    animals: [{ x: 1, y: 1, z: 1 }],
    house: { v: 2, first: { x: 9, z: 9 }, toolsGiven: true, fudeGiven: true, blueprints: [], next: 4 },
    oldCols: { cols16: [1, 2] },
    shaftStart: { x: 7, z: 7 },
    time: { day: 4, dayTick: 100 },
  };
}

async function oldBackend(gen: number): Promise<MemoryBackend> {
  const db = new MemoryBackend();
  const col = await packColumn(3, 4, new Uint8Array(16 * 16 * 16 * 16 * 2), gen, 1);
  await db.write(SAVE_ID, [col], oldMeta(gen));
  return db;
}

const open = (db: MemoryBackend, store: KeyValueStore) => openStoredKeys({ db, store, seed: SEED, saveId: SAVE_ID, reset: false });

describe('古い 世代の セーブ（新しい 景色の 前）', () => {
  it('世代の 判定: 今の 版・それより 新しい 版は そのまま。古い 版・版なしは 地形を すてる', () => {
    expect(needsTerrainRenew({ gen: TERRAIN_RENEW_GEN })).toBe(false);
    expect(needsTerrainRenew({ gen: TERRAIN_RENEW_GEN + 1 })).toBe(false);
    expect(needsTerrainRenew({ gen: TERRAIN_RENEW_GEN - 1 })).toBe(true);
    expect(needsTerrainRenew({})).toBe(true);
  });

  it('renewTerrainMeta: 持ち物・レベル・時刻・おぼえた物は のこる。場所に ひもづく 物は 消える。たんすの 中身は 持ち物に もどる', () => {
    const old = oldMeta(8);
    const { meta, lostItems } = renewTerrainMeta(old);
    expect(lostItems).toBe(0);
    expect(meta.gen).toBe(SAVE_GEN);
    expect(meta.level).toEqual(old.level);
    expect(meta.time).toEqual(old.time);
    for (const k of ['player', 'spawn', 'oldCols', 'shaftStart', 'storage', 'farm', 'animals']) expect(meta, k).not.toHaveProperty(k);
    expect(meta.bags).toEqual([]);
    expect(meta.furnaces).toEqual([]);
    expect(meta.house).toMatchObject({ first: null, toolsGiven: true, next: 4 });
    const inv = new InventoryImpl();
    inv.deserialize(meta.inventory);
    const count = (id: string): number => (inv.serialize() as { slots: ({ item: string; count: number } | null)[] }).slots.reduce((n, s) => n + (s && s.item === id ? s.count : 0), 0);
    expect(count('stone')).toBe(5 + 2);
    expect(count('log')).toBe(3);
    expect(old.gen).toBe(8); // もとは かえない
  });

  it('開く: 列は すてられ、持ち物は のこり、はじめて 開いた とき だけ 「あたらしく なった」印。つぎに 開くと もう 出ない', async () => {
    const db = await oldBackend(8);
    const store = new MemoryStore();
    const r1 = await open(db, store);
    expect(r1.terrainRenewed).toBe(true);
    expect(r1.keys.size).toBe(0);
    expect(r1.columns).toBe(0);
    expect(r1.meta?.gen).toBe(SAVE_GEN);
    expect(r1.meta).not.toHaveProperty('player'); // プレイヤーは はじまりの 場所へ
    expect((r1.meta?.inventory as { slots: unknown[] }).slots.some((s) => (s as { item?: string } | null)?.item === 'stone')).toBe(true);
    expect((await db.readKeys(SAVE_ID)).keys).toEqual([]); // IndexedDB からも 列が 消えた
    const r2 = await open(db, store);
    expect(r2.terrainRenewed).toBeUndefined();
    expect(r2.meta?.inventory).toEqual(r1.meta?.inventory);
  });

  it('今の 版の セーブは そのまま（列も プレイヤーの 場所も のこる）', async () => {
    const db = await oldBackend(SAVE_GEN);
    const r = await open(db, new MemoryStore());
    expect(r.terrainRenewed).toBeUndefined();
    expect(r.keys.size).toBe(1);
    expect(r.meta).toHaveProperty('player');
  });

  it('おしらせの 文字は ひらがなだけ（漢字は ルビ）', () => {
    expect(findUnrubiedKanji(WORLD_RENEWED_TEXT)).toEqual([]);
    expect(WORLD_RENEWED_TEXT).toContain('もちもの');
  });
});

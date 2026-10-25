import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { M6_SETTING_DEFAULTS } from '../contracts';
import type { PlayerState } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { ITEM_TYPES } from '../inventory/items';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { SAVE_ID, MemoryBackend, type StoredMeta } from './backend';
import { restoreStoredWorld } from './restore';
import { SaveManager, type KeyValueStore } from './SaveManager';
import fixture from './__fixtures__/meta-small.json';

// #310 段階 0c: 「保存の形」の小さな見本（持ち物・実績・統計）を読みこんで、消えずに戻ることを確かめる。
// コード整理で アイテム・実績の id や 登録のしくみを 動かしても、すでにある保存が 黙って 空にならない ための網。
// 見本は今の保存（meta）と同じ形。見本を書きかえて通すのではなく、読み込みの方を直すこと。

const SEED = 12345;

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

const meta = fixture as unknown as StoredMeta & {
  inventory: { slots: Array<{ item: string; count: number; wear?: number } | null>; selected: number };
  achievements: { stats: Record<string, number>; unlocked: Record<string, number>; seen: string[]; viewed: string[]; pending: string[] };
};

async function openSave() {
  const db = new MemoryBackend();
  db.metas.set(SAVE_ID, structuredClone(meta));
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  const store = new MemoryStore();
  const restored = await restoreStoredWorld({ world, db, store, seed: SEED, saveId: SAVE_ID, reset: false });
  const inventory = new InventoryImpl();
  const achievements = new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
  const state: PlayerState = {
    position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const save = new SaveManager({
    world, seed: SEED, db, store, restored, inventory, achievements,
    player: { get: () => state, set: (v) => { Object.assign(state.position, v.position); state.yawDeg = v.yawDeg; state.pitchDeg = v.pitchDeg; } },
    spawn: () => ({ x: 6.5, y: 30, z: 6.5, yawDeg: 0, pitchDeg: 0 }),
    tick: () => 0,
    settings: { saveIntervalTicks: 600 },
  });
  return { save, inventory, achievements, state, loaded: save.load() };
}

describe('今の形の保存を読む（持ち物・実績・統計が消えずに戻る）', () => {
  it('見本に出てくる id は、今のゲームにある（消した・名前を変えたら ここで気づく）', () => {
    const items = new Set<string>(ITEM_TYPES.map((t) => t.id));
    for (const s of meta.inventory.slots) if (s) expect(items.has(s.item), `アイテム ${s.item}`).toBe(true);
    const defs = new Set(ACHIEVEMENT_DEFS.map((d) => d.id));
    for (const id of [...Object.keys(meta.achievements.unlocked), ...meta.achievements.seen, ...meta.achievements.viewed, ...meta.achievements.pending]) {
      expect(defs.has(id), `実績 ${id}`).toBe(true);
    }
  });

  it('SaveManager が読むと、持ち物が見本のまま戻る', async () => {
    const o = await openSave();
    expect(o.loaded).toBe(true);
    expect(o.inventory.serialize()).toEqual(meta.inventory);
    expect(o.inventory.count('dirt')).toBe(40);
    expect(o.inventory.count('stone')).toBe(12);
  });

  it('実績の取った物・見た印・統計が見本のまま戻る', async () => {
    const o = await openSave();
    const back = o.achievements.serialize() as typeof meta.achievements & { v: number; walk: number; foundCountries: string[] };
    expect(back.v).toBe(1);
    expect(back.stats).toEqual(meta.achievements.stats);
    expect(back.walk).toBe(345);
    expect(back.unlocked).toEqual(meta.achievements.unlocked);
    expect(back.seen).toEqual(meta.achievements.seen);
    expect(back.viewed).toEqual(meta.achievements.viewed);
    expect(back.pending).toEqual(meta.achievements.pending);
    expect(o.achievements.stat('break:dirt')).toBe(120);
    expect(o.achievements.stat('craft:wood_pickaxe')).toBe(1);
  });

  it('位置と向きも戻る（空の中の位置はそのまま）', async () => {
    const o = await openSave();
    expect(o.state.position).toEqual({ x: 6.5, y: 300, z: 6.5 });
    expect(o.state.yawDeg).toBe(90);
    expect(o.state.pitchDeg).toBe(-10);
  });
});

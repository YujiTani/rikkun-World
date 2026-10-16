import { describe, expect, it } from 'vitest';
import type { Inventory, PlayerState, SpawnPoint } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { generateIsland } from '../world/gen/generateIsland';
import {
  SaveManager,
  type SaveBags,
  isBodyPlaceable,
  parseSaveOptions,
  saveKey,
  snapshotWorld,
  stripResetParam,
  type KeyValueStore,
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

/** 1 回のページ表示に当たるもの（世界・持ち物・プレイヤー・保存係）を作る */
function session(store: KeyValueStore | null, ticks = { n: 0 }, bags?: SaveBags, clock?: { t: number; d: number }) {
  const world = new ArrayVoxelWorld();
  const island = generateIsland(SEED, world);
  const baseline = snapshotWorld(world);
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
    moving: false,
  };
  let third = false;
  const save = new SaveManager({
    world,
    seed: SEED,
    baseline,
    inventory,
    player: {
      get: () => state,
      set: (v) => {
        Object.assign(state.position, v.position);
        Object.assign(state.velocity, v.velocity);
        state.yawDeg = v.yawDeg;
        state.pitchDeg = v.pitchDeg;
      },
      isThirdPerson: () => third,
      setThirdPerson: (t) => {
        third = t;
      },
    },
    spawn: () => island.spawn(),
    store,
    tick: () => ticks.n,
    settings: { saveIntervalTicks: 600 },
    bags,
    clock: clock && {
      dayTick: () => clock.t,
      day: () => clock.d,
      set: (n: number) => void (clock.t = n),
      setDay: (n: number) => void (clock.d = n),
    },
  });
  return { world, island, save, state, inventory, ticks, isThird: () => third, setThird: (t: boolean) => (third = t) };
}

describe('SaveManager', () => {
  it('保存して開き直すと、世界・持ち物・位置・向きが同じに戻る（AC28）', () => {
    const store = new MemoryStore();
    const a = session(store);
    a.world.setBlock(4, 10, 6, 'log');
    a.world.setBlock(0, 20, 0, 'sand');
    a.inventory.deserialize({ slots: [null, { item: 'sand', count: 9 }], selected: 4 });
    a.state.position.x = 6.5;
    a.state.position.y = 30;
    a.state.position.z = 6.5;
    a.state.yawDeg = 180;
    a.state.pitchDeg = -20;
    a.setThird(true);
    a.save.now();
    const hash = a.world.hash();

    const b = session(store);
    expect(b.world.hash()).not.toBe(hash);
    expect(b.save.load()).toBe(true);
    expect(b.world.hash()).toBe(hash);
    expect(b.inventory.serialize()).toEqual({ slots: [null, { item: 'sand', count: 9 }], selected: 4 });
    expect(b.state.position).toEqual({ x: 6.5, y: 30, z: 6.5 });
    expect(b.state.yawDeg).toBe(180);
    expect(b.state.pitchDeg).toBe(-20);
    expect(b.isThird()).toBe(true);
  });

  it('島のままなら差分は 0 こ。変えたマスだけが入る', () => {
    const store = new MemoryStore();
    const a = session(store);
    a.save.now();
    expect(a.save.info().changedBlocks).toBe(0);
    a.world.setBlock(1, 25, 1, 'stone');
    a.save.now();
    expect(a.save.info().changedBlocks).toBe(1);
    expect(a.save.info().bytes).toBeGreaterThan(0);
  });

  it('保存の入れ物はシードごと。名前が決まりどおり', () => {
    const store = new MemoryStore();
    session(store).save.now();
    expect([...store.data.keys()]).toEqual(['rikkun-world-save-v1-12345']);
    expect(saveKey(7)).toBe('rikkun-world-save-v1-7');
  });

  it('自動: 600 ステップごと、変わっていれば保存（AC29 a・b）', () => {
    const store = new MemoryStore();
    const s = session(store);
    s.ticks.n = 100;
    s.save.now();
    expect(s.save.info().lastSavedTick).toBe(100);
    s.world.setBlock(2, 25, 2, 'dirt');
    for (let t = 101; t < 700; t++) {
      s.ticks.n = t;
      s.save.update(t);
    }
    expect(s.save.info().lastSavedTick).toBe(100);
    s.ticks.n = 700;
    s.save.update(700);
    expect(s.save.info().lastSavedTick).toBe(700);
    // 何も変えずに 600 ステップ
    for (let t = 701; t <= 1300; t++) {
      s.ticks.n = t;
      s.save.update(t);
    }
    expect(s.save.info().lastSavedTick).toBe(700);
  });

  it('ロックが外れたときなど: 変わっていなければ書かない、変わっていれば書く', () => {
    const store = new MemoryStore();
    const s = session(store);
    s.save.now();
    s.ticks.n = 50;
    s.save.saveIfChanged();
    expect(s.save.info().lastSavedTick).toBe(0);
    s.state.yawDeg = 90;
    s.save.saveIfChanged();
    expect(s.save.info().lastSavedTick).toBe(50);
  });

  it('?nosave: 読みも書きもしない', () => {
    const s = session(null);
    s.world.setBlock(2, 25, 2, 'dirt');
    s.save.now();
    s.save.update(5000);
    expect(s.save.info().enabled).toBe(false);
    expect(s.save.info().lastSavedTick).toBeNull();
    expect(s.save.load()).toBe(false);
  });

  it('clear で消え、開き直すと最初から（?reset=1）', () => {
    const store = new MemoryStore();
    const a = session(store);
    const fresh = a.world.hash();
    a.world.setBlock(2, 25, 2, 'dirt');
    a.save.now();
    a.save.clear();
    expect(store.data.size).toBe(0);
    const b = session(store);
    expect(b.save.load()).toBe(false);
    expect(b.world.hash()).toBe(fresh);
  });

  it('こわれた保存・版や島がちがう保存は使わない', () => {
    const store = new MemoryStore();
    const key = saveKey(SEED);
    for (const bad of [
      'not json',
      '{"version":99,"seed":12345,"blocks":[]}',
      `{"version":1,"seed":1,"blocks":[]}`,
      '{"version":1,"seed":12345,"blocks":[1]}',
      '{"version":1,"seed":12345,"blocks":[999999999,1]}',
      '{"version":1,"seed":12345,"blocks":[5,99]}',
      'null',
    ]) {
      store.data.set(key, bad);
      const s = session(store);
      const fresh = s.world.hash();
      expect(s.save.load()).toBe(false);
      expect(s.world.hash()).toBe(fresh);
    }
  });

  it('gen=1・gen なし・size ちがいの保存は使わず、そのあとの保存は gen=2・size つき（AC20）', () => {
    const key = saveKey(SEED);
    const a = session(new MemoryStore());
    a.world.setBlock(4, 10, 6, 'log');
    a.save.now();
    const good = JSON.parse((a.save as unknown as { d: { store: MemoryStore } }).d.store.getItem(key)!) as Record<string, unknown>;
    expect(good.gen).toBe(2);
    expect(good.size).toEqual([a.world.loadedBounds().x1, a.world.size.y, a.world.loadedBounds().z1]);
    const variants: Array<Record<string, unknown>> = [
      { ...good, gen: 1 },
      { ...good, gen: undefined },
      { ...good, size: [a.world.loadedBounds().x1, a.world.size.y, a.world.loadedBounds().z1 + 1] },
      { ...good, size: undefined },
    ];
    for (const v of variants) {
      const store = new MemoryStore();
      store.data.set(key, JSON.stringify(v));
      const s = session(store);
      const fresh = s.world.hash();
      expect(s.save.load()).toBe(false);
      expect(s.world.hash()).toBe(fresh);
      s.save.now();
      const after = JSON.parse(store.getItem(key)!) as Record<string, unknown>;
      expect(after.gen).toBe(2);
      expect(after.size).toEqual([s.world.loadedBounds().x1, s.world.size.y, s.world.loadedBounds().z1]);
    }
  });

  it('保存できなくても（容量いっぱい）止まらず、保存済みの印は進まない', () => {
    const store = new MemoryStore();
    const s = session(store);
    store.fail = true;
    s.ticks.n = 10;
    expect(() => s.save.now()).not.toThrow();
    expect(s.save.info().lastSavedTick).toBeNull();
  });

  it('もどした位置が ブロックと重なる・世界の外 なら スタート地点', () => {
    for (const bad of [{ x: 6.5, y: 5, z: 6.5 }, { x: -3, y: 30, z: 6 }, { x: 6.5, y: -2, z: 6.5 }, { x: NaN, y: 30, z: 6 }]) {
      const store = new MemoryStore();
      const a = session(store);
      a.state.position.x = bad.x;
      a.state.position.y = bad.y;
      a.state.position.z = bad.z;
      a.state.yawDeg = 33;
      a.save.now();
      const b = session(store);
      const sp = b.island.spawn();
      b.save.load();
      expect(b.state.position).toEqual({ x: sp.x, y: sp.y, z: sp.z });
      expect(b.state.yawDeg).toBe(sp.yawDeg);
    }
  });

  it('変わったマス 2,000 この保存が 10 ミリ秒以下の目安（記録）', () => {
    const store = new MemoryStore();
    const s = session(store);
    let n = 0;
    for (let x = 0; x < 64 && n < 2000; x++)
      for (let z = 0; z < 64 && n < 2000; z++) {
        s.world.setBlock(x, 28, z, 'stone');
        n++;
      }
    s.save.now();
    s.save.now();
    expect(s.save.info().changedBlocks).toBeGreaterThanOrEqual(2000);
    // 目安。CI の機械でぶれるので広めに見る
    expect(s.save.info().lastMs).toBeLessThan(50);
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

  it('保存して開き直すと ふくろが戻る', () => {
    const store = new MemoryStore();
    const bag = { x: 6.5, y: 9, z: 6.5, item: 'dirt', count: 3, ticksLeft: 30000 };
    const a = session(store, { n: 0 }, fakeBags([bag]));
    a.save.now();
    const fb = fakeBags([]);
    const b = session(store, { n: 0 }, fb);
    expect(b.save.load()).toBe(true);
    expect(fb.list).toEqual([bag]);
  });

  it('のこりステップだけが変わっても「変わった」とは数えない', () => {
    const store = new MemoryStore();
    const fb = fakeBags([{ x: 1, y: 2, z: 3, item: 'dirt', count: 1, ticksLeft: 100 }]);
    const ticks = { n: 0 };
    const a = session(store, ticks, fb);
    a.save.now();
    const first = store.data.get(saveKey(SEED));
    fb.list[0]!.ticksLeft = 50;
    a.save.saveIfChanged();
    expect(store.data.get(saveKey(SEED))).toBe(first);
    fb.list = [];
    a.save.saveIfChanged();
    expect(store.data.get(saveKey(SEED))).not.toBe(first);
  });
});

describe('SaveManager 時刻', () => {
  it('時刻と何日目が続きから始まる', () => {
    const store = new MemoryStore();
    session(store, undefined, undefined, { t: 5000, d: 3 }).save.now();
    const c = { t: 1, d: 1 };
    expect(session(store, undefined, undefined, c).save.load()).toBe(true);
    expect(c).toEqual({ t: 5000, d: 3 });
  });

  it('古い保存（時刻なし）は昼の始まり', () => {
    const store = new MemoryStore();
    session(store).save.now();
    const c = { t: 9, d: 9 };
    expect(session(store, undefined, undefined, c).save.load()).toBe(true);
    expect(c).toEqual({ t: 0, d: 0 });
  });

  it('時刻だけの変化では書かず、ページをかくすときは書く', () => {
    const store = new MemoryStore();
    const c = { t: 100, d: 0 };
    const a = session(store, undefined, undefined, c);
    a.save.now();
    const before = [...store.data.values()][0];
    c.t = 900;
    a.save.saveIfChanged();
    expect([...store.data.values()][0]).toBe(before);
    const handlers: Array<() => void> = [];
    const win = { addEventListener: (_: string, f: () => void) => handlers.push(f), removeEventListener: () => {} };
    const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} };
    a.save.bindPageEvents(win as unknown as Window, doc as unknown as Document);
    handlers[0]();
    expect([...store.data.values()][0]).toContain('"dayTick":900');
  });
});

describe('SaveManager: 広い世界（M5 AC21）', () => {
  it('ひらち (100,8,60) とやま (64,25,28) で 500 個変えて、保存して読み直すと同じ。20ms 以下・30,000 文字以下', () => {
    const store = new MemoryStore();
    const a = session(store);
    let n = 0;
    for (let i = 0; i < 500; i++) {
      const base = i % 2 === 0 ? { x: 100, y: 8, z: 60 } : { x: 64, y: 25, z: 28 };
      const x = base.x + (Math.floor(i / 2) % 10);
      const y = base.y + (Math.floor(i / 20) % 5);
      const z = base.z + (Math.floor(i / 100) % 5);
      if (a.world.setBlock(x, y, z, i % 4 === 0 ? 'log' : 'sand')) n++;
    }
    expect(n).toBeGreaterThan(0);
    const times: number[] = [];
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      a.save.now();
      times.push(performance.now() - t0);
    }
    times.sort((p, q) => p - q);
    expect(times[2]).toBeLessThanOrEqual(20);
    const saved = [...store.data.values()][0];
    expect(saved.length).toBeLessThanOrEqual(30000);
    const hash = a.world.hash();
    const b = session(store);
    expect(b.save.load()).toBe(true);
    expect(b.world.hash()).toBe(hash);
  });
});

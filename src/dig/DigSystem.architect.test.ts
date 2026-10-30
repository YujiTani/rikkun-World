import { describe, expect, it } from 'vitest';
import type { AnimalApi, BlockId, ItemId, LockStatus, PlayerState, Vec3 } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/** HOUSE-1A: 建築士さんを ねらって 右クリックで 話しかける（ブロック・にわとり より 手前 の ときだけ）。置く・耕す は しない */

interface Opts {
  held?: ItemId | null;
  /** 建築士さんの 当たる 距離（null = 当たらない） */
  hit?: number | null;
  /** 目の 前の ブロック（x=5 の 壁）を 置くか */
  wall?: boolean;
  /** にわとりの 当たる 距離（null = いない） */
  animal?: number | null;
  carrying?: boolean;
  hasPort?: boolean;
}

function rig(o: Opts = {}) {
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => (blocks.set(key(x, y, z), id), true),
    isSolid: (x: number, y: number, z: number) => {
      const b = blocks.get(key(x, y, z));
      return !!b && b !== 'air' && b !== 'water';
    },
  };
  for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) blocks.set(key(x, 8, z), 'stone');
  if (o.wall) blocks.set(key(5, 10, 6), 'stone');
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  const held = o.held === undefined ? 'dirt' : o.held;
  if (held) inv.setSlot(0, { item: held, count: 5 });
  inv.select(0);
  const log: string[] = [];
  let hit = o.hit === undefined ? 2 : o.hit;
  const animals: AnimalApi = {
    rayHit: (_origin: Vec3, _dir: Vec3, _max: number) => (o.animal == null ? null : { id: 7, distance: o.animal }),
    preview: () => 'animalPet',
    carrying: () => (o.carrying ? 7 : null),
    forEachVisible: () => {},
    carryHold: () => null,
    putDown: () => false,
    swingNet: () => ({ caught: false, reason: 'miss' as const }),
    ...({} as Omit<AnimalApi, 'rayHit' | 'preview' | 'carrying' | 'forEachVisible' | 'carryHold' | 'putDown' | 'swingNet'>),
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, {
    ...(o.animal != null || o.carrying ? { animals } : {}),
    ...(o.hasPort === false
      ? {}
      : {
          architects: {
            rayHit: (_origin: Vec3, _dir: Vec3, _reach: number) => (hit === null ? null : { id: 'first', distance: hit }),
            talk: (id: string) => (log.push(`talk ${id}`), true),
            hit: (id: string) => void log.push(`hit ${id}`),
          },
        }),
  });
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  step();
  return { dig, actions, inv, log, world, step, setHit: (d: number | null) => (hit = d) };
}

describe('右クリック: 建築士さんに 話しかける', () => {
  it('ねらって 右クリック → talk が 1 回。手に 持った ブロックは 置かない', () => {
    const r = rig({ wall: true, hit: 2 });
    r.actions.press('secondary');
    r.step();
    expect(r.log).toEqual(['talk first']);
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.inv.held()?.count).toBe(5);
  });

  it('おしつづけても talk は 1 回だけ。ずっと 何も 置かない', () => {
    const r = rig({ wall: true, hit: 2 });
    r.actions.press('secondary');
    r.step(120);
    expect(r.log).toEqual(['talk first']);
    expect(r.inv.held()?.count).toBe(5);
  });

  it('はなして また 押すと もういちど 話しかける', () => {
    const r = rig({ hit: 2 });
    r.actions.press('secondary');
    r.step(3);
    r.actions.release('secondary');
    r.step(2);
    r.actions.press('secondary');
    r.step(2);
    expect(r.log).toEqual(['talk first', 'talk first']);
  });

  it('ブロックの かべの むこうの 建築士さんには 話しかけない（かべが 手前）。ふつうに 置く', () => {
    const r = rig({ wall: true, hit: 4 });
    // 壁までは 約 2 マス（目から 5.0 - 2.5 = 2.5）
    r.actions.press('secondary');
    r.step();
    expect(r.log).toEqual([]);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
  });

  it('当たらない とき（遠い・ほかを むいている）は 話しかけない', () => {
    const r = rig({ wall: true, hit: null });
    r.actions.press('secondary');
    r.step();
    expect(r.log).toEqual([]);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
  });

  it('窓口が ない（建築士さんが いない 世界）なら 今までどおり', () => {
    const r = rig({ wall: true, hasPort: false });
    r.actions.press('secondary');
    r.step();
    expect(r.log).toEqual([]);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    expect(r.dig.aimedArchitect()).toBeNull();
  });
});

describe('ねらい・案内', () => {
  it('aimedArchitect(): ねらって いる 間は id、はずれたら null', () => {
    const r = rig({ hit: 2 });
    expect(r.dig.aimedArchitect()).toBe('first');
    r.setHit(null);
    r.step();
    expect(r.dig.aimedArchitect()).toBeNull();
  });

  it('ねらって いる 間は 右クリックの 案内（置く など）を 出さない。はずれると 出る', () => {
    const r = rig({ wall: true, hit: 2 });
    expect(r.dig.previewRightClick()).toBeNull();
    r.setHit(null);
    r.step();
    expect(r.dig.previewRightClick()).toEqual({ kind: 'place', item: 'dirt' });
  });

  it('にわとりと 建築士さんが 同じ 線に 重なる ときは 近い 方だけ', () => {
    const near = rig({ hit: 2, animal: 3 });
    expect(near.dig.aimedArchitect()).toBe('first');
    expect(near.dig.animalTarget()).toBeNull();
    const far = rig({ hit: 3, animal: 2 });
    expect(far.dig.aimedArchitect()).toBeNull();
    expect(far.dig.animalTarget()).toBe(7);
  });

  it('にわとりを だっこ している 間は 話しかけない（にわとりの 動きが さき）', () => {
    const r = rig({ hit: 2, animal: null, carrying: true });
    r.actions.press('secondary');
    r.step();
    expect(r.log).toEqual([]);
  });
});

describe('左クリック: たたく', () => {
  it('ねらって 左クリックを 押した ステップに hit が 1 回（おしつづけても 1 回）', () => {
    const r = rig({ hit: 2 });
    r.actions.press('primary');
    r.step(40);
    expect(r.log).toEqual(['hit first']);
    r.actions.release('primary');
    r.step();
    r.actions.press('primary');
    r.step();
    expect(r.log).toEqual(['hit first', 'hit first']);
  });

  it('ねらって いなければ hit しない', () => {
    const r = rig({ hit: null });
    r.actions.press('primary');
    r.step(3);
    expect(r.log).toEqual([]);
  });
});

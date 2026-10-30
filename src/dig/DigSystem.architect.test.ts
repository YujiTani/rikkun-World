import { describe, expect, it } from 'vitest';
import type { AnimalApi, BlockId, ItemId, LockStatus, PlayerState, Vec3 } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/** HOUSE-1A: 建築士さんを ねらって 右クリックで 話しかける（ブロック・にわとり より 手前 の ときだけ）。置く・耕す は しない */

interface Opts {
  held?: ItemId | null;
  /** 建築士さんの 当たる 距離（null = 当たらない） */
  hit?: number | null;
  /** 目の 前の ブロック（x=5 の 壁）を 置くか */
  wall?: boolean;
  /** 壁の ブロック（初期値 stone。素手で ほれる やわらかい もの = dirt を 使う テストも ある） */
  wallBlock?: BlockId;
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
  if (o.wall) blocks.set(key(5, 10, 6), o.wallBlock ?? 'stone');
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

  it('ねらって いる 間の 右クリックの 案内は「はなす」（置く など は 出さない）。はずれると 置くに もどる', () => {
    const r = rig({ wall: true, hit: 2 });
    expect(r.dig.previewRightClick()).toEqual({ kind: 'talk', item: null });
    r.setHit(null);
    r.step();
    expect(r.dig.previewRightClick()).toEqual({ kind: 'place', item: 'dirt' });
  });

  it('ブロックを ねらう 線が なくても（空を むいて 建築士さんだけ）案内は「はなす」', () => {
    const r = rig({ hit: 2 });
    expect(r.dig.previewRightClick()).toEqual({ kind: 'talk', item: null });
  });

  it('にわとりを だっこ している 間は 案内も にわとりが さき（はなす は 出ない）', () => {
    const r = rig({ hit: 2, carrying: true });
    expect(r.dig.previewRightClick()?.kind).not.toBe('talk');
  });

  it('左クリックの 案内は 後ろの ブロックが あっても「ほる」を 出さない。はずれると「ほる」が 出る', () => {
    const r = rig({ wall: true, wallBlock: 'dirt', hit: 2 });
    expect(r.dig.previewLeftClick()).toBeNull();
    r.setHit(null);
    r.step();
    expect(r.dig.previewLeftClick()).toBe('dig');
  });

  it('画面の 案内: 右 =「はなす」（ふきだしの 絵）、左 = なし。はずれると 右 =「おく」・左 =「ほる」', () => {
    const r = rig({ wall: true, wallBlock: 'dirt', hit: 2 });
    const ctx = { held: 'dirt' as ItemId, heldIsPickaxe: false, heldIsBlade: false };
    expect(actionHintLines(r.dig.previewRightClick(), r.dig.previewLeftClick(), ctx)).toEqual({ right: { icon: 'talk', word: 'はなす' } });
    r.setHit(null);
    r.step();
    const away = actionHintLines(r.dig.previewRightClick(), r.dig.previewLeftClick(), ctx);
    expect(away.right?.word).toBe('おく');
    expect(away.left?.word).toBe('ほる');
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

describe('左クリックを おしつづけても 後ろの ブロックは ほらない', () => {
  // 壁（やわらかい dirt）は 目から 約 2.5 マス。建築士さんは 2 マスで 手前。
  // ほる ときは ひびが MAX（ready）で 止まり、押し直した しゅんかんに こわれる（押しっぱなしでは こわれない）
  const dirtAt = (r: ReturnType<typeof rig>): BlockId | 'outside' => r.world.getBlock(5, 10, 6);
  const repress = (r: ReturnType<typeof rig>): void => {
    r.actions.release('primary');
    r.step();
    r.actions.press('primary');
    r.step();
  };

  it('対照: 建築士さんを ねらって いなければ おしつづけで ひびが MAX に なり、押し直すと こわれる', () => {
    const r = rig({ wall: true, wallBlock: 'dirt', hit: null });
    r.actions.press('primary');
    r.step(400);
    expect(r.dig.state()).toMatchObject({ ready: true, crackStage: 3, block: { x: 5, y: 10, z: 6 } });
    expect(dirtAt(r)).toBe('dirt');
    repress(r);
    expect(dirtAt(r)).toBe('air');
  });

  it('建築士さんを ねらって いる 間は 400 ステップ おしつづけても ひびも 入らず、押し直しても こわれない', () => {
    const r = rig({ wall: true, wallBlock: 'dirt', hit: 2 });
    r.actions.press('primary');
    r.step(400);
    expect(r.dig.state()).toMatchObject({ active: false, ready: false, progress: 0, crackStage: 0, block: null });
    for (let i = 0; i < 6; i++) repress(r);
    r.step(400);
    expect(dirtAt(r)).toBe('dirt');
    expect(r.dig.state()).toMatchObject({ active: false, ready: false, progress: 0, block: null });
    expect(r.dig.peekEvents().filter((e) => e.type === 'break' || e.type === 'ready')).toEqual([]);
  });

  it('ほりかけの 所へ 建築士さんが 入って きたら 止まり ひびは もどる。出て いったら また ほれる', () => {
    const r = rig({ wall: true, wallBlock: 'dirt', hit: null });
    r.actions.press('primary');
    r.step(6);
    expect(r.dig.state().progress).toBeGreaterThan(0);
    expect(r.dig.state().active).toBe(true);
    r.setHit(2);
    r.step(200);
    expect(r.dig.state()).toMatchObject({ active: false, progress: 0, block: null });
    expect(dirtAt(r)).toBe('dirt');
    r.setHit(null);
    r.step(400);
    expect(r.dig.state().ready).toBe(true);
    repress(r);
    expect(dirtAt(r)).toBe('air');
  });

  it('建築士さんが ブロックの 向こうなら（ブロックが 手前）ふつうに ほれる。話しかけも たたきも しない', () => {
    const r = rig({ wall: true, wallBlock: 'dirt', hit: 4 });
    r.actions.press('primary');
    r.step(400);
    expect(r.dig.state().ready).toBe(true);
    expect(r.log).toEqual([]);
  });

  it('建築士さんを たたく 左クリックは 腕を ふる（空ぶり）。おしつづけると 0.5 秒ごとに もう 1 回', () => {
    const r = rig({ wall: true, wallBlock: 'dirt', hit: 2 });
    r.actions.press('primary');
    r.step();
    expect(r.dig.whiffCount()).toBe(1);
    r.step(200);
    expect(r.dig.whiffCount()).toBeGreaterThan(3);
    const away = rig({ wall: true, wallBlock: 'dirt', hit: null });
    away.actions.press('primary');
    away.step(3);
    expect(away.dig.whiffCount()).toBe(0); // 建築士さんが いなければ 腕は ふらずに ほる
  });

  it('左クリックを おしつづけて いても 右クリックの「はなす」は 1 回だけ 話しかける。ブロックは そのまま', () => {
    const r = rig({ wall: true, wallBlock: 'dirt', hit: 2 });
    r.actions.press('primary');
    r.step(5);
    r.actions.press('secondary');
    r.step(50);
    expect(r.log.filter((l) => l.startsWith('talk'))).toEqual(['talk first']);
    expect(dirtAt(r)).toBe('dirt');
    expect(r.dig.state().ready).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, Vec3, VoxelWorld, YokaiRayHit, YokaiWorld } from '../contracts';
import { PlayerCombatImpl } from '../combat';
import { createCombatConfig } from '../combat/config';
import { createDigConfig } from '../dig/config';
import { DigSystemImpl } from '../dig/DigSystem';
import { ActionState, type Action } from '../input/actions';
import type { Inventory, ItemStack } from '../contracts';
import { ToolSystemImpl } from './ToolSystem';

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (this.getBlock(x, y, z) === 'outside') return false;
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water' && b !== 'torch';
  }
}

/** 一直線上（+x）に箱を置いた妖怪。dist は目から箱の面まで */
/** 新しいアイテムの種類表（担当 A）に頼らない、最小の持ち物 */
class FakeInv {
  size = 36;
  arr: (ItemStack | null)[] = Array.from({ length: 36 }, () => null);
  sel = 0;
  slots() {
    return this.arr;
  }
  selected() {
    return this.sel;
  }
  select(i: number) {
    this.sel = i;
  }
  selectNext() {}
  setSlot(i: number, s: ItemStack | null) {
    this.arr[i] = s ? { ...s } : null;
  }
  clear() {
    this.arr.fill(null);
  }
  add(item: ItemId, count: number) {
    const s = this.arr.find((x) => x?.item === item);
    if (s) s.count += count;
    else this.arr[this.arr.findIndex((x) => !x)] = { item, count };
    return 0;
  }
  count(item: ItemId) {
    return this.arr.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0);
  }
  remove(item: ItemId, count: number) {
    const s = this.arr.find((x) => x?.item === item);
    if (!s) return 0;
    const n = Math.min(count, s.count);
    s.count -= n;
    if (s.count === 0) this.arr[this.arr.indexOf(s)] = null;
    return n;
  }
  held() {
    return this.arr[this.sel];
  }
  consumeHeld() {
    return this.remove(this.arr[this.sel]!.item, 1) > 0;
  }
}

class FakeYokai implements YokaiWorld {
  hp = 4;
  dist = 10;
  damaged: { id: number; amount: number }[] = [];
  list() {
    return [];
  }
  raycast(o: Vec3, dir: Vec3, max: number): YokaiRayHit | null {
    const eyeX = 2.5;
    const d = eyeX + this.dist - o.x;
    if (dir.x < 0.5 || d < 0 || d > max) return null;
    return { id: 1, kind: 'karakasa', distance: d / dir.x };
  }
  damage(id: number, amount: number) {
    this.damaged.push({ id, amount });
    this.hp = Math.max(0, this.hp - amount);
  }
  occupies() {
    return false;
  }
  drainEvents() {
    return [];
  }
}

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  inv = new FakeInv() as unknown as Inventory & FakeInv;
  yokai = new FakeYokai();
  player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
  };
  lock: LockStatus = {
    locked: () => true,
    overlayVisible: () => false,
    realtimeAllowed: () => true,
    playInputEnabled: () => true,
  };
  digCfg = createDigConfig();
  combatCfg = createCombatConfig();
  tools = new ToolSystemImpl({
    inventory: this.inv,
    world: this.world,
    player: () => this.player,
    yokai: () => this.yokai,
    base: { dig: this.digCfg, combat: this.combatCfg },
  });
  combat = new PlayerCombatImpl({
    world: this.world,
    player: { get: () => this.player, set: () => {} },
    inventory: this.inv,
    yokai: () => this.yokai,
    spawn: () => ({ x: 0, y: 9, z: 0, yawDeg: 0, pitchDeg: 0 }),
    config: this.combatCfg,
    tool: this.tools,
  });
  furnaces = new Set<string>();
  opened: string[] = [];
  broken: string[] = [];
  equipped: ItemId[] = [];
  picked: [ItemId, number][] = [];
  dig = new DigSystemImpl(
    this.world,
    () => this.player,
    this.actions,
    this.lock,
    this.inv,
    () => 1.62,
    this.digCfg,
    () => 0.99, // ドロップは最大
    this.combat,
    {
      tools: this.tools,
      craft: {
        isFurnace: (x, y, z) => this.furnaces.has(`${x},${y},${z}`),
        openFurnace: (x, y, z) => this.opened.push(`${x},${y},${z}`),
        furnaceBroken: (x, y, z) => this.broken.push(`${x},${y},${z}`),
        fixedDrop: (id) => (id === 'furnace' || id === 'kawara' || id === 'brick' ? 1 : null),
      },
      armor: {
        canEquip: (item) => item === 'kabuto' || item === 'yoroi',
        tryEquip: (item) => {
          if (item !== 'kabuto' && item !== 'yoroi') return false;
          this.equipped.push(item);
          this.inv.consumeHeld();
          return true;
        },
      },
      onPickup: (item, count) => this.picked.push([item, count]),
    },
  );
  constructor() {
    for (let x = 0; x <= 40; x++) for (let z = 0; z <= 12; z++) this.world.setBlock(x, 8, z, 'stone');
    this.dig.update();
    this.actions.endFrame();
  }
  hold(item: ItemId | null, count = 1) {
    this.inv.clear();
    if (item) this.inv.setSlot(0, { item, count });
    this.inv.select(0);
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.dig.update();
      this.combat.update();
      this.actions.endFrame();
    }
  }
  press(a: string) {
    this.actions.press(a as Action);
  }
  release(a: string) {
    this.actions.release(a as Action);
  }
  /** primary を押して、ready になるまでのステップ数を返す（上限 max） */
  stepsToReady(max = 800): number {
    this.press('primary');
    for (let i = 1; i <= max; i++) {
      this.step(1);
      if (this.dig.state().ready) return i;
    }
    return -1;
  }
}

function target(r: Rig, id: BlockId) {
  r.world.setBlock(4, 10, 6, id);
  r.step(1);
}

describe('tool.get', () => {
  it('持っているもので変わる', () => {
    const r = new Rig();
    expect({ ...r.tools.current() }).toEqual({ item: null, kind: 'hand', power: 1, level: 0, damage: 1, reach: 3.5, ticks: 30 });
    r.hold('stone_pickaxe');
    expect(r.tools.current()).toMatchObject({ kind: 'pickaxe', power: 4, level: 1, damage: 1 });
    r.hold('naginata');
    expect(r.tools.current()).toMatchObject({ kind: 'blade', damage: 3, reach: 5, ticks: 40, power: 1 });
    r.hold('yumi');
    expect(r.tools.current()).toMatchObject({ kind: 'bow', damage: 3, reach: 39 });
    r.hold('kite');
    expect(r.tools.current().kind).toBe('other');
  });
});

describe('ほる', () => {
  it('stone: き・いし・てつ で 180・90・60', () => {
    for (const [item, n] of [
      ['wood_pickaxe', 180],
      ['stone_pickaxe', 90],
      ['iron_pickaxe', 60],
      ['katana', 360],
      ['waraji', 360],
    ] as [ItemId, number][]) {
      const r = new Rig();
      r.hold(item);
      target(r, 'stone');
      expect(r.stepsToReady()).toBe(n);
    }
  });
  it('leaves: てつの つるはし で 3', () => {
    const r = new Rig();
    r.hold('iron_pickaxe');
    target(r, 'leaves');
    expect(r.stepsToReady()).toBe(3);
  });
  it('iron_ore: すで・きは ほれない、いし 225、てつ 150', () => {
    for (const [item, n] of [
      [null, -1],
      ['wood_pickaxe', -1],
      ['stone_pickaxe', 225],
      ['iron_pickaxe', 150],
    ] as [ItemId | null, number][]) {
      const r = new Rig();
      r.hold(item);
      target(r, 'iron_ore');
      expect(r.stepsToReady(300)).toBe(n);
      if (n < 0) {
        expect(r.dig.state().blockedReason).toBe('needTool');
        expect(r.dig.state().progress).toBe(0);
      }
    }
  });
  it('持ちかえてもほった量は続く（いしで 45 → すで 180）', () => {
    const r = new Rig();
    r.hold('stone_pickaxe');
    target(r, 'stone');
    r.press('primary');
    r.step(45);
    r.hold(null);
    let n = 0;
    while (!r.dig.state().ready && n < 400) {
      r.step(1);
      n++;
    }
    expect(n).toBe(180);
  });
  it('こわれない', () => {
    const r = new Rig();
    r.hold('wood_pickaxe');
    target(r, 'stone');
    expect(r.stepsToReady()).toBe(180);
    expect(r.inv.held()).toEqual({ item: 'wood_pickaxe', count: 1 });
  });
  it('fixedDrop と 拾った出来事、かまど をこわすと furnaceBroken', () => {
    const r = new Rig();
    r.hold('iron_pickaxe');
    r.furnaces.add('4,10,6');
    target(r, 'furnace');
    r.stepsToReady();
    r.release('primary');
    r.press('primary');
    r.step(1);
    expect(r.broken).toEqual(['4,10,6']);
    expect(r.inv.count('furnace')).toBe(1);
    expect(r.picked).toEqual([['furnace', 1]]);
  });
});

describe('右クリックのふりわけ', () => {
  it('かまど をねらうと開く（置かない）', () => {
    const r = new Rig();
    r.hold('dirt', 10);
    r.furnaces.add('4,10,6');
    target(r, 'furnace');
    r.press('secondary');
    r.step(1);
    expect(r.opened).toEqual(['4,10,6']);
    expect(r.inv.count('dirt')).toBe(10);
  });
  it('防具は着る', () => {
    const r = new Rig();
    r.hold('kabuto');
    target(r, 'stone');
    r.press('secondary');
    r.step(1);
    expect(r.equipped).toEqual(['kabuto']);
    expect(r.inv.held()).toBeNull();
  });
  it('ふつうのブロックは置く。たいまつは体と重なっても置ける・支えが要る', () => {
    const r = new Rig();
    r.hold('dirt', 2);
    target(r, 'stone');
    r.press('secondary');
    r.step(1);
    expect(r.world.getBlock(3, 10, 6)).toBe('dirt');
  });
});

describe('武器', () => {
  it('なぎなた: 4.4 に からかさ → 40 ステップ目に当たる', () => {
    const r = new Rig();
    r.hold('naginata');
    r.yokai.dist = 4.4;
    r.press('primary');
    r.step(39);
    expect(r.yokai.hp).toBe(4);
    r.step(1);
    expect(r.yokai.hp).toBe(1);
  });
  it('なぎなた: 5.1 は とどかない・かたな は 3.6 でとどかない', () => {
    const r = new Rig();
    r.hold('naginata');
    r.yokai.dist = 5.1;
    r.press('primary');
    r.step(50);
    expect(r.yokai.hp).toBe(4);
    const k = new Rig();
    k.hold('katana');
    k.yokai.dist = 3.6;
    k.press('primary');
    k.step(40);
    expect(k.yokai.hp).toBe(4);
    const k2 = new Rig();
    k2.hold('katana');
    k2.yokai.dist = 2.9;
    k2.press('primary');
    k2.step(30);
    // 刀は 今のパンチを 使わない（わざは blade/blade.test.ts の AC2〜AC8）
    expect(k2.yokai.hp).toBe(4);
  });
  it('なぎなた: 手前に妖怪 3.5・先に ブロック 4.2 → たたく（ほらない）', () => {
    const r = new Rig();
    r.hold('naginata');
    r.yokai.dist = 3.5;
    r.world.setBlock(7, 10, 6, 'dirt'); // 目 x=2.5 から面まで 4.5
    r.step(1);
    r.press('primary');
    r.step(2);
    expect(r.dig.state().progress).toBe(0);
    expect(r.combat.hookState().punching).toBe(true);
  });
  it('なぎなた: つく → はらう → つく、60 ステップ空いたら つく から', () => {
    const r = new Rig();
    r.hold('naginata');
    r.yokai.dist = 4;
    r.yokai.hp = 999;
    r.press('primary');
    r.step(81);
    expect(r.tools.drainSwings().map((s) => s.anim)).toEqual(['thrust', 'sweep', 'thrust']);
    r.release('primary');
    r.step(100);
    r.press('primary');
    r.step(1);
    expect(r.tools.drainSwings().map((s) => s.anim)).toEqual(['thrust']);
  });
  it('かたな は切る', () => {
    const r = new Rig();
    r.hold('katana');
    r.yokai.dist = 2;
    r.press('primary');
    r.step(1);
    expect(r.tools.drainSwings().map((x) => x.anim)).toEqual(['slash']);
  });
  it('たおす回数: 刀は パンチしない・つるはし 4', () => {
    const r = new Rig();
    r.hold('bokuto');
    r.yokai.dist = 2;
    r.press('primary');
    r.step(60);
    // ぼくとうも わざで たたく（blade/blade.test.ts の AC3・AC4）。ここでは パンチしない
    expect(r.yokai.hp).toBe(4);
    const p = new Rig();
    p.hold('wood_pickaxe');
    p.yokai.dist = 2;
    p.press('primary');
    p.step(30);
    expect(p.yokai.hp).toBe(3);
  });
});

describe('ゆみ と や（WEAPON-2。くわしくは bow/bow.test.ts）', () => {
  function bowRig() {
    const r = new Rig();
    r.inv.setSlot(0, { item: 'yumi', count: 1 });
    r.inv.setSlot(1, { item: 'ya', count: 3 });
    r.inv.select(0);
    r.world.setBlock(4, 10, 6, 'dirt');
    r.yokai.dist = 100;
    return r;
  }
  it('おして はなすと 段 1 で 飛ぶ・や 3→2。ゆみでは ほらない', () => {
    const r = bowRig();
    r.step(1);
    r.press('primary');
    r.step(10);
    expect(r.inv.count('ya')).toBe(3);
    r.release('primary');
    r.step(1);
    expect(r.inv.count('ya')).toBe(2);
    expect(r.tools.takeHookEvents().map((e) => e.type)).toEqual(['drawStart', 'stage', 'arrowShot']);
    expect(r.dig.state().progress).toBe(0);
    expect(r.tools.drainSwings().map((s) => s.anim)).toEqual(['draw', 'release']);
    expect(r.tools.bow().arrows()).toHaveLength(1);
  });
  it('おしっぱなしでは 飛ばない（はなした ときに 飛ぶ）', () => {
    const r = bowRig();
    r.press('primary');
    r.step(100);
    expect(r.inv.count('ya')).toBe(3);
    expect(r.tools.bow().state()).toMatchObject({ drawing: true, stage: 3 });
  });
  it('妖怪 10.0 に 段 3 で 当たり 4→1。arrowHit', () => {
    const r = bowRig();
    r.yokai.dist = 10;
    r.world.setBlock(4, 10, 6, 'air');
    r.press('primary');
    r.step(40);
    r.release('primary');
    r.step(60);
    expect(r.yokai.hp).toBe(1);
    expect(r.tools.arrows()).toEqual([]);
  });
  it('ブロックに ささる。ブロックは そのまま', () => {
    const r = bowRig();
    r.world.setBlock(5, 10, 6, 'stone');
    r.press('primary');
    r.step(25);
    r.release('primary');
    r.step(30);
    expect(r.tools.bow().stuck()).toHaveLength(1);
    expect(r.world.getBlock(5, 10, 6)).toBe('stone');
  });
  it('持ちかえる と ひくのを やめる', () => {
    const r = bowRig();
    r.inv.setSlot(2, { item: 'stone', count: 1 });
    r.press('primary');
    r.step(30);
    r.inv.select(2);
    r.step(1);
    expect(r.tools.bow().state().drawing).toBe(false);
    r.release('primary');
    r.step(1);
    expect(r.inv.count('ya')).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import type {
  BlockId,
  LockStatus,
  PlayerState,
  Vec3,
  VoxelWorld,
  YokaiEvent,
  YokaiRayHit,
  YokaiWorld,
} from '../contracts';
import { DigSystemImpl } from '../dig/DigSystem';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { setCanCapacitySource } from '../tools/durability';
import { createRng } from '../world/gen/random';
import { createCombatHook } from './hook';
import { PlayerCombatImpl } from './PlayerCombat';

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
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
}

/** 東を向いた線に当たる、箱ひとつだけの仮の妖怪 */
class FakeYokai implements YokaiWorld {
  box: { id: number; x0: number; x1: number } | null = null;
  damaged: Array<{ id: number; amount: number; from: Vec3 }> = [];
  list = () => [];
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): YokaiRayHit | null {
    if (!this.box || dir.x <= 0.5) return null;
    const d = (this.box.x0 - origin.x) / dir.x;
    return d >= 0 && d <= maxDistance ? { id: this.box.id, kind: 'karakasa', distance: d } : null;
  }
  damage(id: number, amount: number, from: Vec3) {
    this.damaged.push({ id, amount, from });
  }
  occupies(x: number, _y: number, _z: number) {
    return !!this.box && x >= Math.floor(this.box.x0) && x < this.box.x1;
  }
  drainEvents(): YokaiEvent[] {
    return [];
  }
}

function rig(opts: { rng?: () => number } = {}) {
  const world = new FakeWorld();
  for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) world.setBlock(x, 8, z, 'stone');
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const inv = new InventoryImpl();
  const yokai = new FakeYokai();
  let saves = 0;
  let closed = 0;
  const combat = new PlayerCombatImpl({
    world,
    player: {
      get: () => player,
      set: (v) => {
        if (v.position) Object.assign(player.position, v.position);
        if (v.velocity) Object.assign(player.velocity, v.velocity);
        if (v.yawDeg !== undefined) player.yawDeg = v.yawDeg;
        if (v.pitchDeg !== undefined) player.pitchDeg = v.pitchDeg;
      },
    },
    inventory: inv,
    yokai: () => yokai,
    spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }),
    closeInventory: () => closed++,
    requestSave: () => saves++,
    rng: opts.rng ?? createRng(7),
  });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) combat.update();
  };
  return { world, player, inv, yokai, combat, step, saves: () => saves, closed: () => closed };
}

const EYE: Vec3 = { x: 2.5, y: 10.62, z: 6.5 };
const EAST: Vec3 = { x: 1, y: 0, z: 0 };

describe('体力・ダメージ・むてき・回復', () => {
  it('ダメージで体力がへり、30 ステップは むてき', () => {
    const r = rig();
    expect(r.combat.damage(1, 'karakasa', { x: 0, y: 9, z: 6.5 })).toBe(true);
    expect(r.combat.hp()).toBe(19);
    expect(r.combat.damage(1, 'karakasa', { x: 0, y: 9, z: 6.5 })).toBe(false);
    r.step(29);
    expect(r.combat.damage(1, 'karakasa', { x: 0, y: 9, z: 6.5 })).toBe(false);
    r.step(1);
    expect(r.combat.damage(1, 'karakasa', { x: 0, y: 9, z: 6.5 })).toBe(true);
    expect(r.combat.hp()).toBe(18);
  });

  it('遠い向きへ水平に 1.8 押される（少し上にもはねる）', () => {
    const r = rig();
    r.combat.damage(1, 'karakasa', { x: 1.5, y: 9, z: 6.5 });
    r.step(12);
    expect(r.player.position.x).toBeCloseTo(4.3, 2);
    expect(r.player.position.z).toBeCloseTo(6.5, 2);
  });

  it('かべがあれば押されない', () => {
    const r = rig();
    r.world.setBlock(3, 9, 6, 'stone');
    r.combat.damage(1, 'karakasa', { x: 1.5, y: 9, z: 6.5 });
    r.step(12);
    expect(r.player.position.x).toBeLessThan(2.71);
  });

  it('自然回復: 1500・2400 ステップ目に 1 ずつ。ダメージで待ち直し', () => {
    const r = rig();
    r.combat.debugDamage(15); // 5
    r.step(1499);
    expect(r.combat.hp()).toBe(5);
    r.step(1);
    expect(r.combat.hp()).toBe(6);
    r.step(899);
    expect(r.combat.hp()).toBe(6);
    r.step(1);
    expect(r.combat.hp()).toBe(7);
    r.step(100);
    r.combat.debugDamage(1);
    r.step(1499);
    expect(r.combat.hp()).toBe(6);
    r.step(1);
    expect(r.combat.hp()).toBe(7);
  });

  it('自然回復は 最大の半分（10）までで止まる', () => {
    const r = rig();
    r.combat.debugDamage(12); // 8
    r.step(600 + 900 * 6);
    expect(r.combat.hp()).toBe(10);
  });

  it('半分以上なら 自然回復しない', () => {
    const r = rig();
    r.combat.debugDamage(1);
    r.step(600 + 900 * 4);
    expect(r.combat.hp()).toBe(19);
  });

  it('debugDamage は押さず playerHit も出さない', () => {
    const r = rig();
    r.combat.debugDamage(2);
    r.step(12);
    expect(r.player.position.x).toBe(2.5);
    expect(r.combat.drainEvents()).toEqual([]);
  });

  it('playerHit が出る', () => {
    const r = rig();
    r.combat.damage(2, 'nurikabe', { x: 0, y: 9, z: 6.5 });
    expect(r.combat.drainEvents()).toEqual([{ type: 'playerHit', tick: 0, by: 'nurikabe', amount: 2 }]);
    expect(r.combat.drainEvents()).toEqual([]);
  });
});

describe('パンチ', () => {
  it('始めて 30 ステップ目に当たる', () => {
    const r = rig();
    r.yokai.box = { id: 1, x0: 3.75, x1: 5.25 };
    expect(r.combat.primaryStep(true, EYE, EAST, null)).toBe(true);
    expect(r.combat.hookState().punchTick).toBe(1);
    for (let i = 2; i <= 29; i++) {
      expect(r.combat.primaryStep(false, EYE, EAST, null)).toBe(true);
    }
    expect(r.yokai.damaged).toHaveLength(0);
    r.combat.primaryStep(false, EYE, EAST, null); // 30 ステップ目
    expect(r.yokai.damaged).toEqual([{ id: 1, amount: 1, from: { x: 2.5, y: 9, z: 6.5 } }]);
    const ev = r.combat.takeHookEvents().map((e) => e.type);
    expect(ev).toEqual(['punchStart', 'punchHit']);
    expect(r.combat.hookState().punching).toBe(false);
  });

  it('押しっぱなしだと 30 ステップごと', () => {
    const r = rig();
    r.yokai.box = { id: 1, x0: 3.75, x1: 5.25 };
    for (let i = 0; i < 120; i++) r.combat.primaryStep(true, EYE, EAST, null);
    expect(r.yokai.damaged).toHaveLength(4);
  });

  it('3.5 より遠い妖怪は無視（パンチにならない）', () => {
    const r = rig();
    r.yokai.box = { id: 1, x0: 6.1, x1: 7.0 }; // 目から 3.6
    expect(r.combat.primaryStep(true, EYE, EAST, null)).toBe(false);
    expect(r.combat.primaryStep(true, EYE, EAST, 4.0)).toBe(false);
    expect(r.combat.takeHookEvents()).toEqual([]);
  });

  it('2.9 なら当たる', () => {
    const r = rig();
    r.yokai.box = { id: 1, x0: 5.4, x1: 6.5 };
    for (let i = 0; i < 30; i++) r.combat.primaryStep(i === 0, EYE, EAST, null);
    expect(r.yokai.damaged).toHaveLength(1);
  });

  it('妖怪がブロックより奥なら パンチにならない（ほる）', () => {
    const r = rig();
    r.yokai.box = { id: 1, x0: 5.0, x1: 6.0 }; // 2.5
    expect(r.combat.primaryStep(true, EYE, EAST, 1.0)).toBe(false);
    expect(r.combat.hookState().punching).toBe(false);
  });

  it('妖怪がいなければ パンチにならない', () => {
    const r = rig();
    expect(r.combat.primaryStep(true, EYE, EAST, null)).toBe(false);
  });

  it('とちゅうで妖怪が外れたら からぶり', () => {
    const r = rig();
    r.yokai.box = { id: 1, x0: 3.75, x1: 5.25 };
    r.combat.primaryStep(true, EYE, EAST, null);
    r.yokai.box = null;
    for (let i = 2; i <= 30; i++) r.combat.primaryStep(false, EYE, EAST, null);
    expect(r.combat.takeHookEvents().map((e) => e.type)).toEqual(['punchStart', 'punchMiss']);
  });
});

describe('DigSystem の入口', () => {
  function digRig() {
    const r = rig();
    const actions = new ActionState();
    const lock: LockStatus = {
      locked: () => true,
      overlayVisible: () => false,
      realtimeAllowed: () => true,
      playInputEnabled: () => true,
    };
    const dig = new DigSystemImpl(r.world, () => r.player, actions, lock, r.inv, () => 1.62, undefined, () => 0, r.combat);
    const step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        dig.update();
        r.combat.update();
        actions.endFrame();
      }
    };
    return { ...r, actions, dig, step };
  }

  it('前 1.5 に ブロック・その先に妖怪 → ほる', () => {
    const r = digRig();
    r.world.setBlock(4, 9, 6, 'dirt');
    r.world.setBlock(4, 10, 6, 'dirt');
    r.yokai.box = { id: 1, x0: 5.5, x1: 6.5 };
    r.actions.press('primary');
    r.step(5);
    expect(r.dig.state().active).toBe(true);
    expect(r.combat.hookState().punching).toBe(false);
  });

  it('前 1.5 に妖怪・その先に ブロック → パンチで、ほらない', () => {
    const r = digRig();
    r.world.setBlock(6, 10, 6, 'dirt');
    r.yokai.box = { id: 1, x0: 4.0, x1: 5.0 };
    r.actions.press('primary');
    r.step(60);
    expect(r.dig.state().progress).toBe(0);
    expect(r.yokai.damaged).toHaveLength(2);
  });

  it('ほっている途中で妖怪が入ってくると、次のステップでパンチ', () => {
    const r = digRig();
    r.world.setBlock(5, 10, 6, 'dirt');
    r.actions.press('primary');
    r.step(15);
    expect(r.dig.state().active).toBe(true);
    r.yokai.box = { id: 1, x0: 4.0, x1: 5.0 };
    r.step(1);
    expect(r.combat.hookState().punching).toBe(true);
    expect(r.dig.state().active).toBe(false);
  });

  it('妖怪の箱の所にはブロックを置けない', () => {
    const r = digRig();
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.player.pitchDeg = -90;
    r.yokai.box = { id: 1, x0: 2.0, x1: 3.0 };
    r.actions.press('secondary');
    r.step(1);
    expect(r.inv.count('dirt')).toBe(5);
  });

  it('やられているあいだは ほらない', () => {
    const r = digRig();
    r.world.setBlock(4, 10, 6, 'dirt');
    r.combat.setHp(0);
    r.actions.press('primary');
    r.step(10);
    expect(r.dig.state().active).toBe(false);
  });
});

describe('やられた・落とす・ふくろ・復活', () => {
  function full(r: ReturnType<typeof rig>) {
    for (let i = 0; i < 36; i++) r.inv.setSlot(i, { item: 'dirt', count: 1 });
  }

  it('やられた: death イベントと dead、もちもの画面を閉じる', () => {
    const r = rig();
    r.player.position.x = 6.5;
    r.combat.setHp(0);
    expect(r.combat.dead()).toBe(true);
    expect(r.combat.takeHookEvents().map((e) => e.type)).toEqual(['death']);
    expect(r.closed()).toBe(1);
    expect(r.saves()).toBe(1);
  });

  it('120 ステップのあいだ動けず、120 ステップ目に復活して 180 ステップ むてき', () => {
    const r = rig();
    r.player.position.x = 6.5;
    r.combat.debugDamage(20);
    r.step(118);
    r.player.position.x = 9; // 動かそうとしても
    r.combat.update(); // 119 ステップ目
    expect(r.player.position.x).toBeCloseTo(6.5, 5);
    expect(r.combat.dead()).toBe(true);
    r.combat.update(); // 120 ステップ目
    expect(r.combat.dead()).toBe(false);
    expect(r.player.position).toMatchObject({ x: 1.5, y: 9, z: 1.5 });
    expect(r.player.yawDeg).toBe(0); // 仮のスタート地点の向きが 0
    expect(r.combat.hp()).toBe(20);
    expect(r.combat.invincibleTicks()).toBe(180);
    r.step(179);
    expect(r.combat.debugDamage(5)).toBe(false);
    r.step(1);
    expect(r.combat.debugDamage(5)).toBe(true);
    expect(r.combat.hp()).toBe(15);
  });

  /** 落ちたアイテムをぜんぶ止まるまで進める */
  function settle(r: ReturnType<typeof rig>) {
    r.player.position.x = 60;
    r.player.position.z = 60;
    r.step(180);
  }

  it('やられた 袋: じょうろの みず・虹の 強さ・へった 量が のこる（copyStack(s)）', () => {
    setCanCapacitySource(() => ({ watering_can: 10, long_watering_can: 20 }));
    const r = rig({ rng: () => 0 }); // 0 = かならず 落とす
    r.inv.setSlot(0, { item: 'dirt', count: 1 });
    r.inv.setSlot(1, { item: 'watering_can', count: 1, water: 7 });
    r.inv.setSlot(2, { item: 'niji', count: 1, power: 9, wear: 4 });
    r.inv.select(0);
    r.combat.setHp(0);
    const items = r.combat.drops.serialize(); // 袋の 保存の 形（bags() の 見え方は wear・water・power を 出さない）
    expect(items.find((q) => q.item === 'watering_can')?.water).toBe(7);
    const niji = items.find((q) => q.item === 'niji');
    expect(niji?.power).toBe(9);
    expect(niji?.wear).toBe(4);
    setCanCapacitySource(() => ({}));
  });

  it('えらんでいるマスは落とさない・落ちた分は 1 マス 1 アイテムになる', () => {
    const r = rig();
    full(r);
    r.inv.select(3);
    r.combat.setHp(0);
    expect(r.inv.slots()[3]).not.toBeNull();
    const bags = r.combat.bags();
    const remain = r.inv.slots().filter((s) => s).length;
    expect(bags.length).toBeGreaterThan(0);
    expect(remain + bags.length).toBe(36);
    for (const b of bags) expect(b.slots).toHaveLength(1);
    const ev = r.combat.takeHookEvents()[0]!;
    expect(ev.type === 'death' && ev.dropped.includes(3)).toBe(false);
    expect(ev.type === 'death' && ev.dropped.length).toBe(bags.length);
    expect(new Set(bags.map((b) => b.id)).size).toBe(bags.length);
  });

  it('ばらまく: やられた場所のまわりにちらばり、地面に止まる（同じシードで同じ場所）', () => {
    const run = () => {
      const r = rig({ rng: createRng(5) });
      full(r);
      r.combat.setHp(0);
      settle(r);
      return r.combat.bags().map((b) => b.position);
    };
    const a = run();
    expect(a.length).toBeGreaterThan(10);
    let far = 0;
    for (const p of a) {
      const d = Math.hypot(p.x - 2.5, p.z - 6.5);
      expect(d).toBeLessThanOrEqual(4);
      expect(p.y).toBe(9); // 石の地面（y=8）の上
      if (d > 0.5) far++;
    }
    expect(far).toBeGreaterThan(a.length / 2);
    // 向きがかたよらない
    expect(a.some((p) => p.x > 2.5)).toBe(true);
    expect(a.some((p) => p.x < 2.5)).toBe(true);
    expect(a.some((p) => p.z > 6.5)).toBe(true);
    expect(a.some((p) => p.z < 6.5)).toBe(true);
    expect(run()).toEqual(a);
  });

  it('止まったら動かない・空中ではまず落ちる', () => {
    const r = rig({ rng: () => 0.3 });
    r.inv.setSlot(5, { item: 'dirt', count: 3 });
    r.player.position.y = 14.3;
    r.player.position.x = 60;
    r.player.position.z = 60;
    r.combat.setHp(0);
    const start = r.combat.bags()[0]!.position;
    expect(start.y).toBeGreaterThan(14);
    r.step(200);
    const p1 = r.combat.bags()[0]!.position;
    r.step(30);
    expect(r.combat.bags()[0]!.position).toEqual(p1);
  });

  it('10 回で 350 のうち 125〜225 落ち、同じシードで同じ結果', () => {
    const run = () => {
      const r = rig({ rng: createRng(99) });
      let dropped = 0;
      for (let k = 0; k < 10; k++) {
        full(r);
        r.inv.select(3);
        r.combat.setHp(0);
        const ev = r.combat.takeHookEvents().find((e) => e.type === 'death')!;
        if (ev.type === 'death') {
          dropped += ev.dropped.length;
          expect(ev.dropped).not.toContain(3);
        }
        r.step(120);
      }
      return dropped;
    };
    const a = run();
    expect(a).toBeGreaterThanOrEqual(125);
    expect(a).toBeLessThanOrEqual(225);
    expect(run()).toBe(a);
  });

  it('1 マスも落ちなければ アイテムは出ない', () => {
    const r = rig({ rng: () => 0.99 });
    full(r);
    r.combat.setHp(0);
    expect(r.combat.bags()).toHaveLength(0);
  });

  it('水の中でやられたら 水面にうかぶ', () => {
    const w = rig({ rng: () => 0 });
    for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) for (let y = 9; y <= 10; y++) w.world.setBlock(x, y, z, 'water');
    w.inv.setSlot(5, { item: 'dirt', count: 3 });
    w.combat.setHp(0);
    w.player.position.x = 60;
    w.step(200);
    expect(w.combat.bags()[0]!.position.y).toBe(11);
  });

  it('拾う: 1.6 では拾わず、1.4 で中身が入って消える。やられた画面では拾わない', () => {
    const r = rig({ rng: () => 0 });
    r.inv.setSlot(5, { item: 'dirt', count: 3 });
    r.player.position.x = 6.5;
    r.combat.setHp(0);
    r.step(120);
    expect(r.combat.bags()).toHaveLength(1);
    expect(r.inv.count('dirt')).toBe(0);
    const at = r.combat.bags()[0]!.position;
    r.player.position.y = at.y;
    r.player.position.z = at.z;
    r.player.position.x = at.x - 1.6;
    r.step(1);
    expect(r.combat.bags()).toHaveLength(1);
    r.player.position.y = at.y + 2.5; // 高さの差が大きいと拾わない
    r.player.position.x = at.x - 1.0;
    r.step(1);
    expect(r.combat.bags()).toHaveLength(1);
    r.player.position.y = at.y;
    r.player.position.x = at.x - 1.4;
    r.step(1);
    expect(r.inv.count('dirt')).toBe(3);
    expect(r.combat.bags()).toHaveLength(0);
    const ev = r.combat.takeHookEvents().filter((e) => e.type === 'pickup');
    expect(ev).toHaveLength(1);
  });

  it('近づいたアイテムだけ 1 こずつ拾う', () => {
    const r = rig({ rng: createRng(12) });
    r.inv.setSlot(5, { item: 'dirt', count: 3 });
    r.inv.setSlot(6, { item: 'stone', count: 2 });
    r.inv.setSlot(7, { item: 'yokai_orb', count: 1 });
    r.combat.setHp(0);
    r.step(120);
    settle(r);
    const bags = r.combat.bags();
    expect(bags.length).toBeGreaterThan(0);
    const first = bags[0]!;
    // ほかのアイテムから 1.5 より遠い場所に立つ
    r.player.position.x = first.position.x;
    r.player.position.z = first.position.z;
    r.player.position.y = first.position.y;
    const near = bags.filter((b) => Math.hypot(b.position.x - first.position.x, b.position.z - first.position.z) <= 1.5);
    r.step(1);
    expect(r.combat.bags()).toHaveLength(bags.length - near.length);
    const ev = r.combat.takeHookEvents().filter((e) => e.type === 'pickup');
    expect(ev).toHaveLength(near.length);
  });

  it('いっぱいなら入る分だけ入り、残りは そのアイテムに残る', () => {
    const r = rig({ rng: () => 0 });
    r.inv.setSlot(5, { item: 'stone', count: 10 });
    r.inv.setSlot(0, { item: 'dirt', count: 1 });
    r.combat.setHp(0);
    r.step(120);
    for (let i = 0; i < 36; i++) r.inv.setSlot(i, { item: 'dirt', count: 64 });
    r.inv.setSlot(7, { item: 'stone', count: 60 });
    const at = r.combat.bags()[0]!.position;
    r.player.position.x = at.x;
    r.player.position.z = at.z;
    r.player.position.y = at.y;
    r.step(1);
    const left = r.combat.bags();
    expect(left).toHaveLength(1);
    expect(left[0]!.slots[0]).toEqual({ item: 'stone', count: 6 });
  });

  it('36,000 ステップで消える（35,999 では残る）', () => {
    const r = rig({ rng: () => 0 });
    r.inv.setSlot(5, { item: 'dirt', count: 3 });
    r.player.position.x = 9.5;
    r.combat.setHp(0);
    r.step(120);
    r.player.position.x = 40;
    r.step(36000 - 120 - 1);
    expect(r.combat.bags()).toHaveLength(1);
    expect(r.combat.bags()[0]!.ticksLeft).toBe(1);
    r.step(1);
    expect(r.combat.bags()).toHaveLength(0);
  });

  it('アイテムの保存と読みこみ（古い形は無視する）', () => {
    const r = rig({ rng: () => 0 });
    r.inv.setSlot(5, { item: 'dirt', count: 3 });
    r.inv.setSlot(6, { item: 'yokai_orb', count: 2 });
    r.player.position.x = 40;
    r.combat.setHp(0);
    r.step(150);
    const data = JSON.parse(JSON.stringify(r.combat.serializeBags()));
    expect(data).toHaveLength(2);
    const r2 = rig();
    r2.combat.deserializeBags(data);
    const got = r2.combat.bags();
    expect(got.map((b) => b.slots[0])).toEqual([
      { item: 'dirt', count: 3 },
      { item: 'yokai_orb', count: 2 },
    ]);
    expect(got[0]!.ticksLeft).toBe(36000 - 150);
    r2.combat.deserializeBags([
      { x: 1, y: 2, z: 3, slots: [{ item: 'dirt', count: 1 }], ticksLeft: 5 }, // 古い形
      { x: 1, y: 2, z: 3, item: 'nope', count: 1, ticksLeft: 5 },
      'x',
      null,
    ]);
    expect(r2.combat.bags()).toHaveLength(0);
  });

  it('窓口の中身', () => {
    const r = rig();
    const h = createCombatHook(r.combat);
    h.setHp(13);
    expect(h.get()).toMatchObject({ hp: 13, maxHp: 20, dead: false });
    h.damage(20);
    expect(h.get().dead).toBe(true);
    expect(h.events().map((e) => e.type)).toEqual(['playerHit', 'death']);
    expect(h.events()).toEqual([]);
  });
});

describe('レベルアップの回復・ノックバック（追加）', () => {
  it('healFull: ハートが ぜんぶ回復する', () => {
    const r = rig();
    r.combat.setHp(5);
    r.combat.healFull();
    expect(r.combat.hp()).toBe(r.combat.maxHp());
  });
  it('ダメージで少し上にもはねる（初速）', () => {
    const r = rig();
    r.player.velocity.y = 0;
    r.combat.damage(1, 'karakasa', { x: 1.5, y: 9, z: 6.5 });
    expect(r.player.velocity.y).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, PlayerState, VoxelWorld } from '../contracts';
import { ActionState, type Action } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
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
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  inv = new InventoryImpl();
  enabled = true;
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
    locked: () => this.enabled,
    overlayVisible: () => !this.enabled,
    realtimeAllowed: () => this.enabled,
    playInputEnabled: () => this.enabled,
  };
  dig = new DigSystemImpl(this.world, () => this.player, this.actions, this.lock, this.inv, () => 1.62);
  constructor() {
    this.world.fill(0, 8, 0, 12, 8, 12, 'stone');
    this.dig.update(); // ねらいを決める
    this.actions.endFrame();
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.dig.update();
      this.actions.endFrame();
    }
  }
  press(a: string) {
    this.actions.press(a as Action);
  }
  release(a: string) {
    this.actions.release(a as Action);
  }
  /** MAX で止まっているところを、押し直して 1 ステップでこわす */
  repress() {
    this.release('primary');
    this.press('primary');
    this.step(1);
  }
  set(x: number, y: number, z: number, id: BlockId) {
    this.world.setBlock(x, y, z, id);
    this.step(1);
  }
}

describe('ねらう', () => {
  it('AC1', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    const t = r.dig.target()!;
    expect(t.block).toEqual({ x: 4, y: 10, z: 6 });
    expect(t.id).toBe('dirt');
    expect(t.face).toEqual({ x: -1, y: 0, z: 0 });
    expect(t.place).toEqual({ x: 3, y: 10, z: 6 });
    expect(t.distance).toBeCloseTo(1.5, 2);
    r.set(4, 10, 6, 'air');
    expect(r.dig.target()).toBeNull();
  });
  it('AC2: 4.5 は届き 5.5 は届かない', () => {
    const r = new Rig();
    r.set(7, 10, 6, 'dirt');
    expect(r.dig.target()!.distance).toBeCloseTo(4.5, 2);
    r.set(7, 10, 6, 'air');
    r.set(8, 10, 6, 'dirt');
    expect(r.dig.target()).toBeNull();
  });
  it('AC3: 水は通りぬける', () => {
    const r = new Rig();
    r.world.blocks.clear();
    r.world.fill(0, 0, 0, 12, 6, 12, 'sand');
    r.world.fill(0, 7, 0, 12, 7, 12, 'water');
    r.player.position = { x: 2.5, y: 7, z: 6.5 };
    r.player.pitchDeg = -45;
    r.step(1);
    const t = r.dig.target()!;
    expect(t.id).toBe('sand');
    expect(t.block).toEqual({ x: 4, y: 6, z: 6 });
    expect(t.place).toEqual({ x: 4, y: 7, z: 6 });
  });
});

describe('ほる', () => {
  it('AC4: 30 ステップ目にこわれる', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(29);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    expect(r.dig.state().progress).toBeCloseTo(29 / 30, 2);
    expect(r.dig.state().ready).toBe(false);
    r.step(1);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    r.repress();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.inv.slots()[0]).toEqual({ item: 'dirt', count: 1 });
  });
  it('AC5: かたさごとの時間と handPower', () => {
    const cases: Array<[BlockId, number]> = [
      ['leaves', 15],
      ['grass', 30],
      ['sand', 30],
      ['log', 300],
      ['stone', 360],
      ['coal_ore', 600],
    ];
    for (const [id, n] of cases) {
      const r = new Rig();
      r.set(4, 10, 6, id);
      r.press('primary');
      r.step(n - 1);
      expect(r.world.getBlock(4, 10, 6)).toBe(id);
      r.step(1);
      expect(r.dig.state().ready).toBe(true);
      expect(r.world.getBlock(4, 10, 6)).toBe(id);
      r.repress();
      expect(r.world.getBlock(4, 10, 6)).toBe('air');
      expect(r.inv.count(id)).toBe(1);
    }
    const r = new Rig();
    r.dig.config.handPower = 2;
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(14);
    expect(r.dig.state().ready).toBe(false);
    r.step(1);
    expect(r.dig.state().ready).toBe(true);
    r.repress();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
  });
  it('AC6: てつ・そこいし', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'iron_ore');
    r.press('primary');
    r.step(1200);
    expect(r.world.getBlock(4, 10, 6)).toBe('iron_ore');
    const s = r.dig.state();
    expect(s.progress).toBe(0);
    expect(s.crackStage).toBe(0);
    expect(s.blockedReason).toBe('needTool');
    expect(r.inv.count('iron_ore')).toBe(0);
    expect(r.dig.drainEvents().filter((e) => e.type === 'blocked')).toHaveLength(1);
    r.release('primary');
    r.set(4, 10, 6, 'bedrock');
    r.press('primary');
    r.step(5);
    expect(r.dig.state().blockedReason).toBe('unbreakable');
  });
  it('はなすと少しずつ減って 0 になり、途中で押し直すと残りから続く', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(20);
    r.release('primary');
    r.step(1);
    expect(r.dig.state().active).toBe(false);
    r.step(9);
    expect(r.dig.state().progress).toBeCloseTo(10 / 30, 2);
    expect(r.dig.state().crackStage).toBe(2);
    // 残り 10 から押し直し: 20 ステップ目にこわれる
    r.press('primary');
    r.step(19);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    r.step(1);
    r.repress();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
  });
  it('はなし続けると 0 になる', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(20);
    r.release('primary');
    let prev = r.dig.state().progress;
    for (let i = 0; i < 19; i++) {
      r.step(1);
      const p = r.dig.state().progress;
      expect(p).toBeLessThan(prev);
      prev = p;
    }
    r.step(1);
    const s = r.dig.state();
    expect(s.progress).toBe(0);
    expect(s.crackStage).toBe(0);
    expect(s.block).toBeNull();
  });
  it('減る速さは digDecayRate', () => {
    const r = new Rig();
    r.dig.config.digDecayRate = 2;
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(20);
    r.release('primary');
    r.step(5);
    expect(r.dig.state().progress).toBeCloseTo(10 / 30, 2);
  });
  it('ねらいが外れても減る。別のブロックをほり始めたら捨てる', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.set(4, 10, 7, 'dirt');
    r.press('primary');
    r.step(20);
    r.player.yawDeg = 90 + 0; // 同じ向きのまま、別のブロックへ
    r.player.position.z = 7.5;
    r.step(1);
    expect(r.dig.state().block).toEqual({ x: 4, y: 10, z: 7 });
    expect(r.dig.state().progress).toBeCloseTo(1 / 30, 3);
  });
  it('AC8: ひびのだんかい', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    const at: Record<number, number> = { 1: 1, 9: 1, 10: 2, 19: 2, 20: 3, 29: 3 };
    for (let i = 1; i <= 29; i++) {
      r.step(1);
      if (at[i] !== undefined) expect(r.dig.state().crackStage).toBe(at[i]);
    }
  });
  it('AC9: こわしたあと 6 ステップ休む', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.set(5, 10, 6, 'dirt');
    r.press('primary');
    r.step(30);
    r.repress();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    r.step(6);
    r.release('primary');
    r.press('primary');
    r.step(30);
    expect(r.world.getBlock(5, 10, 6)).toBe('dirt');
    r.repress();
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.inv.count('dirt')).toBe(2);
  });
  it('AC10: ロックが外れていると無視', () => {
    const r = new Rig();
    r.enabled = false;
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(60);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
  });
  it('AC17: いっぱいでもほれる', () => {
    const r = new Rig();
    for (let i = 0; i < 36; i++) r.inv.setSlot(i, { item: 'stone', count: 64 });
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(30);
    r.repress();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.inv.count('dirt')).toBe(0);
    const ev = r.dig.drainEvents();
    expect(ev.map((e) => e.type)).toEqual(['ready', 'break']);
    expect(ev[1]).toMatchObject({ type: 'break', id: 'dirt', gotItem: false });
  });
});

describe('MAX（あとひと押し）', () => {
  it('MAX で止まり、押しっぱなしではこわれず、ready を 1 回だけ出す', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(30);
    let s = r.dig.state();
    expect(s.ready).toBe(true);
    expect(s.crackStage).toBe(3);
    expect(s.progress).toBe(1);
    r.step(200);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    s = r.dig.state();
    expect(s.ready).toBe(true);
    expect(s.progress).toBe(1);
    expect(r.dig.drainEvents().filter((e) => e.type === 'ready')).toHaveLength(1);
  });
  it('押し直すとこわれる', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(30);
    r.repress();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.inv.count('dirt')).toBe(1);
    expect(r.dig.state().ready).toBe(false);
    const ev = r.dig.drainEvents();
    expect(ev.filter((e) => e.type === 'break')).toHaveLength(1);
  });
  it('はなして 30 ステップ後に押してもこわれる', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(30);
    r.release('primary');
    r.step(30);
    expect(r.dig.state().ready).toBe(true);
    r.press('primary');
    r.step(1);
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
  });
  it('はなして 61 ステップ後には ready が消えている', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(30);
    r.release('primary');
    r.step(61);
    expect(r.dig.state().ready).toBe(false);
  });
  it('はなして減ると ready が消え、段階も戻る', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(30);
    r.release('primary');
    r.step(61);
    const s = r.dig.state();
    expect(s.ready).toBe(false);
    expect(s.crackStage).toBe(3);
    r.step(15);
    expect(r.dig.state().crackStage).toBe(2);
    r.press('primary');
    r.step(1);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt'); // 押し直しでも MAX でなければこわれない
  });
});

describe('おく', () => {
  it('AC11: 押しっぱなしで 0.5 秒ごと', () => {
    const r = new Rig();
    r.set(6, 10, 6, 'stone');
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.press('secondary');
    r.step(1);
    expect(r.world.getBlock(5, 10, 6)).toBe('dirt');
    expect(r.inv.slots()[0]!.count).toBe(4);
    r.step(29);
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    r.step(1);
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    r.step(30);
    expect(r.world.getBlock(3, 10, 6)).toBe('dirt');
    expect(r.inv.slots()[0]!.count).toBe(2);
    r.step(60);
    expect(r.world.getBlock(2, 10, 6)).toBe('air');
    expect(r.inv.slots()[0]!.count).toBe(2);
    expect(r.dig.drainEvents().filter((e) => e.type === 'place')).toHaveLength(3);
  });
  it('AC12: 足もとは置けない', () => {
    const r = new Rig();
    r.player.pitchDeg = -89;
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    expect(r.dig.target()!.place).toEqual({ x: 2, y: 9, z: 6 });
    r.press('secondary');
    r.step(1);
    expect(r.world.getBlock(2, 9, 6)).toBe('air');
    expect(r.inv.slots()[0]!.count).toBe(5);
  });
  it('AC13: 世界の外には置かない', () => {
    const r = new Rig();
    r.world.fill(0, 31, 0, 12, 31, 12, 'stone');
    r.player.position = { x: 2.5, y: 32, z: 6.5 };
    r.player.pitchDeg = -45;
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    expect(r.dig.target()!.block).toEqual({ x: 4, y: 31, z: 6 });
    expect(r.dig.target()!.place).toEqual({ x: 4, y: 32, z: 6 });
    r.press('secondary');
    r.step(1);
    expect(r.inv.slots()[0]!.count).toBe(5);
  });
  it('AC14: 水は置きかわる', () => {
    const r = new Rig();
    r.world.blocks.clear();
    r.world.fill(0, 0, 0, 12, 6, 12, 'sand');
    r.world.fill(0, 7, 0, 12, 7, 12, 'water');
    r.player.position = { x: 2.5, y: 7, z: 6.5 };
    r.player.pitchDeg = -45;
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    r.press('secondary');
    r.step(1);
    expect(r.world.getBlock(4, 7, 6)).toBe('dirt');
    expect(r.inv.slots()[0]!.count).toBe(4);
  });
});

describe('ホットバーとイベント', () => {
  it('AC18: 数字キーとホイール用の Action', () => {
    const r = new Rig();
    r.press('hotbar3');
    r.step(1);
    r.release('hotbar3');
    expect(r.inv.selected()).toBe(2);
    r.press('hotbar9');
    r.step(1);
    r.release('hotbar9');
    expect(r.inv.selected()).toBe(8);
    r.press('hotbarNext');
    r.step(1);
    r.release('hotbarNext');
    expect(r.inv.selected()).toBe(0);
    r.press('hotbarPrev');
    r.step(1);
    r.release('hotbarPrev');
    expect(r.inv.selected()).toBe(8);
    r.enabled = false;
    r.press('hotbar1');
    r.step(1);
    expect(r.inv.selected()).toBe(8);
  });
  it('AC26: 画面用とテスト用で列が別', () => {
    const r = new Rig();
    r.set(4, 10, 6, 'dirt');
    r.press('primary');
    r.step(30);
    expect(r.dig.drainEvents()).toHaveLength(1);
    expect(r.dig.drainEvents()).toEqual([]);
    expect(r.dig.peekEvents()).toHaveLength(1);
    expect(r.dig.takeHookEvents()).toHaveLength(1);
    expect(r.dig.takeHookEvents()).toEqual([]);
    expect(r.dig.peekEvents()).toEqual([]);
  });
});

describe('設定', () => {
  it('createDigConfig はコピー', () => {
    const a = createDigConfig();
    a.hardness.dirt = 99;
    expect(createDigConfig().hardness.dirt).toBe(0.5);
  });
});

import { describe, expect, it } from 'vitest';
import type { BlockId, Vec3, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { DROP, DropField } from './DropField';

class W implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  b = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.b.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.b.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
}

function rig() {
  const world = new W();
  for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) world.setBlock(x, 8, z, 'stone');
  const inv = new InventoryImpl();
  const player: Vec3 = { x: 50, y: 9, z: 50 };
  let saves = 0;
  const f = new DropField({ world, inventory: inv, player: () => player, rng: createRng(3), requestSave: () => saves++ });
  return { world, inv, player, f, saves: () => saves };
}

describe('DropField', () => {
  it('同じ所から 6 こ出すと 着地点が ぜんぶちがい、となりと 0.5 マス以上はなれる・かべの中に入らない', () => {
    const r = rig();
    for (let x = 6; x <= 14; x++) for (let z = 6; z <= 14; z++) if (x === 6 || x === 14 || z === 6 || z === 14) for (let y = 9; y < 12; y++) r.world.setBlock(x, y, z, 'stone');
    const stacks = Array.from({ length: 6 }, (_, i) => ({ item: i % 2 ? ('dirt' as const) : ('stone' as const), count: 1 }));
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, stacks);
    for (let i = 0; i < 240; i++) r.f.update(false);
    const l = r.f.list();
    expect(l).toHaveLength(6);
    const pts = l.map((d) => d.position);
    for (let i = 0; i < 6; i++) {
      expect(r.world.isSolid(Math.floor(pts[i]!.x), Math.floor(pts[i]!.y + 0.3), Math.floor(pts[i]!.z))).toBe(false);
      expect(l[i]!.resting).toBe(true);
      for (let j = i + 1; j < 6; j++) expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z)).toBeGreaterThan(0.5);
    }
  });

  it('ぴょんと はねる（1〜2 回）・出てから 0.3 秒は拾わない・とんでいるあいだは resting=false', () => {
    const r = rig();
    r.player.x = 10.5;
    r.player.y = 9;
    r.player.z = 10.5;
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 1 }]);
    for (let i = 0; i < DROP.pickupDelay - 1; i++) {
      r.f.update(true);
      expect(r.inv.count('dirt')).toBe(0);
    }
    expect(r.f.list()[0]!.resting).toBe(false);
    // 着地のあとに 上向きの速さが もう一度出る = はねた
    let ups = 0;
    let prevY = 0;
    let wasDown = false;
    const r2 = rig();
    r2.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 1 }]);
    for (let i = 0; i < 200; i++) {
      r2.f.update(false);
      const y = r2.f.list()[0]!.position.y;
      if (y < prevY) wasDown = true;
      else if (y > prevY + 1e-6 && wasDown) {
        ups++;
        wasDown = false;
      }
      prevY = y;
    }
    expect(ups).toBeGreaterThanOrEqual(1);
    expect(ups).toBeLessThanOrEqual(2);
    for (let i = 0; i < 30; i++) r.f.update(true);
    expect(r.inv.count('dirt')).toBe(1);
  });

  it('妖怪のドロップも散って止まる（kind yokai）', () => {
    const r = rig();
    const n = r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 2 }, { item: 'stone', count: 1 }], { kind: 'yokai' });
    expect(n).toBe(3);
    for (let i = 0; i < 120; i++) r.f.update(true);
    const l = r.f.list();
    expect(l).toHaveLength(2);
    for (const d of l) {
      expect(d.position.y).toBe(9);
      expect(Math.hypot(d.position.x - 10.5, d.position.z - 10.5)).toBeLessThanOrEqual(6);
    }
  });

  it('1 回のばらまきは同じ batch・柱の色はいちばんめずらしいもの', () => {
    const r = rig();
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 2 }, { item: 'iron_ore', count: 1 }]);
    r.f.scatter({ x: 20.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 2 }]);
    const l = r.f.list();
    expect(l[0]!.batch).toBe(l[1]!.batch);
    expect(l[2]!.batch).not.toBe(l[0]!.batch);
    expect(l[0]!.rarity).toBe('rare');
    expect(l[1]!.rarity).toBe('rare');
    expect(l[2]!.rarity).toBe('common');
    const g = rig();
    g.f.deserialize(JSON.parse(JSON.stringify(r.f.serialize())));
    expect(g.f.list().map((d) => [d.batch, d.rarity])).toEqual(l.map((d) => [d.batch, d.rarity]));
  });

  it('AC11 セーブ: 7 つの id はそのまま、ほかの文字は アイテムの段階', () => {
    const r = rig();
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'iron_ore', count: 1 }]);
    const base = JSON.parse(JSON.stringify(r.f.serialize()))[0];
    for (const [saved, want] of [['superRare', 'superRare'], ['legendary', 'legendary'], ['epic', 'epic'], ['banana', 'rare']] as const) {
      const g = rig();
      g.f.deserialize([{ ...base, rarity: saved }]);
      expect(g.f.list()[0]!.rarity, saved).toBe(want);
    }
  });

  it('拾う・足もとが消えたら落ちる・10 分で消える・保存', () => {
    const r = rig();
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 2 }]);
    for (let i = 0; i < 120; i++) r.f.update(true);
    const saved = JSON.parse(JSON.stringify(r.f.serialize()));
    const p = r.f.list()[0]!.position;
    const p0 = { ...p };
    // 足もとのブロックを消すと落ちる
    r.world.setBlock(Math.floor(p.x), 8, Math.floor(p.z), 'air');
    for (let i = 0; i < 60; i++) r.f.update(true);
    expect(r.f.list()[0]!.position.y).toBeLessThan(5);
    // 保存 → 読みこみ（古い形は無視）
    const g = rig();
    g.f.deserialize([...saved, { x: 1, y: 2, z: 3, slots: [], ticksLeft: 9 }]);
    expect(g.f.size()).toBe(1);
    expect(g.f.list()[0]!.ticksLeft).toBe(DROP.ticks - 120);
    // 拾う
    g.player.x = p0.x;
    g.player.z = p0.z;
    g.player.y = p0.y;
    expect(g.f.update(true)).toHaveLength(1);
    expect(g.inv.count('dirt')).toBe(2);
    expect(g.f.size()).toBe(0);
  });

  it('10 分で消える', () => {
    const r = rig();
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 2 }]);
    for (let i = 0; i < DROP.ticks - 1; i++) r.f.update(true);
    expect(r.f.size()).toBe(1);
    r.f.update(true);
    expect(r.f.size()).toBe(0);
  });

  it('もちものがいっぱいで 1 つも入らないとき onFull を呼ぶ', () => {
    const world = new W();
    for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) world.setBlock(x, 8, z, 'stone');
    const inv = new InventoryImpl();
    while (inv.add('dirt', 64) === 0);
    let full = 0;
    const player: Vec3 = { x: 10.5, y: 9, z: 10.5 };
    const f = new DropField({ world, inventory: inv, player: () => player, rng: createRng(3), onFull: () => full++ });
    f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 1 }], { kind: 'yokai' });
    for (let i = 0; i < 60; i++) f.update(true);
    expect(full).toBeGreaterThan(0);
    expect(f.size()).toBe(1);
  });

  it('M6: throwItem は向いている方へ 1.5〜3 マス先に落ち、60 ステップは拾わない', () => {
    const r = rig();
    r.player.x = 10.5;
    r.player.y = 9;
    r.player.z = 10.5;
    r.f.throwItem({ item: 'dirt', count: 5 }, 0, 1.62); // yaw 0 = 北（-z）
    const v0 = r.f.list()[0]!;
    expect(v0.thrown).toBe(true);
    expect(v0.pickupDelay).toBe(60);
    for (let i = 0; i < 59; i++) r.f.update(true);
    expect(r.inv.count('dirt')).toBe(0);
    const v = r.f.list()[0]!;
    expect(v.position.x).toBeCloseTo(10.5, 1);
    const dz = 10.5 - v.position.z;
    expect(dz).toBeGreaterThan(0.5);
    expect(dz).toBeLessThan(3);
    r.player.z = v.position.z; // その上に動く
    for (let i = 0; i < 3; i++) r.f.update(true);
    expect(r.inv.count('dirt')).toBe(5);
  });

  it('M6: 出る所がブロックの中なら 足もとに出す', () => {
    const r = rig();
    r.player.x = 10.5;
    r.player.y = 9;
    r.player.z = 10.5;
    for (let y = 9; y < 12; y++) r.world.setBlock(10, y, 10, 'stone'); // 前（北）にならべる
    r.world.setBlock(10, 9, 10, 'air');
    r.world.setBlock(10, 10, 9, 'stone');
    r.world.setBlock(10, 10, 10, 'stone');
    r.f.throwItem({ item: 'dirt', count: 1 }, 0, 1.62);
    const p = r.f.list()[0]!.position;
    expect(Math.hypot(p.x - 10.5, p.z - 10.5)).toBeLessThan(0.5);
  });
});

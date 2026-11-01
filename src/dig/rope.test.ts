import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import { tetherOf } from '../world/blocks/ropeTether';

/** ROPE-1 版 3（docs/design/ROPE-1.md）: がけに むかって 使うと 足もとに くい・まえへ たれる・こわすと ぜんぶ もどる・あさ。台は gadgetBlocks.test.ts と 同じ */

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
    // 固くない置き物（たいまつ・ちょうちん）は 支えにならない
    return b !== 'outside' && b !== 'air' && b !== 'water' && b !== 'rope' && b !== 'rope_coil' && b !== 'rope_stake';
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  inv = new InventoryImpl();
  player: PlayerState = {
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
  lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  dig = new DigSystemImpl(this.world, () => this.player, this.actions, this.lock, this.inv, () => 1.62, createDigConfig(), () => 0);
  constructor() {
    this.world.fill(0, 8, 0, 12, 8, 12, 'stone');
    this.step();
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.dig.update();
      this.actions.endFrame();
    }
  }
  hold(item: ItemId, count = 1) {
    this.inv.clear();
    this.inv.setSlot(0, { item, count });
    this.inv.select(0);
    this.step();
  }
  /** 右クリックを 1 回 */
  rightClick() {
    this.actions.press('secondary');
    this.step();
    this.actions.release('secondary');
    this.step();
  }
  /** ねらっているブロックを ひびが MAX になるまで押して、押し直してこわす */
  breakAimed() {
    this.actions.press('primary');
    for (let i = 0; i < 900 && !this.dig.state().ready; i++) this.step();
    this.actions.release('primary');
    this.actions.press('primary');
    this.step();
    this.actions.release('primary');
    this.step();
  }
}


/** 版 3 の がけ: x=0〜2 の 台（上面 y=top-1）に 立ち、+x を 向く。x=3 の 列は 台の 高さから 床（y=8 の いし）まで あいて いる */
function cliff(r: Rig, top: number) {
  r.world.fill(0, 9, 0, 2, top - 1, 12, 'stone');
  r.player.position = { x: 2.5, y: top, z: 6.5 };
  r.player.yawDeg = 90;
  r.step();
}
const at = (r: Rig, x: number, y: number) => r.world.getBlock(x, y, 6);

describe('ロープを たらす（版 3: AC1・AC2・AC21〜AC23）', () => {
  it('がけに むかって 右クリック: 足もとに くい、まえの 列に 下へ たれて 床で ロープだまり。1 本 へる', () => {
    const r = new Rig();
    cliff(r, 15); // x=3 の 列は y=15〜9 の 7 マス
    r.hold('rope', 2);
    r.rightClick();
    expect(at(r, 2, 15)).toBe('rope_stake');
    expect([15, 14, 13, 12, 11, 10].map((y) => at(r, 3, y)).every((b) => b === 'rope')).toBe(true);
    expect(at(r, 3, 9)).toBe('rope_coil');
    expect(at(r, 3, 8)).toBe('stone');
    expect(r.inv.count('rope')).toBe(1);
  });
  it('1 本は 10 マスで とまる（ロープだまり なし）・2 本なら 13 マス 目の 床で ロープだまり', () => {
    const one = new Rig();
    cliff(one, 21); // 21〜9 の 13 マス
    one.hold('rope', 1);
    one.rightClick();
    expect(Array.from({ length: 10 }, (_, i) => at(one, 3, 21 - i)).every((b) => b === 'rope')).toBe(true);
    expect(at(one, 3, 11)).toBe('air');
    expect(one.inv.count('rope')).toBe(0);

    const two = new Rig();
    cliff(two, 21);
    two.hold('rope', 3);
    two.rightClick();
    expect(at(two, 3, 9)).toBe('rope_coil');
    expect(two.inv.count('rope')).toBe(1); // 13 マス = 2 本
  });
  it('まえが がけで ない（たいら・かべ）: 足もとに くいを うって つなぐ（1 本。長さ = もって いた 本数 × 10）', () => {
    const flat = new Rig(); // y=8 の 床の 上（まえも 床）
    flat.hold('rope', 3);
    flat.rightClick();
    expect(flat.world.getBlock(2, 9, 6)).toBe('rope_stake');
    expect(flat.inv.count('rope')).toBe(2);
    expect(tetherOf(flat.world).anchor).toEqual({ x: 2, y: 9, z: 6 });
    expect(tetherOf(flat.world).len).toBe(30);
    expect([...flat.world.blocks.values()].filter((b) => b === 'rope').length).toBe(0);

    const wall = new Rig();
    cliff(wall, 15);
    wall.world.fill(3, 9, 6, 3, 15, 6, 'stone'); // まえが かべ
    wall.hold('rope', 1);
    wall.rightClick();
    expect(at(wall, 2, 15)).toBe('rope_stake');
    expect(at(wall, 3, 16)).toBe('air');
    expect(tetherOf(wall.world).len).toBe(10);
  });
  it('むきは 4 方向で いちばん 近い ほう（がけと ちがう ほうを 向くと つなぎ に なる）', () => {
    const r = new Rig();
    cliff(r, 15);
    r.player.yawDeg = 70; // +x に ちかい
    r.hold('rope', 1);
    r.rightClick();
    expect(at(r, 3, 15)).toBe('rope');
    expect(tetherOf(r.world).anchor).toBeNull();
  });
  it('空中（足もとの 下が 固くない）では 使えない', () => {
    const r = new Rig();
    cliff(r, 15);
    r.player.position = { x: 2.5, y: 17, z: 6.5 };
    r.hold('rope', 1);
    r.rightClick();
    expect(r.inv.count('rope')).toBe(1);
  });
});

describe('つなぎ と ロープの さく（版 3: AC26〜AC30）', () => {
  function tied(count: number) {
    const r = new Rig();
    r.hold('rope', count);
    r.rightClick(); // (2,9,6) に くい
    r.player.position = { x: 5.5, y: 9, z: 6.5 };
    r.step();
    return r;
  }
  it('つないで いる 間の 右クリックは 足もとに さく 1 マス（1 本）。プレイヤーは さくの 上へ。上に つめる', () => {
    const r = tied(4);
    r.rightClick();
    expect(r.world.getBlock(5, 9, 6)).toBe('rope_fence');
    expect(r.player.position.y).toBe(10);
    expect(r.inv.count('rope')).toBe(2);
    r.rightClick();
    expect(r.world.getBlock(5, 10, 6)).toBe('rope_fence');
    expect(r.player.position.y).toBe(11);
    expect(r.inv.count('rope')).toBe(1);
    expect(r.world.getBlock(6, 9, 6)).toBe('air'); // くいと さくの 間に なわは わたらない
  });
  it('さく・つなぎの くいを こわすと それ だけ 消えて 1 本 もどる。くいなら つなぎも きれる', () => {
    const r = tied(4);
    r.rightClick();
    r.rightClick();
    const brk = (x: number, y: number) =>
      (r.dig as unknown as { breaker: { breakBlock(t: unknown, g: boolean): string } }).breaker.breakBlock({ block: { x, y, z: 6 }, id: r.world.getBlock(x, y, 6), face: { x: 0, y: 1, z: 0 }, place: { x, y: y + 1, z: 6 }, distance: 1 }, false);
    brk(5, 10);
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.world.getBlock(5, 9, 6)).toBe('rope_fence');
    expect(r.inv.count('rope')).toBe(2);
    brk(2, 9);
    expect(r.world.getBlock(2, 9, 6)).toBe('air');
    expect(r.world.getBlock(5, 9, 6)).toBe('rope_fence');
    expect(tetherOf(r.world).anchor).toBeNull();
    expect(r.inv.count('rope')).toBe(3);
  });
});

describe('ロープを こわす（AC6・AC7。くいも ふくむ）', () => {
  for (const [name, x, y] of [['くい', 2, 15], ['まんなかの なわ', 3, 12], ['ロープだまり', 3, 9]] as const) {
    it(`${name}を こわしても くい・なわ・ロープだまり ぜんぶ 消えて、つかった 本数が もどる`, () => {
      const r = new Rig();
      cliff(r, 15);
      r.hold('rope', 1);
      r.rightClick();
      expect(r.inv.count('rope')).toBe(0);
      r.player.position = { x: 2.5, y: 15, z: 6.5 };
      r.hold('stone_pickaxe', 1);
      // ねらう 代わりに こわす 先を 直接 わたす（ねらいの 計算は ほかの テストが 見る）
      (r.dig as unknown as { breaker: { breakBlock(t: unknown, g: boolean): string } }).breaker.breakBlock({ block: { x, y, z: 6 }, id: at(r, x, y), face: { x: 0, y: 1, z: 0 }, place: { x, y: y + 1, z: 6 }, distance: 1 }, false);
      for (let yy = 9; yy <= 15; yy++) expect(at(r, 3, yy), `${yy}`).toBe('air');
      expect(at(r, 2, 15)).toBe('air');
      expect(r.inv.count('rope')).toBe(1);
    });
  }
});

describe('あさ（hemp）が でる（AC14・AC15）', () => {
  /** 目の 前（4,10,6）に id を おいて こわす を n 回。でた あさの 数 */
  const breakMany = (id: 'leaves' | 'stone' | 'grass' | 'flower_y', n: number): number => {
    const r = new Rig();
    r.hold('iron_pickaxe', 1);
    for (let i = 0; i < n; i++) {
      r.world.setBlock(4, 10, 6, id);
      r.step();
      r.breakAimed();
      r.step(7 * (i + 1)); // こわす 時こくを ずらす
    }
    return r.inv.count('hemp');
  };
  it('はっぱ・くさ・はなを 30 回 こわすと だいたい 1/3（3〜20 こ）', () => {
    for (const id of ['leaves', 'grass', 'flower_y'] as const) {
      const n = breakMany(id, 30);
      expect(n, id).toBeGreaterThanOrEqual(3);
      expect(n, id).toBeLessThanOrEqual(20);
    }
  });
  it('いしからは でない', () => {
    expect(breakMany('stone', 15)).toBe(0);
  });
});

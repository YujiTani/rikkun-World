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
  it('まえが がけで ない（たいら・かべ）: 足もとに くいを うって つなぐ（1 本。半径 10 マス）', () => {
    const flat = new Rig(); // y=8 の 床の 上（まえも 床）
    flat.hold('rope', 3);
    flat.rightClick();
    expect(flat.world.getBlock(2, 9, 6)).toBe('rope_stake');
    expect(flat.inv.count('rope')).toBe(2);
    expect(tetherOf(flat.world).anchor).toEqual({ x: 2, y: 9, z: 6 });
    expect(tetherOf(flat.world).len).toBe(10); // 版 4: 半径 10 マス（本数に よらない）
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

describe('つなぎ と ロープの さく（版 4: AC31〜AC36）', () => {
  /** (2,9,6) に くいを うって つなぐ（床は y=8 の いし）。ロープは count 本 のこる まえに 1 本 つかう */
  function tied(count: number) {
    const r = new Rig();
    r.hold('rope', count);
    r.rightClick();
    return r;
  }
  /** 床の 上面 (tx, 9, tz) を ねらって 右クリック（ねらいの 計算は ほかの テストが 見る ので、ねらった 先を 直接 わたす） */
  function placeAt(r: Rig, tx: number, tz: number) {
    const d = r.dig as unknown as { aim: { tgt: unknown }; placer: { tryPlace(): void } };
    d.aim.tgt = { block: { x: tx, y: 8, z: tz }, id: 'stone', face: { x: 0, y: 1, z: 0 }, place: { x: tx, y: 9, z: tz }, distance: 3 };
    d.placer.tryPlace();
  }
  const brk = (r: Rig, x: number, y: number, z: number) =>
    (r.dig as unknown as { breaker: { breakBlock(t: unknown, g: boolean): string } }).breaker.breakBlock({ block: { x, y, z }, id: r.world.getBlock(x, y, z), face: { x: 0, y: 1, z: 0 }, place: { x, y: y + 1, z }, distance: 1 }, false);
  const fences = (r: Rig) => [...r.world.blocks.entries()].filter(([, b]) => b === 'rope_fence').map(([k]) => k).sort();

  it('まっすぐ: くいの となりから ねらった 列まで さく。1〜10 マスは 1 本', () => {
    const r = tied(3);
    r.player.position = { x: 2.5, y: 9, z: 8.5 };
    placeAt(r, 6, 6);
    expect(fences(r)).toEqual(['3,9,6', '4,9,6', '5,9,6', '6,9,6']);
    expect(r.inv.count('rope')).toBe(1);
  });
  it('ななめ: さきに x、つぎに z の L 字（1 回 だけ まがる）', () => {
    const r = tied(3);
    r.player.position = { x: 2.5, y: 9, z: 2.5 };
    placeAt(r, 4, 8);
    expect(fences(r)).toEqual(['3,9,6', '4,9,6', '4,9,7', '4,9,8']);
  });
  it('おなじ 所を もう 1 回: その 上に 1 だん つむ（上を 歩ける）', () => {
    const r = tied(3);
    r.player.position = { x: 2.5, y: 9, z: 8.5 };
    placeAt(r, 4, 6);
    placeAt(r, 4, 6);
    expect(fences(r)).toEqual(['3,10,6', '3,9,6', '4,10,6', '4,9,6']);
    expect(r.inv.count('rope')).toBe(0);
  });
  it('さく 1 マスを こわすと その マス だけ 消える。ロープは 10 マス ごとに 1 本（1 マス目で 1 本）。くいを こわすと つなぎが きれて 1 本', () => {
    const r = tied(2);
    r.player.position = { x: 2.5, y: 9, z: 8.5 };
    placeAt(r, 6, 6);
    expect(r.inv.count('rope')).toBe(0);
    brk(r, 4, 9, 6);
    expect(fences(r)).toEqual(['3,9,6', '5,9,6', '6,9,6']);
    expect(r.inv.count('rope')).toBe(1);
    brk(r, 5, 9, 6);
    expect(r.inv.count('rope')).toBe(1);
    brk(r, 2, 9, 6);
    expect(tetherOf(r.world).anchor).toBeNull();
    expect(r.inv.count('rope')).toBe(2);
  });
});

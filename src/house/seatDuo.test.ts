import { describe, expect, it } from 'vitest';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import type { LockStatus, SpawnPoint, Vec3, YokaiWorld } from '../contracts';
import { ActionState, type Action } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from '../player/PlayerController';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { furnCells, type FurnBlockKind, type FurnRot } from '../world/blocks/houseBlocks';
import { SEAT_TUNING, SeatSystem } from './seat';

/**
 * COOP-1 5e（docs/design/COOP-1.md 1.15 §3.7 (f)・§8 の 5e の 行・§9.12・§10・AC143・AC144）: 2P の すわる・おふろの 先行テスト（赤）。
 * 大もとは「1P と 2P は すべて 同じ」。2P の いす・おふろは 1P と 同じ `SeatSystem` を もう 1 つ 作る（2P の 体・2P の 入力・2P の ハート）。
 * 式の コピーは しない。数（eyeDrop・bathHealEverySteps・bathHealAmount）は 表 `SEAT_TUNING` から 読む。時間では 待たず ステップの 数で 進める。
 *
 * ---- 実装への 約束（developer が 作る 名前・形。置き場は src/house/seat.ts）----
 *   SeatDeps に 省ける 欄を 1 つ 足す（ふさがりの 口。§8 5e）:
 *     occupied?: (x: number, y: number, z: number) => boolean
 *       もう 1 人が その マス（ブロック）に すわって いる／入って いる か。`use(x, y, z)` は true の マスには すわらず、何も かえず false を 返す
 *       （`seat()` は null の まま・体も 動かさない・音も 出さない）。渡さなければ 今の 動き（1 人の ときは 渡さない。AC144）。
 *   SeatSystem に 2 つ 足す:
 *     holds(x: number, y: number, z: number): boolean   今 すわって いる／入って いる マスが (x, y, z) なら true（他の 人の `occupied` が これを 呼ぶ）
 *     dismiss(): void   外から 立たせる（2P が やめた とき。その ステップで すわりを 消し、自分が 書いた `motion` の 欄だけ もどす。すわって いなければ 何も しない）
 *   配線（テストは しない）: game/wire/seat.ts の `wireSeat` が `seatFor(who: 1 | 2): SeatSystem | null`（2P が いなければ null）と
 *     `occupied(x, y, z, except: 1 | 2): boolean`（except でない 方の `holds`）を 返す。2P の SeatSystem は 2P の 体・2P の ActionState・2P の PlayerCombatImpl で 作る。
 *     湯気（BathSteam）は 人ごとに 1 つ（2 人が 別の おふろに 入れば 2 つ）。2P の カメラの 目は `p2CameraPose` に 渡す（src/duo/p2Pose.test.ts〈5e〉）。
 *     同じ ステップに 2 人が 同じ マスを ねらったら 1P の `use` が 先（1P → 2P の 順で 呼ぶ）。
 */

const FLOOR = 4;
const FEET = FLOOR + 1;
const SIZE = 24;
const N = SEAT_TUNING.bathHealEverySteps;

const NO_YOKAI: YokaiWorld = { list: () => [], raycast: () => null, damage: () => {}, occupies: () => false, drainEvents: () => [] };
const near = (a: Vec3, b: Vec3, eps = 1e-6): boolean => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;

/** 1 人ぶんの 体・入力・ハート（1P も 2P も 同じ 作り） */
class Person {
  actions = new ActionState();
  lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  readonly controller: PlayerController;
  readonly combat: PlayerCombatImpl;
  seat!: SeatSystem;
  constructor(
    readonly world: ArrayVoxelWorld,
    start: SpawnPoint,
  ) {
    this.controller = new PlayerController(world, this.actions, { consume: () => ({ dx: 0, dy: 0 }) }, this.lock, () => start);
    this.combat = new PlayerCombatImpl({
      world,
      player: {
        get: () => this.controller.state,
        set: (v) => {
          if (v.velocity) Object.assign(this.controller.state.velocity, v.velocity);
        },
      },
      inventory: new InventoryImpl(),
      yokai: () => NO_YOKAI,
      spawn: () => start,
    });
  }
  tap(a: Action): void {
    this.actions.press(a);
    this.step();
    this.actions.release(a);
  }
  step(): void {
    this.seat.update();
    this.controller.update(1 / 60);
    this.actions.endFrame();
  }
  pos(): Vec3 {
    const p = this.controller.state.position;
    return { x: p.x, y: p.y, z: p.z };
  }
}

/** 同じ 世界に 1P と 2P。ふさがりは おたがいの `holds` で 見る（wireSeat の `occupied(x, y, z, except)` と 同じ 考え方） */
class Duo {
  world = new ArrayVoxelWorld({ x: SIZE, y: 16, z: SIZE });
  p1: Person;
  p2: Person;
  constructor() {
    this.world.fill(0, 0, 0, SIZE - 1, FLOOR, SIZE - 1, 'stone');
    this.p1 = new Person(this.world, { x: 6.5, y: FEET, z: 6.5, yawDeg: 0, pitchDeg: 0 });
    this.p2 = new Person(this.world, { x: 9.5, y: FEET, z: 6.5, yawDeg: 0, pitchDeg: 0 });
    this.p1.seat = new SeatSystem({ world: this.world, controller: this.p1.controller, actions: this.p1.actions, combat: this.p1.combat, occupied: (x, y, z) => this.p2.seat.holds(x, y, z) });
    this.p2.seat = new SeatSystem({ world: this.world, controller: this.p2.controller, actions: this.p2.actions, combat: this.p2.combat, occupied: (x, y, z) => this.p1.seat.holds(x, y, z) });
    this.tick(3);
  }
  /** 1P → 2P の 順に 1 ステップ */
  tick(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.p1.step();
      this.p2.step();
    }
  }
  put(kind: FurnBlockKind, rot: FurnRot, ax: number, az: number): Array<{ x: number; z: number; id: string }> {
    const cells = furnCells(kind, rot, ax, az);
    for (const c of cells) this.world.setBlock(c.x, FEET, c.z, c.id);
    return cells;
  }
}

describe('AC143: 2P が いす・まるいすに すわる（1P と 同じ 決まり）', () => {
  for (const kind of ['chair', 'stool'] as const) {
    it(`${kind}: 2P の 体だけ 止まり、目が eyeDrop さがるのは 2P だけ。1P は 歩ける`, () => {
      const d = new Duo();
      const [cell] = d.put(kind, 0, 12, 12);
      const p1Before = d.p1.pos();
      expect(d.p2.seat.use(cell!.x, FEET, cell!.z)).toBe(true);
      const s = d.p2.seat.seat()!;
      expect(s.kind).toBe('sit');
      expect(s.block).toEqual({ x: cell!.x, y: FEET, z: cell!.z });
      expect(d.p1.seat.seat(), '1P は すわって いない').toBeNull();
      expect(d.p2.seat.eyeDrop()).toBe(SEAT_TUNING.eyeDrop);
      expect(d.p1.seat.eyeDrop(), '1P の 目は かわらない').toBe(0);
      d.p1.actions.press('moveForward');
      d.tick(N);
      expect(near(d.p2.pos(), s.position), '2P の 体は 止まって いる').toBe(true);
      expect(d.p1.pos().z, '1P は 前へ 進めた').toBeLessThan(p1Before.z - 0.5);
      expect(d.p2.seat.seat(), 'まだ すわって いる').not.toBeNull();
    });
  }

  it('2P の 歩く・ジャンプで 立つ。すわった とき 押して いた ボタンは いったん はなす まで 立たない（1P と 同じ）', () => {
    for (const key of ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump'] as const) {
      const d = new Duo();
      const [cell] = d.put('chair', 0, 12, 12);
      d.p2.seat.use(cell!.x, FEET, cell!.z);
      d.tick(5);
      expect(d.p2.seat.seat(), `${key} の 前`).not.toBeNull();
      d.p2.tap(key);
      expect(d.p2.seat.seat(), `${key} で 立つ`).toBeNull();
      expect(d.p2.seat.eyeDrop(), '立てば 目も もどる').toBe(0);
    }
    const d = new Duo();
    const [cell] = d.put('chair', 0, 12, 12);
    d.p2.actions.press('moveForward'); // すわる 前から 押して いた
    d.tick(2); // 押した ステップ（wasPressed）は すぎた あと
    d.p2.seat.use(cell!.x, FEET, cell!.z);
    d.tick(10);
    expect(d.p2.seat.seat(), '押しつづけて いる あいだは 立たない').not.toBeNull();
    d.p2.actions.release('moveForward');
    d.tick(2);
    d.p2.tap('moveForward');
    expect(d.p2.seat.seat(), 'はなして 押しなおせば 立つ').toBeNull();
  });

  it('2P が ひるむ・倒れる と 立つ（1P の 倒れたと 同じ）。1P が すわって いれば 1P は そのまま', () => {
    const d = new Duo();
    const [c1] = d.put('chair', 0, 12, 12);
    const [c2] = d.put('stool', 0, 15, 12);
    d.p1.combat.setHp(10);
    d.p2.combat.setHp(10);
    d.p1.seat.use(c1!.x, FEET, c1!.z);
    d.p2.seat.use(c2!.x, FEET, c2!.z);
    d.tick(5);
    expect(d.p2.combat.debugDamage(1, 'karakasa')).toBe(true);
    d.tick();
    expect(d.p2.seat.seat(), '2P は 立った').toBeNull();
    expect(d.p1.seat.seat(), '1P は すわった まま').not.toBeNull();
  });

  it('倒れる（combat.dead?.() の 道。ひるみとは べつ）で 立つ。ひるまなくても dead だけで 立つ', () => {
    const d = new Duo();
    const [cell] = d.put('chair', 0, 12, 12);
    let dead = false;
    const fake = { flinching: () => false, heal: () => 0, dead: () => dead };
    const seat = new SeatSystem({ world: d.world, controller: d.p2.controller, actions: d.p2.actions, combat: fake });
    d.p2.seat = seat;
    seat.use(cell!.x, FEET, cell!.z);
    d.tick(5);
    expect(seat.seat(), '倒れる 前').not.toBeNull();
    dead = true;
    d.tick();
    expect(seat.seat(), 'dead で 立つ').toBeNull();
    expect(seat.eyeDrop()).toBe(0);
  });

  it('dismiss(): すわって いれば その場で 立ち、2P の 体が また 動ける。すわって いなければ 何も しない（2P が やめた とき）', () => {
    const d = new Duo();
    const [cell] = d.put('chair', 0, 12, 12);
    d.p2.seat.dismiss(); // すわって いない: 何も おきない
    expect(d.p2.seat.seat()).toBeNull();
    d.p2.seat.use(cell!.x, FEET, cell!.z);
    d.tick(3);
    expect(d.p2.seat.seat()).not.toBeNull();
    d.p2.seat.dismiss();
    expect(d.p2.seat.seat(), 'その ステップで 消える').toBeNull();
    expect(d.p2.seat.eyeDrop()).toBe(0);
    const z0 = d.p2.pos().z;
    d.p2.actions.press('moveForward');
    d.tick(30);
    expect(d.p2.pos().z, '立てば 歩ける（motion を もどした）').toBeLessThan(z0 - 0.5);
  });
});

describe('AC143: 2P が おふろに 入る', () => {
  it('2P の ハートだけ bathHealEverySteps ごとに bathHealAmount もどる。1P の ハートは かわらない', () => {
    const d = new Duo();
    const [cell] = d.put('ofuro', 0, 12, 12);
    d.p1.combat.setHp(3);
    d.p2.combat.setHp(2);
    expect(d.p2.seat.use(cell!.x, FEET, cell!.z)).toBe(true);
    expect(d.p2.seat.seat()!.kind).toBe('bath');
    d.tick(N - 1);
    expect(d.p2.combat.hp(), `${N - 1} ステップ`).toBe(2);
    d.tick();
    expect(d.p2.combat.hp(), `${N} ステップ`).toBe(2 + SEAT_TUNING.bathHealAmount);
    d.tick(N);
    expect(d.p2.combat.hp(), `${2 * N} ステップ`).toBe(2 + 2 * SEAT_TUNING.bathHealAmount);
    expect(d.p1.combat.hp(), '1P の ハートは そのまま').toBe(3);
  });

  it('1P が 入って いても 2P の ハートは ふえない（人ごとに 数える）', () => {
    const d = new Duo();
    const [cell] = d.put('ofuro', 0, 12, 12);
    d.p1.combat.setHp(2);
    d.p2.combat.setHp(2);
    d.p1.seat.use(cell!.x, FEET, cell!.z);
    d.tick(2 * N);
    expect(d.p1.combat.hp()).toBe(2 + 2 * SEAT_TUNING.bathHealAmount);
    expect(d.p2.combat.hp()).toBe(2);
  });

  it('2 人が 別の おふろに 入れば 湯気の 出どころ（bathSpot）が 2 つ。それぞれ 自分の お湯の 面', () => {
    const d = new Duo();
    const [a] = d.put('ofuro', 0, 12, 12);
    const [b] = d.put('ofuro', 0, 16, 12);
    d.p1.seat.use(a!.x, FEET, a!.z);
    d.p2.seat.use(b!.x, FEET, b!.z);
    const s1 = d.p1.seat.bathSpot();
    const s2 = d.p2.seat.bathSpot();
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(s1!.x).toBeCloseTo(a!.x + 0.5, 6);
    expect(s2!.x).toBeCloseTo(b!.x + 0.5, 6);
    expect(s1).not.toBe(s2);
  });
});

describe('AC143・§10: 1 マスに 1 人（ふさがり）', () => {
  it('1P が すわって いる マスに 2P が use しても 何も おきない（seat は null・体も 動かない）', () => {
    const d = new Duo();
    const [cell] = d.put('chair', 0, 12, 12);
    expect(d.p1.seat.use(cell!.x, FEET, cell!.z)).toBe(true);
    const before = d.p2.pos();
    expect(d.p2.seat.use(cell!.x, FEET, cell!.z)).toBe(false);
    expect(d.p2.seat.seat()).toBeNull();
    expect(d.p2.seat.eyeDrop()).toBe(0);
    d.tick(5);
    expect(near(d.p2.pos(), before), '2P の 体は そのまま').toBe(true);
    expect(d.p1.seat.seat()!.block).toEqual({ x: cell!.x, y: FEET, z: cell!.z });
  });

  it('同じ ステップに 2 人が 同じ いすに use したら 1P（先に 呼ぶ 方）が すわる', () => {
    const d = new Duo();
    const [cell] = d.put('chair', 0, 12, 12);
    const r1 = d.p1.seat.use(cell!.x, FEET, cell!.z);
    const r2 = d.p2.seat.use(cell!.x, FEET, cell!.z);
    expect([r1, r2]).toEqual([true, false]);
    expect(d.p1.seat.seat()).not.toBeNull();
    expect(d.p2.seat.seat()).toBeNull();
  });

  it('2P が すわって いる おふろに 1P が use しても 何も おきない', () => {
    const d = new Duo();
    const [cell] = d.put('ofuro', 0, 12, 12);
    d.p2.seat.use(cell!.x, FEET, cell!.z);
    expect(d.p1.seat.use(cell!.x, FEET, cell!.z)).toBe(false);
    expect(d.p1.seat.seat()).toBeNull();
  });

  it('先の 人が 立てば、もう 1 人は その マスに すわれる', () => {
    const d = new Duo();
    const [cell] = d.put('chair', 0, 12, 12);
    d.p1.seat.use(cell!.x, FEET, cell!.z);
    d.tick(3);
    d.p1.tap('moveBack');
    expect(d.p1.seat.seat()).toBeNull();
    expect(d.p2.seat.use(cell!.x, FEET, cell!.z)).toBe(true);
    expect(d.p2.seat.seat()).not.toBeNull();
  });

  it('別の マスなら 2 人とも すわれる（ふさがるのは すわって いる マスだけ）', () => {
    const d = new Duo();
    const [a] = d.put('chair', 0, 12, 12);
    const [b] = d.put('chair', 0, 15, 12);
    expect(d.p1.seat.use(a!.x, FEET, a!.z)).toBe(true);
    expect(d.p2.seat.use(b!.x, FEET, b!.z)).toBe(true);
    expect(d.p1.seat.seat()!.block.x).toBe(a!.x);
    expect(d.p2.seat.seat()!.block.x).toBe(b!.x);
  });

  it('おふろは 2 マス: 1P が 片方の マスに 入って いても、2P は もう 片方の マスに 入れる（1 マスに 1 人。ふさがるのは 入って いる マスだけ）', () => {
    for (const [first, second] of [[0, 1], [1, 0]] as const) {
      const d = new Duo();
      const cells = d.put('ofuro', 0, 12, 12);
      expect(cells.length).toBeGreaterThanOrEqual(2);
      const a = cells[first]!;
      const b = cells[second]!;
      expect(d.p1.seat.use(a.x, FEET, a.z)).toBe(true);
      expect(d.p2.seat.use(b.x, FEET, b.z), `1P が マス ${first} → 2P は マス ${second}`).toBe(true);
      expect(d.p1.seat.seat()!.block).toEqual({ x: a.x, y: FEET, z: a.z });
      expect(d.p2.seat.seat()!.block).toEqual({ x: b.x, y: FEET, z: b.z });
    }
  });

  it('おふろの マス 0 に 1P が 入って いる とき、2P が マス 0 を 押しても 取れない（マス 1 なら 入れる）', () => {
    const d = new Duo();
    const cells = d.put('ofuro', 0, 12, 12);
    const c0 = cells[0]!;
    const c1 = cells[1]!;
    d.p1.seat.use(c0.x, FEET, c0.z);
    expect(d.p2.seat.use(c0.x, FEET, c0.z)).toBe(false);
    expect(d.p2.seat.seat()).toBeNull();
    expect(d.p2.seat.use(c1.x, FEET, c1.z)).toBe(true);
  });

  it('holds(): すわって いる マスだけ true。立てば false', () => {
    const d = new Duo();
    const [cell] = d.put('chair', 0, 12, 12);
    expect(d.p2.seat.holds(cell!.x, FEET, cell!.z)).toBe(false);
    d.p2.seat.use(cell!.x, FEET, cell!.z);
    expect(d.p2.seat.holds(cell!.x, FEET, cell!.z)).toBe(true);
    expect(d.p2.seat.holds(cell!.x + 1, FEET, cell!.z)).toBe(false);
    expect(d.p2.seat.holds(cell!.x, FEET + 1, cell!.z)).toBe(false);
    d.p2.seat.dismiss();
    expect(d.p2.seat.holds(cell!.x, FEET, cell!.z)).toBe(false);
  });
});

describe('AC144: 1 人の とき（occupied を 渡さない）は 今の まま', () => {
  it('occupied なしの SeatSystem は 何度 use しても 同じ マスに すわれる（今の 動き）', () => {
    const world = new ArrayVoxelWorld({ x: SIZE, y: 16, z: SIZE });
    world.fill(0, 0, 0, SIZE - 1, FLOOR, SIZE - 1, 'stone');
    const p = new Person(world, { x: 6.5, y: FEET, z: 6.5, yawDeg: 0, pitchDeg: 0 });
    p.seat = new SeatSystem({ world, controller: p.controller, actions: p.actions, combat: p.combat });
    const cells = furnCells('chair', 0, 12, 12);
    for (const c of cells) world.setBlock(c.x, FEET, c.z, c.id);
    const [cell] = cells;
    expect(p.seat.use(cell!.x, FEET, cell!.z)).toBe(true);
    expect(p.seat.use(cell!.x, FEET, cell!.z), 'もう すわって いる マスは true（今の 動き）').toBe(true);
    expect(p.seat.seat()!.kind).toBe('sit');
  });
});

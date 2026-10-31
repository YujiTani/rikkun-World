import { describe, expect, it } from 'vitest';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import type { BlockId, LockStatus, SpawnPoint, Vec3, YokaiWorld } from '../contracts';
import { ActionState, type Action } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from '../player/PlayerController';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { FURN_BLOCK_KINDS, furnCells, type FurnBlockKind, type FurnRot } from '../world/blocks/houseBlocks';
import { SEAT_TUNING, SeatSystem } from './seat';

/**
 * HOUSE-1D（#341。仕様 docs/design/HOUSE-1.md §2.12・AC28）: いす・まるいすで 座る／おふろに 入る。
 * 座標・向き・回復の 数は 表（SEAT_TUNING）と 家具の 式（furnCells）から 読む。時間では 待たず ステップの 数で 進める。
 *
 * 約束（票 docs/tickets/HOUSE-1D.md「テストの 準備」。変えるなら この ファイルと 票だけ 直す）:
 *   new SeatSystem({ world, controller, actions, combat })
 *     controller ＝ 本物の PlayerController（state・motion を 読み書きして 位置を 止める）／combat ＝ 本物の PlayerCombatImpl（hp・maxHp・heal・flinching）
 *   use(x, y, z): boolean  ブロック (x, y, z) への 右クリック。座れる／入れる 家具なら 座って true。そうでなければ 何も かえず false
 *   seat(): { kind: 'sit' | 'bath'; block: Vec3; position: Vec3 } | null   座って いる 間だけ。立つと null
 *   update(): void  1 ステップごとに、プレイヤーの 更新（controller.update）の 前に 呼ぶ
 *   SEAT_TUNING { bathHealEverySteps, bathHealAmount }  おふろの 回復（1 か所の 表）
 */

const FLOOR = 4; // 床の ブロックの y（足もとは FLOOR + 1）
const FEET = FLOOR + 1;
const SIZE = 24;
const START: SpawnPoint = { x: 6.5, y: FEET, z: 6.5, yawDeg: 0, pitchDeg: 0 };

const NO_YOKAI: YokaiWorld = { list: () => [], raycast: () => null, damage: () => {}, occupies: () => false, drainEvents: () => [] };

class Rig {
  world = new ArrayVoxelWorld({ x: SIZE, y: 16, z: SIZE });
  actions = new ActionState();
  lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  controller = new PlayerController(this.world, this.actions, { consume: () => ({ dx: 0, dy: 0 }) }, this.lock, () => START);
  combat = new PlayerCombatImpl({
    world: this.world,
    player: {
      get: () => this.controller.state,
      set: (v) => {
        if (v.velocity) Object.assign(this.controller.state.velocity, v.velocity);
      },
    },
    inventory: new InventoryImpl(),
    yokai: () => NO_YOKAI,
    spawn: () => START,
  });
  seat = new SeatSystem({ world: this.world, controller: this.controller, actions: this.actions, combat: this.combat });

  constructor() {
    this.world.fill(0, 0, 0, SIZE - 1, FLOOR, SIZE - 1, 'stone');
    this.tick(3); // 床に 立って 落ちつく
  }
  /** プレイヤーの 更新を 1 ステップずつ（座る 係が 先、そのあと プレイヤー） */
  tick(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.seat.update();
      this.controller.update(1 / 60);
      this.actions.endFrame();
    }
  }
  /** 家具を 置く（anchor ＝ 北西の すみ）。置いた マスの 一覧 */
  put(kind: FurnBlockKind, rot: FurnRot, ax = 12, az = 12): Array<{ x: number; z: number; id: string }> {
    const cells = furnCells(kind, rot, ax, az);
    for (const c of cells) this.world.setBlock(c.x, FEET, c.z, c.id);
    return cells;
  }
  /** キーを 1 ステップだけ 押す（押して はなす 前に 1 ステップ 進める） */
  tap(a: Action): void {
    this.actions.press(a);
    this.tick();
    this.actions.release(a);
  }
  pos(): Vec3 {
    const p = this.controller.state.position;
    return { x: p.x, y: p.y, z: p.z };
  }
}

const ROTS: readonly FurnRot[] = [0, 1, 2, 3];
const SIT_KINDS = ['chair', 'stool'] as const satisfies readonly FurnBlockKind[];
/** 座れる／入れる 家具の しゅるい。これいがいの 家具は はたらきなし（足し忘れが ないよう、残りは 表から 数える） */
const NOT_SEAT_KINDS = FURN_BLOCK_KINDS.filter((k) => k !== 'chair' && k !== 'stool' && k !== 'ofuro');

const near = (a: Vec3, b: Vec3, eps = 1e-6): boolean => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;
const angDiff = (a: number, b: number): number => Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);
/** いすの 前（座る 人が 向く 向き）の yaw。rot 0 ＝ 前が 南（+z）→ 西 → 北 → 東（上から 見て 時計まわり） */
const FRONT_YAW: Record<FurnRot, number> = { 0: 180, 1: 270, 2: 0, 3: 90 };
const N = SEAT_TUNING.bathHealEverySteps;

describe('表（AC28: おふろは 60 ステップ〔1 秒〕に 体力 1）', () => {
  it('60 ステップに 1', () => {
    expect(SEAT_TUNING.bathHealEverySteps).toBe(60);
    expect(SEAT_TUNING.bathHealAmount).toBe(1);
  });
});

describe('座る・入る（AC28）', () => {
  for (const kind of SIT_KINDS) {
    for (const rot of ROTS) {
      it(`${kind}（向き ${rot}）: 右クリックで マスの まん中に 座る。高さは そのマスの 中。いすの 向きを 向く`, () => {
        const r = new Rig();
        const [cell] = r.put(kind, rot);
        expect(r.seat.seat(), '座る 前').toBeNull();
        expect(r.seat.use(cell!.x, FEET, cell!.z)).toBe(true);
        const s = r.seat.seat()!;
        expect(s.kind).toBe('sit');
        expect(s.block).toEqual({ x: cell!.x, y: FEET, z: cell!.z });
        expect(s.position.x).toBeCloseTo(cell!.x + 0.5, 6);
        expect(s.position.z).toBeCloseTo(cell!.z + 0.5, 6);
        expect(s.position.y, '座面の 高さ（そのマスの 中）').toBeGreaterThanOrEqual(FEET);
        expect(s.position.y).toBeLessThan(FEET + 1);
        expect(near(r.pos(), s.position), 'プレイヤーも そこに いる').toBe(true);
        if (kind === 'chair') expect(angDiff(r.controller.state.facingDeg, FRONT_YAW[rot]), `向き ${rot} の 前`).toBeLessThan(1e-6);
      });
    }
  }

  it('おふろ（2 マス）: どの 向きでも どちらの マスを ねらっても 入れる（同じ はたらき）。位置は おふろの マスの まん中', () => {
    for (const rot of ROTS) {
      const probe = new Rig();
      const cells = probe.put('ofuro', rot);
      expect(cells.length, '2 マスの 家具').toBeGreaterThanOrEqual(2);
      for (const click of cells) {
        const r = new Rig();
        r.put('ofuro', rot);
        expect(r.seat.use(click.x, FEET, click.z), `向き ${rot} (${click.x},${click.z})`).toBe(true);
        const s = r.seat.seat()!;
        expect(s.kind).toBe('bath');
        expect(s.block).toEqual({ x: click.x, y: FEET, z: click.z });
        expect(
          cells.some((c) => Math.abs(s.position.x - (c.x + 0.5)) < 1e-6 && Math.abs(s.position.z - (c.z + 0.5)) < 1e-6),
          '位置は おふろの どれかの マスの まん中',
        ).toBe(true);
        expect(s.position.y).toBeGreaterThanOrEqual(FEET);
        expect(s.position.y).toBeLessThan(FEET + 1);
        expect(near(r.pos(), s.position)).toBe(true);
      }
    }
  });

  it('座れない 家具・ブロック（テーブル・あんどん・ほんだな・はにわ・石 …）は 何も おきない', () => {
    const others: Array<{ label: string; kind: FurnBlockKind | null }> = [...NOT_SEAT_KINDS.map((k) => ({ label: k as string, kind: k as FurnBlockKind | null })), { label: 'haniwa', kind: null }, { label: 'stone', kind: null }];
    for (const o of others) {
      for (const rot of ROTS) {
        const r = new Rig();
        const before = r.pos();
        let cells: Array<{ x: number; z: number; id: string }> = [{ x: 12, z: 12, id: o.label }];
        if (o.kind) cells = r.put(o.kind, rot);
        else r.world.setBlock(12, FEET, 12, o.label as BlockId);
        for (const c of cells) {
          expect(r.seat.use(c.x, FEET, c.z), `${o.label} 向き ${rot} ${c.id}`).toBe(false);
          expect(r.seat.seat(), `${o.label} ${c.id}`).toBeNull();
        }
        r.tick(3);
        expect(near(r.pos(), before), `${o.label}: プレイヤーは 動かない（床の 上のまま）`).toBe(true);
      }
    }
  });

  it('何も ない マスへ 右クリックしても 座らない', () => {
    const r = new Rig();
    expect(r.seat.use(12, FEET, 12)).toBe(false);
    expect(r.seat.seat()).toBeNull();
  });
});

describe('座って いる 間（AC28: 移動キーを 1 ステップ 押す まで 位置が 変わらない）', () => {
  const SEATS = [
    { label: 'いす', kind: 'chair', rot: 2 },
    { label: 'まるいす', kind: 'stool', rot: 0 },
    { label: 'おふろ', kind: 'ofuro', rot: 1 },
  ] as const;

  for (const s of SEATS) {
    it(`${s.label}: キーを 押さない 間は 何ステップ たっても 位置・向きが かわらない（重力・ぶつかりでも 動かない）`, () => {
      const r = new Rig();
      const [cell] = r.put(s.kind, s.rot);
      r.seat.use(cell!.x, FEET, cell!.z);
      const at = r.seat.seat()!.position;
      const facing = r.controller.state.facingDeg;
      for (let i = 0; i < 4; i++) {
        r.tick(N);
        expect(r.seat.seat(), `${(i + 1) * N} ステップ後も 座って いる`).not.toBeNull();
        expect(near(r.pos(), at), `${(i + 1) * N} ステップ後 位置`).toBe(true);
        expect(near(r.seat.seat()!.position, at), 'seat() の 位置').toBe(true);
        expect(angDiff(r.controller.state.facingDeg, facing), '向き').toBeLessThan(1e-6);
        expect(r.controller.state.velocity.x === 0 && r.controller.state.velocity.z === 0, '速さ').toBe(true);
      }
    });

    it(`${s.label}: 移動キー（前・うしろ・左・右）・ジャンプを 1 ステップ 押すと 立つ。押して すぐ はなしても 立つ`, () => {
      const keys: Action[] = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump'];
      for (const key of keys) {
        const r = new Rig();
        const [cell] = r.put(s.kind, s.rot);
        r.seat.use(cell!.x, FEET, cell!.z);
        r.tick(5);
        expect(r.seat.seat(), `${key} の 前`).not.toBeNull();
        r.tap(key);
        expect(r.seat.seat(), `${key} を 1 ステップ 押した`).toBeNull();
        // 押して はなすまでが 1 ステップの 間でも（そのステップの 前に 押して はなす）立つ
        const q = new Rig();
        const [c2] = q.put(s.kind, s.rot);
        q.seat.use(c2!.x, FEET, c2!.z);
        q.actions.press(key);
        q.actions.release(key);
        q.tick();
        expect(q.seat.seat(), `${key} を ちょん（押して すぐ はなす）`).toBeNull();
      }
    });
  }

  it('立つと また 動ける。もう 1 回 右クリックで 座れる', () => {
    const r = new Rig();
    const [cell] = r.put('chair', 0);
    r.seat.use(cell!.x, FEET, cell!.z);
    const at = r.seat.seat()!.position;
    r.tap('moveForward');
    expect(r.seat.seat()).toBeNull();
    r.actions.press('moveForward');
    r.tick(30);
    r.actions.release('moveForward');
    const p = r.pos();
    expect(Math.hypot(p.x - at.x, p.z - at.z), '歩いて いける').toBeGreaterThan(0.5);
    r.tick(20);
    expect(r.seat.seat(), '歩いて いる 間は 座らない').toBeNull();
    // もどって 座り なおせる
    expect(r.seat.use(cell!.x, FEET, cell!.z)).toBe(true);
    expect(r.seat.seat()!.kind).toBe('sit');
  });

  it('座る きっかけの 右クリックや ほかの キー（ホットバーなど）では 立たない', () => {
    const r = new Rig();
    const [cell] = r.put('chair', 1);
    r.seat.use(cell!.x, FEET, cell!.z);
    r.tap('secondary');
    r.tap('hotbar1');
    r.tick(3);
    expect(r.seat.seat()).not.toBeNull();
  });

  it('いす・まるいすは 体力を ふやさない', () => {
    for (const kind of SIT_KINDS) {
      const r = new Rig();
      const [cell] = r.put(kind, 0);
      r.combat.setHp(5);
      r.seat.use(cell!.x, FEET, cell!.z);
      r.tick(3 * N);
      expect(r.combat.hp(), kind).toBe(5);
    }
  });
});

describe('おふろの 回復（AC28: 60 ステップごとに 1・上限で 止まる・出ると 止まる）', () => {
  const bath = (hp: number) => {
    const r = new Rig();
    const [cell] = r.put('ofuro', 0);
    r.combat.setHp(hp);
    r.seat.use(cell!.x, FEET, cell!.z);
    return r;
  };

  it('体力 2 で 入ると、60 ステップめに 3、120 ステップめに 4（その あいだは かわらない）', () => {
    const r = bath(2);
    r.tick(N - 1);
    expect(r.combat.hp(), `${N - 1} ステップ`).toBe(2);
    r.tick(1);
    expect(r.combat.hp(), `${N} ステップ`).toBe(2 + SEAT_TUNING.bathHealAmount);
    r.tick(N - 1);
    expect(r.combat.hp(), `${2 * N - 1} ステップ`).toBe(2 + SEAT_TUNING.bathHealAmount);
    r.tick(1);
    expect(r.combat.hp(), `${2 * N} ステップ`).toBe(2 + 2 * SEAT_TUNING.bathHealAmount);
  });

  it('上限で 止まる（いっぱいの 体力を こえない・入ったままでも）', () => {
    const r = bath(new Rig().combat.maxHp() - 1);
    const max = r.combat.maxHp();
    r.tick(N);
    expect(r.combat.hp()).toBe(max);
    r.tick(5 * N);
    expect(r.combat.hp(), 'いっぱいの まま').toBe(max);
    expect(r.seat.seat(), '入ったまま').not.toBeNull();
  });

  it('体力が いっぱいでも 入れる', () => {
    const r = bath(new Rig().combat.maxHp());
    expect(r.seat.seat()!.kind).toBe('bath');
  });

  it('移動キー・ジャンプで 出ると それから ふえない', () => {
    for (const key of ['moveRight', 'jump'] as const) {
      const r = bath(2);
      r.tick(N);
      expect(r.combat.hp()).toBe(2 + SEAT_TUNING.bathHealAmount);
      r.tap(key);
      expect(r.seat.seat(), key).toBeNull();
      const hp = r.combat.hp();
      r.tick(5 * N);
      expect(r.combat.hp(), `${key} で 出た あと`).toBe(hp);
    }
  });

  it('入りなおすと また 回復する', () => {
    const r = bath(2);
    r.tap('moveForward');
    expect(r.seat.seat()).toBeNull();
    // もう 1 回 右クリック（おふろは 12, 12 から 2 マス）
    expect(r.seat.use(12, FEET, 12)).toBe(true);
    const before = r.combat.hp();
    r.tick(N);
    expect(r.combat.hp()).toBe(before + SEAT_TUNING.bathHealAmount);
  });
});

describe('当たったら 立つ（決定 3: 妖怪に 当たったら ふつうの のけぞり）', () => {
  for (const s of [
    { label: 'いす', kind: 'chair' },
    { label: 'まるいす', kind: 'stool' },
    { label: 'おふろ', kind: 'ofuro' },
  ] as const) {
    it(`${s.label}: 妖怪に 当たると 次の ステップで 立つ`, () => {
      const r = new Rig();
      const [cell] = r.put(s.kind, 0);
      r.combat.setHp(10);
      r.seat.use(cell!.x, FEET, cell!.z);
      r.tick(5);
      expect(r.seat.seat(), '当たる 前').not.toBeNull();
      expect(r.combat.debugDamage(1, 'karakasa'), '当たった').toBe(true);
      r.tick();
      expect(r.seat.seat(), '立った').toBeNull();
    });
  }

  it('おふろで 当たって 出ると もう 回復しない', () => {
    const r = new Rig();
    const [cell] = r.put('ofuro', 0);
    r.combat.setHp(10);
    r.seat.use(cell!.x, FEET, cell!.z);
    r.combat.debugDamage(1, 'karakasa');
    r.tick();
    const hp = r.combat.hp();
    r.tick(3 * N);
    expect(r.combat.hp()).toBe(hp);
  });
});
